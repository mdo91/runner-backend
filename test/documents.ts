// A serialized, rollback-capable Firestore adapter for exercising repository transactions.
export class Documents {
  data = new Map<string, any>();
  private tail = Promise.resolve();
  private snapshot(path: string, data = this.data) {
    return {
      id: path.split("/").at(-1),
      ref: this.doc(path),
      exists: data.has(path),
      data: () => data.get(path),
    };
  }
  doc(path: string): any {
    return {
      path,
      id: path.split("/").at(-1),
      collection: (name: string) => this.collection(path + "/" + name),
      get: async () => this.snapshot(path),
      set: async (value: any, options?: any) =>
        this.set(this.data, path, value, options),
      delete: async () => {
        this.data.delete(path);
      },
    };
  }
  collection(path: string): any {
    const query = (
      cursor?: string,
      limit = Infinity,
      filter?: { field: string; value: any },
    ): any => ({
      path,
      doc: (id: string) => this.doc(path + "/" + id),
      orderBy: () => query(cursor, limit, filter),
      startAfter: (value: string) => query(value, limit, filter),
      limit: (n: number) => query(cursor, n, filter),
      where: (field: string, _op: string, value: any) =>
        query(cursor, limit, { field, value }),
      get: async () => ({
        docs: [...this.data.keys()]
          .filter(
            (k) =>
              k.startsWith(path + "/") &&
              k.slice(path.length + 1).split("/").length === 1 &&
              (!cursor || k.slice(path.length + 1) > cursor) &&
              (!filter || this.data.get(k)?.[filter.field] === filter.value),
          )
          .sort()
          .slice(0, limit)
          .map((k) => this.snapshot(k)),
      }),
    });
    return query();
  }
  private set(data: Map<string, any>, path: string, value: any, options?: any) {
    const old = options?.merge ? (data.get(path) ?? {}) : {},
      next = { ...old, ...value };
    if (value.reservedTRY?.operand)
      next.reservedTRY = (old.reservedTRY ?? 0) + value.reservedTRY.operand;
    data.set(path, next);
  }
  async runTransaction<T>(body: (tx: any) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((r) => (release = r));
    await previous;
    const staged = new Map(this.data);
    let wrote = false;
    const read = (ref: any) => {
      if (wrote) throw new Error("Firestore requires reads before writes");
      return this.snapshot(ref.path, staged);
    };
    const tx = {
      get: async (ref: any) => read(ref),
      getAll: async (...refs: any[]) => refs.map(read),
      set: (ref: any, value: any, options?: any) => {
        wrote = true;
        this.set(staged, ref.path, value, options);
      },
      create: (ref: any, value: any) => {
        wrote = true;
        if (staged.has(ref.path)) throw new Error("Already exists");
        staged.set(ref.path, value);
      },
      delete: (ref: any) => {
        wrote = true;
        staged.delete(ref.path);
      },
    };
    try {
      const result = await body(tx);
      this.data = staged;
      return result;
    } finally {
      release();
    }
  }
  async recursiveDelete(collection: any) {
    for (const k of this.data.keys())
      if (k.startsWith(collection.path + "/")) this.data.delete(k);
  }
}
