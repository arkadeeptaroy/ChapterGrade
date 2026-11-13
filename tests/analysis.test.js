import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeReadability, formulaForGrade, daleChallBand, tokenize, evaluateSuitability, isFamiliar} from '../src/analysis.js';

const known = new Set('the a boy girl bird cat dog play run goes went had he she it was in tree to of and on as is are at his her with by they their us we you for can good said nice very this that then there will have some big small sat saw came do did no yes after before day not came into'.split(' '));
const sample = 'The cat sat on the tree. The boy saw the cat. The bird was in the tree. The girl came with the boy. They play with the dog. The boy and the girl saw the bird. The cat was on the tree. They all had a good day.';

test('formula auto-selection at Grade 4 / Grade 5 boundary', () => {
  assert.equal(formulaForGrade(4), 'spache');
  assert.equal(formulaForGrade(5), 'dale-chall');
});
test('Grade 4 Spache score follows revised coefficients', () => {
  const r = analyzeReadability(sample, 4, 'auto', known);
  assert.equal(r.method, 'spache');
  assert.equal(r.wordCount, tokenize(sample).length);
  assert.equal(r.sentenceCount, 8);
  const expectation = .659 + .121*(r.wordCount/8)+.082*(r.uniqueUnfamiliar/r.wordCount*100);
  assert.ok(Math.abs(r.score-expectation)<0.001);
});
test('Grade 5 Dale-Chall adjusted score follows classic equation', () => {
  const r = analyzeReadability(sample, 5, 'auto', known);
  assert.equal(r.method, 'dale-chall');
  const pct = r.difficultOccurrences/r.wordCount*100;
  const expected = .1579*pct + .0496*(r.wordCount/r.sentenceCount) + (pct>5?3.6365:0);
  assert.ok(Math.abs(r.score-expected)<0.001);
});
test('Band transitions are never rounded before lookup', () => {
  assert.deepEqual(daleChallBand(4.999).label, 'Grade 4 or below');
  assert.equal(daleChallBand(5).label, 'Grades 5–6');
  assert.equal(daleChallBand(6.999).label, 'Grades 7–8');
});
test('Familiarity recognizes simple inflections and proper apostrophes', () => {
  assert.equal(isFamiliar('dogs', new Set(['dog'])), true);
  assert.equal(isFamiliar('playing', new Set(['play'])), true);
  assert.equal(isFamiliar('unobtainium', known), false);
});
test('Grade suitability does not claim Dale-Chall exact grade', () => {
  const r = evaluateSuitability({grade:5,method:'dale-chall',score:5.8,band:daleChallBand(5.8)});
  assert.equal(r.status,'fit');
  assert.match(r.label,/band/);
});
test('Too little text is rejected', () => {
  assert.throws(() => analyzeReadability('A very short phrase.', 2, 'auto', known), /At least 30 words/);
});
test('Spache counts distinct unfamiliar words, not repeated occurrences', () => {
  const text = 'The mysterious dragon watched the boy. The mysterious dragon watched the girl. The mysterious dragon watched the bird. The mysterious dragon watched the cat. The mysterious dragon watched the dog. The mysterious dragon watched the tree.';
  const r = analyzeReadability(text, 3, 'spache', new Set([...known, 'dragon', 'watched']));
  assert.equal(r.uniqueUnfamiliar, 1);
  assert.equal(r.difficultOccurrences, 6);
});
test('Dale–Chall correction only applies above five percent difficult', () => {
  const text = Array.from({length:19},()=> 'The dog sat on the tree.').join(' ') + ' The hypermetamorphosis dog sat on the tree.';
  const r = analyzeReadability(text, 5, 'dale-chall', known);
  const pct = r.difficultOccurrences/r.wordCount*100;
  assert.ok(pct < 5);
  const unadjusted = .1579*pct+.0496*(r.wordCount/r.sentenceCount);
  assert.ok(Math.abs(r.score-unadjusted)<.001);
});

test('Spache samples long chapters instead of diluting unique-word counts', () => {
  const unit = 'The mysterious dog sat by the tree. The boy saw the mysterious dog.';
  const text = Array.from({length: 26}, () => unit).join(' ');
  const result = analyzeReadability(text, 3, 'spache', known);
  assert.ok(result.sampleCount > 1);
  assert.ok(result.unfamiliarPercentage > result.uniqueUnfamiliar/result.wordCount*100);
});
