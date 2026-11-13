# ChapterGrade

A browser-only readability assessment platform for schoolbook chapters. Select a target grade (1–12), upload an English chapter, inspect/edit extracted text, then get an evidence-based screening result.

## What it does

- **Grades 1–4:** automatically uses revised Spache (1974).
- **Grades 5–12:** automatically uses the classic Dale–Chall equation and traditional reading-grade bands, with the 1995 Dale–Chall familiar-word list.
- PDF, DOCX and TXT uploads; manual paste/editing; no backend, database, logs of uploaded content, or third-party file processing.
- Report includes reading score, estimated grade/band, word count, sentence count, sentence length, difficult-vocabulary rate, unfamiliar words/frequency, long sentences and editing priorities.
- CSV, JSON and browser Print / Save as PDF.

**Important:** This product is a readability *screening aid*. It cannot certify curriculum, narrative themes, conceptual depth, age-suitability, pedagogy, grammar or educational alignment. Automated PDF extraction may blend columns, captions and exercise pages. Always inspect the extracted text.

## Local use

Requires Node.js 22 or later.

```sh
npm install
npm run dev
```

Open the local address shown in the console (usually `http://localhost:5173`).

Unit tests:

```sh
npm test
```

Production bundle:

```sh
npm run build
npm run preview
```

## Deploy to Render

1. Create a **new GitHub repository** for this project. Do not add it to or replace the previous PDF compressor repository.
2. Add the **contents** of this folder to the repository root, including `package.json` and `render.yaml`.
3. In Render, choose **New → Static Site**, connect the repository and deploy the `main` branch.
4. Use **Build Command:** `npm install && npm run build`. **Publish Directory:** `dist`.
5. Render will provide a public `onrender.com` address. No environment variables, storage volumes, backend service or domain are required.

Alternatively, use Render **New → Blueprint** and select the repository; `render.yaml` configures the static site.

## Scoring and methodological notes

### Spache

**Revised Spache (1974)** estimates a grade level:

`0.659 + (0.121 × average words/sentence) + (0.082 × percentage of unique unfamiliar words)`

The word-list dependency contains the Revised Spache (1974) familiar list (1,063 entries). For chapters longer than approximately 100 words, the text is separated into sentence-aligned passages of around 100 words. Each distinct unfamiliar word counts once within each passage; sample scores are averaged by word count. This prevents full-chapter lengths from artificially reducing the unfamiliar-word rate.

### Dale–Chall

**Classic Dale–Chall (1948)** equation:

`(0.1579 × percentage of unfamiliar-word occurrences) + (0.0496 × average words/sentence) + 3.6365 if unfamiliar percentage > 5%`

The **1995 familiar-word list** is used (2,942 entries) with the classic equation and traditional correction bands. This is a hybrid used for convenient screening; it is **not** the separate 1995 New Dale–Chall cloze procedure. Raw score must not be treated as an exact grade level.

| Raw score | Reading band |
|---|---|
| < 5.0 | Grade 4 or below |
| 5.0–5.99 | Grades 5–6 |
| 6.0–6.99 | Grades 7–8 |
| 7.0–7.99 | Grades 9–10 |
| 8.0–8.99 | Grades 11–12 |
| 9.0–9.99 | College (13–15) |
| ≥ 10.0 | 16+ |

**The tool's suitability decisions are editorial screening rules, not cut scores from Spache/Dale–Chall.** Spache is tagged “within expected range” when the score is from `grade - 1.0` to `grade + 0.5`; easier or more demanding otherwise. Dale–Chall checks whether the selected grade falls inside the formula's two-grade band. “Easier” alone does not mean a chapter is unsuitable. Scores from manually overridden formulas outside their grade range are tagged exploratory.

The algorithm uses basic English word-ending recognition (plural, -ed, -ing, etc.). It does not do full lemmatization or named-entity recognition, and proper names may appear as unfamiliar. Numerals and one-letter words are treated as familiar. Hyphenated words are split only for dictionary matching, not for the word count. Sentences use `Intl.Segmenter`. Extracted text is editable to avoid page headers, exercises and multi-column reading-order errors. For short texts (<100 words) and sentence-fragment-heavy texts, warnings are displayed.

## Privacy and limitations

All upload parsing, text editing, scoring and report exports occur **entirely inside the browser**. The site makes **no file upload or analysis API calls**, uses no cookies and includes no analytics. Closing or reloading the tab clears the file from the app state. Reports are exported locally at the user's direction.

PDF images and scanned pages are **not OCR'd**. The app is limited to 40 MB per file, 250 PDF pages, and the first 1,000,000 extracted characters for device performance. Content in image captions, tables, diagrams, layout-heavy material, poems and activities might not be evaluated correctly; review before scoring.

## Dependencies and attributions

- [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0), browser PDF text extraction.
- [Mammoth](https://github.com/mwilliamson/mammoth.js) (BSD-2-Clause), browser DOCX text extraction.
- [`spache`](https://github.com/words/spache) (MIT, © Titus Wormer), Revised Spache word list.
- [`dale-chall`](https://github.com/words/dale-chall) (MIT, © Titus Wormer), New Dale–Chall familiar-word list.
- [Vite](https://vite.dev/) (MIT), static asset bundling.

No UI library, tracking, server API or database.
