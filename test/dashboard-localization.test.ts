import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../web/localization.ts', import.meta.url), 'utf8');
function browserLanguage(search: string, language: string) {
  const document = {documentElement: {lang: ''}, title: ''};
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(compiled, {exports, document, location: {search}, navigator: {language}, URLSearchParams});
  return {document, language: exports.dashboardLanguage, localize: exports.localize};
}
test('dashboard follows German preference, supports explicit English, and falls back to English', () => {
  const de = browserLanguage('', 'de-DE');
  assert.equal(de.language, 'de');
  assert.equal(de.document.documentElement.lang, 'de');
  assert.equal(de.localize('Dashboard.Copy.latestRun.text'), 'Letzter Lauf');
  assert.equal(de.localize('Dashboard.Copy.distance.text'), 'Distanz');
  const en = browserLanguage('?lang=en', 'de-DE');
  assert.equal(en.localize('Dashboard.Copy.latestRun.text'), 'Latest Run');
  assert.equal(browserLanguage('', 'fr-FR').language, 'en');
  assert.equal(browserLanguage('?lang=de', 'en-US').document.title, 'Runner · Dein Laufverlauf');
});
test('dashboard formats translated data labels and explains preserved report language', () => {
  const de = browserLanguage('?lang=de', 'en-US');
  assert.match(de.localize('Dashboard.Format.loadedRoutes.text', 12), /^12 Routen geladen/);
  assert.match(de.localize('Dashboard.Analysis.languageNotice.text'), /gespeicherte Bericht/);
  assert.equal(de.localize('Unknown.key'), 'Unknown.key');
});
