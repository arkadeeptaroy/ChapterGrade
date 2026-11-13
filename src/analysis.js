/**
 * ChapterGrade readability engine.
 * Spache: revised 1974 grade estimate.
 * Dale-Chall: classic equation and grade conversion table, using the 1995 word list.
 *
 * Editorial suitability labels below are SCREENING rules, not validated cut scores.
 */

const WORD_RE = /[\p{L}]+(?:[’'][\p{L}]+)*(?:[-‐][\p{L}]+(?:[’'][\p{L}]+)*)*|\d+(?:[.,]\d+)*/gu;
const PUNCTUATION_RE = /[.!?…]/u;

export function normalizeText(text) {
  return String(text ?? '')
    .replace(/\u00ad/g, '')
    .replace(/([\p{L}])-\s*\n\s*([\p{L}])/gu, '$1$2')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

export function tokenize(text) {
  return Array.from(String(text).matchAll(WORD_RE), match => match[0]);
}

function sentenceSegments(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    return Array.from(segmenter.segment(text), x => x.segment.trim()).filter(x => tokenize(x).length);
  }
  return (text.match(/[^.!?…]+(?:[.!?…]+|$)/g) || []).map(x => x.trim()).filter(x => tokenize(x).length);
}

function findInflections(word) {
  const list = [word];
  // Conservative English inflections. Do not guess arbitrary roots.
  if (word.endsWith("'s")) list.push(word.slice(0, -2));
  if (word.endsWith("s'")) list.push(word.slice(0, -1));
  if (word.endsWith('ies') && word.length > 4) list.push(word.slice(0, -3) + 'y');
  if (word.endsWith('es') && word.length > 3) {
    list.push(word.slice(0, -2), word.slice(0, -1));
  }
  if (word.endsWith('s') && word.length > 3) list.push(word.slice(0, -1));
  if (word.endsWith('ied') && word.length > 4) list.push(word.slice(0, -3) + 'y');
  if (word.endsWith('ed') && word.length > 3) {
    list.push(word.slice(0, -2), word.slice(0, -1));
    if (word.at(-3) === word.at(-4)) list.push(word.slice(0, -3));
  }
  if (word.endsWith('ing') && word.length > 5) {
    list.push(word.slice(0, -3), word.slice(0, -3) + 'e');
    if (word.at(-4) === word.at(-5)) list.push(word.slice(0, -4));
  }
  if (word.endsWith('er') && word.length > 4) list.push(word.slice(0, -2));
  if (word.endsWith('est') && word.length > 5) list.push(word.slice(0, -3));
  if (word.endsWith('ly') && word.length > 4) list.push(word.slice(0, -2));
  return list;
}

export function isFamiliar(token, familiarWords) {
  const normalized = token.toLocaleLowerCase('en').replace(/[’]/g, "'");
  if (/^\d/.test(normalized) || normalized.length === 1) return true;
  if (familiarWords.has(normalized)) return true;
  if (normalized.includes('-')) return normalized.split('-').every(part => isFamiliar(part, familiarWords));
  return findInflections(normalized).some(candidate => familiarWords.has(candidate));
}

/** Build consecutive, sentence-aligned passages of approximately 100 words.
 * Distinct unfamiliar-word counts must reset for each Spache sample. */
function spacheSamples(segments, familiarWords) {
  const samples = [];
  let group = [];
  let groupWordCount = 0;
  for (const sentence of segments) {
    const length = tokenize(sentence).length;
    group.push(sentence);
    groupWordCount += length;
    if (groupWordCount >= 100) {
      samples.push(group);
      group = [];
      groupWordCount = 0;
    }
  }
  if (group.length) {
    if (samples.length && groupWordCount < 50) samples[samples.length - 1].push(...group);
    else samples.push(group);
  }
  return samples.map(sample => {
    const words = sample.flatMap(tokenize);
    const difficult = new Set(words.filter(w => !isFamiliar(w, familiarWords)).map(w => w.toLocaleLowerCase('en')));
    const pct = 100 * difficult.size / words.length;
    return {
      wordCount: words.length,
      sentenceCount: sample.length,
      uniqueUnfamiliarCount: difficult.size,
      unfamiliarPercentage: pct,
      score: 0.659 + 0.121 * words.length / sample.length + 0.082 * pct
    };
  });
}

export function formulaForGrade(grade) {
  return Number(grade) <= 4 ? 'spache' : 'dale-chall';
}

export function daleChallBand(score) {
  if (score < 5) return { min: 1, max: 4, label: 'Grade 4 or below' };
  if (score < 6) return { min: 5, max: 6, label: 'Grades 5–6' };
  if (score < 7) return { min: 7, max: 8, label: 'Grades 7–8' };
  if (score < 8) return { min: 9, max: 10, label: 'Grades 9–10' };
  if (score < 9) return { min: 11, max: 12, label: 'Grades 11–12' };
  if (score < 10) return { min: 13, max: 15, label: 'College (Grades 13–15)' };
  return { min: 16, max: null, label: 'College graduate level' };
}

