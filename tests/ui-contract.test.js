import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('all DOM IDs referenced by the application exist exactly once', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(x => x[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [,id] of main.matchAll(/\$\('([^']+)'\)/g)) {
    assert.ok(ids.includes(id), `Missing UI element: ${id}`);
  }
});

test('upload drawer has usable controls and progress feedback', () => {
  for (const id of ['upload-drawer','drawer-close','file-input','dropzone','chapter-text','grade-select','method-select','analyze-btn','extraction-feedback','analyze-spinner']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /role="dialog"/);
  assert.match(html, /800 MB/);
});

test('interface uses Cal Sans and AMOLED black, without promotional badges', () => {
  assert.match(css, /--canvas:\s*#000;/);
  assert.match(pkg.dependencies['cal-sans'], /^\^2\./);
  assert.match(main, /import 'cal-sans';/);
  assert.doesNotMatch(html, /PRIVATE BY DESIGN|100% BROWSER-BASED|Reading level,.*guesswork/i);
});

test('all-subject scope and mobile-first workspace are explicit', () => {
  assert.match(html, /id="subject-select"/);
  assert.match(html, /Readability analysis for chapters across subjects/);
  assert.match(html, /English-language prose in any subject/);
  assert.doesNotMatch(html, /for English textbook chapters/i);
  assert.match(main, /setDrawer\(false\);\s*$/);
  assert.match(main, /subject:state\.subject/);
});

test('AMOLED palette contains no green-tinted UI surfaces', () => {
  assert.match(css, /--canvas:\s*#000;/);
  assert.match(css, /--accent:\s*#ada8ff;/);
  assert.doesNotMatch(css, /#7cf7ce|#131c18|#14221b|#11241a|#101313|#a1ffe0/i);
});
