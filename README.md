# ChapterGrade

Client-side readability screening for English-language prose in chapters across school subjects. Supports PDF, DOCX, TXT and pasted text.

## Stack

- Vite 7, JavaScript, PDF.js and Mammoth
- `spache` and `dale-chall` dictionaries
- Render static hosting; no application server or database

## Setup

Requires Node.js 22+.

```bash
npm install
npm run dev
```

## Checks

```bash
npm test
npm run build
```

## Deployment

Render Static Site, `main` branch. Build: `npm install && npm run build`. Publish: `dist`. `render.yaml` is included.

## Limits

PDF: 800 MiB, processed with PDF.js file-range reads. DOCX/TXT: 40 MiB. Up to 250 PDF pages and 1,000,000 extracted characters. Device memory and PDF structure can restrict large-file processing. No OCR.

## Scoring

Grades 1–4: revised Spache. Grades 5–12: classic Dale–Chall. Formula selection can be overridden in the UI. Scores are readability estimates, not curriculum validation.

The subject selector is descriptive metadata; Spache and Dale–Chall remain English prose readability measures and do not evaluate equations, diagrams, code, or curriculum accuracy.