export function evaluateSuitability({ grade, method, score, band }) {
  const outsideMethodRange = (method === 'spache' && grade > 4) || (method === 'dale-chall' && grade < 5);
  if (outsideMethodRange) {
    return { status: 'caution', label: 'Exploratory score', detail: 'This method is outside its recommended grade range. Use the automatic method for a primary recommendation.' };
  }
  if (method === 'spache') {
    // Editorial tolerance for screening; not part of the original Spache formula.
    if (score > grade + 0.5) return { status: 'above', label: 'More demanding than target', detail: `Estimated reading level exceeds the Grade ${grade} screening threshold. Shorten sentences and review unfamiliar vocabulary.` };
    if (score < Math.max(0.5, grade - 1.0)) return { status: 'below', label: 'Easier than target', detail: `The passage is relatively accessible for Grade ${grade}. Check whether its ideas and learning depth still match the curriculum.` };
    return { status: 'fit', label: 'Within expected range', detail: `The passage falls within the Grade ${grade} reading-level screening range.` };
  }
  if (grade < band.min) return { status: 'above', label: 'More demanding than target', detail: `The Dale–Chall band (${band.label}) is above Grade ${grade}. Simplification or additional reading support may be needed.` };
  if (band.max !== null && grade > band.max) return { status: 'below', label: 'Easier than target', detail: `The Dale–Chall band (${band.label}) is below Grade ${grade}. The chapter may still be suitable, but review cognitive demand.` };
  return { status: 'fit', label: 'Within expected band', detail: `The estimated Dale–Chall reading band contains Grade ${grade}. This does not distinguish individual grades within the band.` };
}

export function analyzeReadability(rawText, selectedGrade, method, familiarWords) {
  const grade = Number(selectedGrade);
  if (!Number.isInteger(grade) || grade < 1 || grade > 12) throw new Error('Choose a grade from 1 to 12.');
  const chosenMethod = method === 'auto' || !method ? formulaForGrade(grade) : method;
  if (!['spache', 'dale-chall'].includes(chosenMethod)) throw new Error('Unsupported readability method.');
  if (!familiarWords || !(familiarWords instanceof Set) || familiarWords.size < 1) throw new Error('Familiar-word list unavailable.');
  const text = normalizeText(rawText);
  const words = tokenize(text);
  if (words.length < 30) throw new Error('At least 30 words are needed for a preliminary score. Paste or retain more of the reading passage.');
  const segments = sentenceSegments(text);
  if (segments.length === 0) throw new Error('No readable sentences could be identified.');

  const unfamiliarTokens = words.filter(w => !isFamiliar(w, familiarWords));
  const unfamiliarMap = new Map();
  for (const token of unfamiliarTokens) {
    const word = token.toLocaleLowerCase('en').replace(/’/g, "'");
    unfamiliarMap.set(word, (unfamiliarMap.get(word) || 0) + 1);
  }
  const unfamiliar = [...unfamiliarMap.entries()]
    .map(([word, frequency]) => ({ word, frequency }))
    .sort((a, b) => b.frequency - a.frequency || a.word.localeCompare(b.word));
  const uniqueUnfamiliar = unfamiliar.length;
  const difficultOccurrences = unfamiliarTokens.length;
  const wordCount = words.length;
  const sentenceCount = segments.length;
  const averageSentenceLength = wordCount / sentenceCount;
  const samples = chosenMethod === 'spache' ? spacheSamples(segments, familiarWords) : [];
  const unfamiliarPercentage = chosenMethod === 'spache'
    ? 100 * samples.reduce((total, sample) => total + sample.uniqueUnfamiliarCount, 0) / wordCount
    : (100 * difficultOccurrences) / wordCount;

  // Revised Spache (1974): score sentence-aligned, ~100-word samples,
  // counting each unfamiliar word once within each sample, then weighted-mean.
  // Dale–Chall (1948 equation): count all unfamiliar word occurrences.
  const score = chosenMethod === 'spache'
    ? samples.reduce((total, sample) => total + sample.score * sample.wordCount, 0) / wordCount
    : 0.1579 * unfamiliarPercentage + 0.0496 * averageSentenceLength + (unfamiliarPercentage > 5 ? 3.6365 : 0);
  const band = chosenMethod === 'dale-chall' ? daleChallBand(score) : null;
  const suitability = evaluateSuitability({ grade, method: chosenMethod, score, band });
  const sentenceStats = segments
    .map(sentence => ({ sentence: sentence.replace(/\s+/g, ' ').slice(0, 420), words: tokenize(sentence).length, hasPunctuation: PUNCTUATION_RE.test(sentence) }))
    .sort((a, b) => b.words - a.words)
    .slice(0, 3);
  const warnings = [];
  if (wordCount < 100) warnings.push('Short sample: fewer than 100 words. Treat this as a preliminary estimate.');
  if (sentenceCount < 5) warnings.push('Very few sentences were detected. Sentence-length estimates may be unstable.');
  if (averageSentenceLength > 25) warnings.push('Long average sentences. Check whether PDF extraction merged sentence boundaries.');
  if (!/[.!?…]/u.test(text)) warnings.push('No sentence-ending punctuation was detected. Poetry or fragmented text may score unreliably.');
  if (chosenMethod !== formulaForGrade(grade)) warnings.push('Formula override: this method is outside the recommended age/grade group.');
  return {
    grade, method: chosenMethod, score: Number(score.toFixed(3)), band,
    estimatedGrade: chosenMethod === 'spache' ? Number(score.toFixed(2)) : null,
    suitability,
    wordCount, sentenceCount,
    averageSentenceLength: Number(averageSentenceLength.toFixed(2)),
    difficultOccurrences, uniqueUnfamiliar, sampleCount: samples.length || 1,
    unfamiliarPercentage: Number(unfamiliarPercentage.toFixed(2)),
    unfamiliarPercentageBasis: chosenMethod === 'spache' ? 'sum of unique unfamiliar words across ~100-word samples ÷ all words' : 'unfamiliar occurrences ÷ all words',
    unfamiliar, longestSentences: sentenceStats,
    warnings,
    methodNote: chosenMethod === 'spache'
      ? `Revised Spache (1974) formula and familiar-word list. Weighted result from ${samples.length} sentence-aligned sample(s) of approximately 100 words.`
      : 'Classic Dale–Chall (1948) equation and grade bands, evaluated against the 1995 familiar-word list. This is not the 1995 New Dale–Chall cloze procedure.'
  };
}
