/** Browser-only extraction: never transmits uploaded file bytes. */
export const MAX_PDF_BYTES = 800 * 1024 * 1024;
export const MAX_OTHER_BYTES = 40 * 1024 * 1024;
export const MAX_FILE_BYTES = MAX_PDF_BYTES; // Legacy export; PDF-specific limit.
export function maxFileBytes(extension) {
  return extension === 'pdf' ? MAX_PDF_BYTES : MAX_OTHER_BYTES;
}
const MAX_PDF_PAGES = 250;

export async function extractFile(file, onProgress = () => {}) {
  if (!(file instanceof File)) throw new Error('Choose a chapter file.');
  if (file.size === 0) throw new Error('The file is empty.');
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  if (!['pdf', 'docx', 'txt', 'text'].includes(extension)) throw new Error('Only PDF, DOCX and TXT files are supported.');
  const limit = maxFileBytes(extension);
  if (file.size > limit) throw new Error(`File exceeds the ${extension === 'pdf' ? '800' : '40'} MB ${extension.toUpperCase()} limit.`);
  onProgress('Reading your file…');

  if (extension === 'txt' || extension === 'text') {
    const text = await file.text();
    return {text, kind: 'TXT', detail: 'Plain text', warnings: []};
  }
  if (extension === 'docx') {
    onProgress('Extracting Word document text…');
    const module = await import('mammoth/mammoth.browser');
    const mammoth = module.default || module;
    const result = await mammoth.extractRawText({arrayBuffer: await file.arrayBuffer()});
    return {text: result.value, kind: 'DOCX', detail: 'Word document', warnings: result.messages.filter(m => m.type === 'warning').map(m => m.message).slice(0, 3)};
  }

  onProgress('Opening PDF in your browser…');
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/build/pdf.mjs'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // Fetch PDF byte ranges from the File instead of buffering an 800 MB file at once.
  // PDF.js requests only the ranges necessary to parse and extract text.
  class LocalPDFRangeTransport extends pdfjs.PDFDataRangeTransport {
    constructor(localFile) {
      super(localFile.size, new Uint8Array(0));
      this.localFile = localFile;
    }
    requestDataRange(begin, end) {
      this.localFile.slice(begin, end).arrayBuffer()
        .then(bytes => this.onDataRange(begin, new Uint8Array(bytes)))
        .catch(error => console.error('PDF range read failed:', error));
    }
  }
  const transport = new LocalPDFRangeTransport(file);
  const loading = pdfjs.getDocument({
    range: transport,
    rangeChunkSize: 256 * 1024,
    disableAutoFetch: true,
    disableStream: true,
    useSystemFonts: true
  });
  let document;
  try {
    document = await loading.promise;
    if (document.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has ${document.numPages} pages. The limit is ${MAX_PDF_PAGES} pages per analysis.`);
    const pages = [];
    let emptyPages = 0;
    for (let number = 1; number <= document.numPages; number++) {
      if (number === 1 || number % 3 === 0 || number === document.numPages) onProgress(`Extracting page ${number} of ${document.numPages}…`);
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      let out = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        out += item.str;
        out += item.hasEOL ? '\n' : ' ';
      }
      const trimmed = out.replace(/\s+/g, ' ').trim();
      if (!trimmed) emptyPages++;
      else pages.push(out.trim());
      page.cleanup();
    }
    const warnings = [];
    if (emptyPages) warnings.push(`${emptyPages} PDF page(s) contained no selectable text. Images and scans require OCR, which this app does not perform.`);
    if (!pages.length) throw new Error('No selectable text found in this PDF. Use a text-based PDF, DOCX, TXT, or paste the passage manually. Scanned pages require OCR first.');
    warnings.push('PDF reading order may mix columns, captions or exercise instructions. Review the extracted passage below.');
    return {text: pages.join('\n\n'), kind: 'PDF', detail: `${document.numPages} page${document.numPages === 1 ? '' : 's'}`, warnings};
  } catch (error) {
    if (/password/i.test(error?.name || '')) throw new Error('This PDF is password protected. Remove its password before analysis.');
    throw error;
  } finally {
    if (document) await document.destroy();
    else await loading.destroy();
  }
}
