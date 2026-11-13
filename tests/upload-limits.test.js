import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFile, maxFileBytes} from '../src/extract.js';

const MiB = 1024 * 1024;

test('PDF files use an 800 MiB limit', () => {
  assert.equal(maxFileBytes('pdf'), 800 * MiB);
});

test('DOCX and TXT retain a 40 MiB limit', () => {
  assert.equal(maxFileBytes('docx'), 40 * MiB);
  assert.equal(maxFileBytes('txt'), 40 * MiB);
});

test('rejects oversized PDF before parsing', async () => {
  const file = new File(['x'], 'book.pdf');
  Object.defineProperty(file, 'size', {value: 800 * MiB + 1});
  await assert.rejects(extractFile(file), /800 MB PDF limit/);
});

test('rejects oversized DOCX before parsing', async () => {
  const file = new File(['x'], 'book.docx');
  Object.defineProperty(file, 'size', {value: 40 * MiB + 1});
  await assert.rejects(extractFile(file), /40 MB DOCX limit/);
});
