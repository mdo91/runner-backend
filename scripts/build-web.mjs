import { copyFile, mkdir } from "node:fs/promises";
await mkdir("dist/web", { recursive: true });
for (const file of ["index.html", "dashboard.css"])
  await copyFile("web/" + file, "dist/web/" + file);
