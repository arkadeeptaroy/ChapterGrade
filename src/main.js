import './styles.css';
import {spache} from 'spache';
import {daleChall} from 'dale-chall';
import {analyzeReadability, formulaForGrade, tokenize} from './analysis.js';
import {extractFile} from './extract.js';

const $ = id => document.getElementById(id);
const familiarLists = {
  spache: new Set(spache.map(w => w.toLowerCase())),
  'dale-chall': new Set(daleChall.map(w => w.toLowerCase()))
};
const MAX_TEXT_CHARS = 1000000;
const state = {sourceName: '', sourceType: 'PASTED TEXT', extractedWarnings: [], analysis: null, expanded: false, requestId: 0};
const nf = new Intl.NumberFormat('en');
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let toastTimer;
function toast(message, isError = false) {
  clearTimeout(toastTimer);
  const node = $('toast');
  node.textContent = message;
  node.className = `toast visible${isError ? ' error' : ''}`;
  toastTimer = setTimeout(() => node.className = 'toast', 4300);
}
function showEditor() {
  $('text-editor-wrap').classList.remove('hidden');
  $('paste-toggle').innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5h8M6.5 6H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 18h10a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 15 6h-1.5M7 2h6v4H7z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg> Edit the reading passage <span class="action-arrow">↗</span>';
}
function currentMethod() {
  const selected = $('method-select').value;
  return selected === 'auto' ? formulaForGrade($('grade-select').value) : selected;
}
function updateMethod() {
  const method = currentMethod();
  const grade = Number($('grade-select').value);
  const override = $('method-select').value !== 'auto';
  const outsideRange = (grade > 4 && method === 'spache') || (grade < 5 && method === 'dale-chall');
  $('method-pill').textContent = method === 'spache' ? 'SPACHE' : 'DALE–CHALL';
  $('method-description').textContent = (method === 'spache' ? 'Recommended: Grades 1–4' : 'Recommended: Grades 5–12') + (override ? ' · Manual' : ' · Automatic');
  $('method-explanation').textContent = outsideRange
    ? 'This method is outside its recommended grade range. Its result will be marked exploratory.'
    : method === 'spache'
      ? 'Uses average sentence length and the number of distinct unfamiliar words.'
      : 'Uses average sentence length and unfamiliar-word occurrence rate. Returns a grade band.';
  clearReport();
}
function updateTextCount() {
  const count = tokenize($('chapter-text').value).length;
  $('text-count').textContent = `${nf.format(count)} word${count === 1 ? '' : 's'}`;
  $('analyze-btn').disabled = count < 30;
  clearReport();
}
function clearReport() {
  state.analysis = null;
  state.expanded = false;
  $('report').classList.add('hidden');
  $('empty-state').classList.remove('hidden');
}
function setSourceMeta(primary, secondary, busy = false) {
  const meta = $('source-meta');
  meta.classList.remove('hidden');
  meta.classList.toggle('busy', busy);
  meta.innerHTML = `<strong>${escapeHTML(primary)}</strong><small>${escapeHTML(secondary)}</small>`;
}
async function loadFile(file) {
  const id = ++state.requestId;
  $('analyze-btn').disabled = true;
  clearReport();
  state.sourceName = file.name;
  setSourceMeta(file.name, 'Preparing text extraction…', true);
  showEditor();
  $('chapter-text').value = '';
  $('chapter-text').disabled = true;
  try {
    const data = await extractFile(file, message => {if (id === state.requestId) setSourceMeta(file.name, message, true);});
    if (id !== state.requestId) return;
    if (!data.text.trim()) throw new Error('No readable text was extracted. Paste the passage manually.');
    const large = data.text.length > MAX_TEXT_CHARS;
    state.sourceType = data.kind;
    state.extractedWarnings = [...data.warnings];
    $('chapter-text').value = large ? data.text.slice(0, MAX_TEXT_CHARS) : data.text;
    if (large) state.extractedWarnings.push('Text was limited to the first 1,000,000 characters to protect browser performance.');
    setSourceMeta(`${file.name} · ${data.kind}`, `${data.detail} · ${nf.format(tokenize($('chapter-text').value).length)} words extracted${data.warnings.length ? ' · Review extraction notes in report' : ''}`);
    updateTextCount();
    if (tokenize($('chapter-text').value).length < 30) toast('Less than 30 words extracted. Try copying the passage directly.', true);
    else toast('Text extracted. Review it, then analyse.');
  } catch(error) {
    if (id !== state.requestId) return;
    state.sourceType = 'PASTED TEXT';
    state.extractedWarnings = [];
    setSourceMeta('Could not read file', error.message || 'Extraction failed');
    toast(error.message || 'Extraction failed.', true);
  } finally {
    if (id === state.requestId) $('chapter-text').disabled = false;
  }
}
function gradeBandDisplay(result) {
  return result.method === 'spache' ? `Grade ${result.estimatedGrade.toFixed(1)}` : result.band.label;
}
function gradeBadge(result) {
  if (result.method === 'spache') return `G ${result.estimatedGrade.toFixed(1)}`;
  const min = result.band.min;
  if (result.band.max === null) return `G ${min}+`;
  if (min === 1) return 'G ≤04';
  return `G ${String(min).padStart(2, '0')}–${String(result.band.max).padStart(2, '0')}`;
}
function buildReviewPoints(r) {
  const points = [];
  if (r.suitability.status === 'above') points.push(['Grade mismatch', 'Reading demand appears higher than the selected grade. Prioritize simplifying the text before approval.']);
  if (r.suitability.status === 'below') points.push(['Check cognitive depth', 'The language is relatively accessible. Confirm that vocabulary and questions still provide meaningful learning demand.']);
  if (r.suitability.status === 'fit') points.push(['Reading-level alignment', 'The score falls within the screening range. Continue with content accuracy, pedagogy and curriculum review.']);
  if (r.suitability.status === 'caution') points.push(['Formula applicability', 'Re-run using the automatic formula for the selected grade before drawing conclusions.']);
  const sentenceLimit = r.grade <= 2 ? 12 : r.grade <= 4 ? 16 : 22;
  if (r.averageSentenceLength > sentenceLimit) points.push(['Sentence length', `${r.averageSentenceLength} words per sentence on average. Check long or multi-clause sentences and the longest examples below.`]);
  const difficultThreshold = r.method === 'spache' ? 10 : 15;
  if (r.unfamiliarPercentage > difficultThreshold) points.push(['Vocabulary load', `${r.unfamiliarPercentage}% unfamiliar by this method. Teach essential terms explicitly and consider simpler wording for incidental terms.`]);
  if (r.wordCount < 100) points.push(['Increase sample size', 'A sample under 100 words is a weak basis for a chapter-level decision. Include more complete narrative sentences.']);
  if (r.unfamiliar.length === 0) points.push(['Vocabulary coverage', 'All detected words appear on the selected familiar-word list after basic inflection handling.']);
  return points.slice(0, 4);
}
function renderVocabulary(result) {
  const shown = state.expanded ? result.unfamiliar : result.unfamiliar.slice(0, 12);
  $('vocabulary-summary').textContent = `/ ${nf.format(result.uniqueUnfamiliar)} DISTINCT`;
  $('vocab-list').innerHTML = shown.length
    ? shown.map(w => `<span class="vocab-chip">${escapeHTML(w.word)}<b>×${w.frequency}</b></span>`).join('')
    : '<p class="empty-vocab">No unfamiliar words detected against this word list.</p>';
  const button = $('show-more');
  button.hidden = result.unfamiliar.length <= 12;
  button.innerHTML = state.expanded ? 'Show fewer words <span>↑</span>' : `Show all ${nf.format(result.unfamiliar.length)} unfamiliar words <span>↓</span>`;
}
function renderResult(result) {
  $('empty-state').classList.add('hidden');
  $('report').classList.remove('hidden');
  $('report-date').textContent = new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}).toUpperCase();
  $('report-file').textContent = state.sourceName || 'Pasted reading passage';
  $('report-grade').textContent = `Grade ${result.grade} assessment`;
  const badge = $('report-status');
  badge.className = `status-badge ${result.suitability.status}`;
  badge.textContent = result.suitability.label;
  $('report-score').textContent = result.score.toFixed(2);
  $('report-method').textContent = result.method === 'spache' ? 'SPACHE · REVISED 1974' : 'DALE–CHALL · CLASSIC';
  $('report-band-number').textContent = gradeBadge(result);
  $('report-band').textContent = gradeBandDisplay(result);
  $('report-verdict').textContent = result.suitability.detail;
  const warnings = [...state.extractedWarnings, ...result.warnings];
  $('report-warnings').classList.toggle('hidden', !warnings.length);
  $('report-warnings').innerHTML = warnings.map(w => `<p>⚠ ${escapeHTML(w)}</p>`).join('');
  $('metric-words').textContent = nf.format(result.wordCount);
  $('metric-sentences').textContent = nf.format(result.sentenceCount);
  $('metric-average').textContent = result.averageSentenceLength.toFixed(1);
  $('metric-unfamiliar').textContent = `${result.unfamiliarPercentage.toFixed(1)}%`;
  $('metric-unfamiliar-note').textContent = result.method === 'spache' ? `${nf.format(result.uniqueUnfamiliar)} unique words` : `${nf.format(result.difficultOccurrences)} occurrences`;
  $('review-block').innerHTML = buildReviewPoints(result).map(([title,description],i) => `<div class="review-item"><span>${i+1}</span><div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(description)}</p></div></div>`).join('');
  renderVocabulary(result);
  $('long-sentences').innerHTML = result.longestSentences.map((s,i) => `<div class="sentence-item"><div class="sentence-item-header"><span>SENTENCE ${i+1}</span><b>${s.words} WORDS</b></div><p>${escapeHTML(s.sentence)}</p></div>`).join('');
  $('report-method-note').textContent = result.methodNote + ' Values are estimates, not a complete editorial or curriculum quality review.';
}
function runAnalysis() {
  try {
    const grade = Number($('grade-select').value);
    const method = currentMethod();
    const text = $('chapter-text').value;
    const result = analyzeReadability(text, grade, method, familiarLists[method]);
    state.analysis = result;
    state.expanded = false;
    renderResult(result);
    if (window.innerWidth < 800) $('results-panel').scrollIntoView({behavior:'smooth', block:'start'});
  } catch (error) {
    toast(error.message || 'Could not analyse chapter.', true);
  }
}
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function filenameBase() {
  return (state.sourceName || 'chapter').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi,'-').slice(0,70) || 'chapter';
}
function csvCell(value) {
  const s = String(value ?? '');
  // Prevent spreadsheet formula execution from untrusted chapter text and filenames.
  const safe = /^[\s]*[=+@-]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g,'""')}"`;
}
function downloadCSV() {
  const r = state.analysis;
  if (!r) return;
  const rows = [
    ['CHAPTERGRADE READABILITY REPORT',''],['Source file',state.sourceName || 'Pasted text'],['Target grade',r.grade],
    ['Method',r.method],['Score',r.score.toFixed(3)],['Estimated reading band',gradeBandDisplay(r)],
    ['Suitability',r.suitability.label],['Interpretation',r.suitability.detail],['Words analysed',r.wordCount],
    ['Sentences',r.sentenceCount],['Average sentence length',r.averageSentenceLength],
    ['Unfamiliar words (occurrences)',r.difficultOccurrences],['Unfamiliar words (unique)',r.uniqueUnfamiliar],
    ['Unfamiliar percentage',r.unfamiliarPercentage],['Percentage denominator',r.unfamiliarPercentageBasis],
    ['Methodology',r.methodNote],[],['UNFAMILIAR WORD','FREQUENCY'],
    ...r.unfamiliar.map(x => [x.word,x.frequency]),[],['LONGEST SENTENCES','WORD COUNT'],
    ...r.longestSentences.map(x => [x.sentence,x.words]),[],['WARNINGS',''],
    ...[...state.extractedWarnings,...r.warnings].map(x=>[x,''])
  ];
  downloadFile(`${filenameBase()}-grade-${r.grade}-readability.csv`, '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
function downloadJSON() {
  const r = state.analysis;
  if (!r) return;
  downloadFile(`${filenameBase()}-grade-${r.grade}-readability.json`, JSON.stringify({app:'ChapterGrade',version:'1.0',date:new Date().toISOString(),source:state.sourceName || 'Pasted text',sourceType:state.sourceType,extractionWarnings:state.extractedWarnings,...r},null,2), 'application/json;charset=utf-8');
}

$('dropzone').addEventListener('click', () => $('file-input').click());
$('dropzone').addEventListener('keydown', e => {if (e.key==='Enter' || e.key===' ') {e.preventDefault(); $('file-input').click();}});
$('dropzone').addEventListener('dragover', e => {e.preventDefault(); $('dropzone').classList.add('drag-over');});
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('drag-over'));
$('dropzone').addEventListener('drop', e => {e.preventDefault(); $('dropzone').classList.remove('drag-over'); if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);});
$('file-input').addEventListener('change', e => {if(e.target.files.length)loadFile(e.target.files[0]);e.target.value='';});
$('paste-toggle').addEventListener('click', () => {showEditor();$('chapter-text').focus();});
$('grade-select').addEventListener('change', updateMethod);
$('method-select').addEventListener('change', updateMethod);
$('chapter-text').addEventListener('input', () => {if (!state.sourceName && $('chapter-text').value.trim()) state.sourceType='PASTED TEXT'; updateTextCount();});
$('analyze-btn').addEventListener('click', runAnalysis);
$('show-more').addEventListener('click', () => {if(state.analysis){state.expanded=!state.expanded;renderVocabulary(state.analysis);}});
$('download-csv').addEventListener('click', downloadCSV);
$('download-json').addEventListener('click', downloadJSON);
$('print-report').addEventListener('click', () => {if(state.analysis)window.print();});
updateMethod();
updateTextCount();
