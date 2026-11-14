import 'cal-sans';
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
const state = {sourceName: '', sourceType: 'PASTED TEXT', extractedWarnings: [], analysis: null, expanded: false, requestId: 0, processing: false, analysing: false, subject: ''};
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
  $('paste-toggle').querySelector('span').textContent = 'Edit chapter text';
}
function setDrawer(open, focus = false) {
  $('upload-drawer').classList.toggle('open', open);
  $('drawer-backdrop').classList.toggle('open', open);
  document.body.classList.toggle('drawer-open', open);
  if (open && focus) requestAnimationFrame(() => $('dropzone').focus());
  if (!open && focus) $('reset-btn').focus();
}
function setProcessing(busy, message = '') {
  state.processing = busy;
  $('extraction-feedback').classList.toggle('hidden', !busy);
  if (busy) $('extraction-label').textContent = message || 'Reading chapter…';
  $('dropzone').classList.toggle('is-loading', busy);
  updateAnalyzeButton();
}
function updateAnalyzeButton() {
  const count = tokenize($('chapter-text').value).length;
  $('analyze-btn').disabled = count < 30 || state.processing || state.analysing;
  $('analyze-label').textContent = state.analysing ? 'Analysing chapter…' : 'Analyse chapter';
  $('analyze-arrow').classList.toggle('hidden', state.analysing);
  $('analyze-spinner').classList.toggle('hidden', !state.analysing);
  $('analysis-helper').textContent = state.processing
    ? 'Extracting text. Large PDFs can take longer to read.'
    : state.analysing ? 'Calculating the readability score.'
    : count < 30 ? 'Upload a chapter or paste at least 30 words.'
    : `${nf.format(count)} words ready to analyse`;
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
  updateAnalyzeButton();
  clearReport();
}
function clearReport() {
  state.analysis = null;
  state.expanded = false;
  $('report').classList.add('hidden');
  $('results-section').classList.add('hidden');
  $('assessment-row').classList.add('hidden');
  $('list-empty').classList.remove('hidden');
  $('assessment-count').textContent = '0 chapters';
}
function setSourceMeta(primary, secondary, busy = false) {
  const meta = $('source-meta');
  meta.classList.remove('hidden');
  meta.classList.toggle('busy', busy);
  meta.innerHTML = `<strong>${escapeHTML(primary)}</strong><small>${escapeHTML(secondary)}</small>`;
  if (busy) setProcessing(true, secondary);
}
async function loadFile(file) {
  const id = ++state.requestId;
  setProcessing(true, 'Preparing text extraction…');
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
    setProcessing(false);
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
    if (id === state.requestId) {
      $('chapter-text').disabled = false;
      setProcessing(false);
    }
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
  $('results-section').classList.remove('hidden');
  $('report').classList.remove('hidden');
  $('list-empty').classList.add('hidden');
  $('assessment-row').classList.remove('hidden');
  $('assessment-count').textContent = '1 chapter';
  $('row-file').textContent = state.sourceName || 'Pasted chapter';
  $('row-date').textContent = [state.subject, new Date().toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'})].filter(Boolean).join(' · ');
  $('row-grade').textContent = `Grade ${result.grade}`;
  $('row-method').textContent = result.method === 'spache' ? 'Spache' : 'Dale–Chall';
  $('row-status').className = `row-outcome ${result.suitability.status}`;
  $('row-status').textContent = result.suitability.label;
  $('results-description').textContent = [state.subject, `Grade ${result.grade}`, state.sourceName || 'Pasted chapter'].filter(Boolean).join(' · ');

  $('report-date').textContent = new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}).toUpperCase();
  $('report-file').textContent = [state.subject, state.sourceName || 'Pasted chapter'].filter(Boolean).join(' · ');
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
async function runAnalysis() {
  if (state.analysing || state.processing) return;
  state.analysing = true;
  updateAnalyzeButton();
  // Yield a paint so users see the busy state on longer documents.
  await new Promise(resolve => setTimeout(resolve, 35));
  try {
    const grade = Number($('grade-select').value);
    const method = currentMethod();
    const text = $('chapter-text').value;
    state.subject = $('subject-select').value;
    const result = analyzeReadability(text, grade, method, familiarLists[method]);
    state.analysis = result;
    state.expanded = false;
    renderResult(result);
    setDrawer(false);
    requestAnimationFrame(() => $('results-section').scrollIntoView({behavior: 'smooth', block: 'start'}));
    toast('Readability report ready.');
  } catch (error) {
    toast(error.message || 'Could not analyse chapter.', true);
  } finally {
    state.analysing = false;
    updateAnalyzeButton();
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
    ['CHAPTERGRADE READABILITY REPORT',''],['Source file',state.sourceName || 'Pasted text'],['Subject',state.subject || 'Not specified'],['Target grade',r.grade],
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
  downloadFile(`${filenameBase()}-grade-${r.grade}-readability.json`, JSON.stringify({app:'ChapterGrade',version:'1.0',date:new Date().toISOString(),source:state.sourceName || 'Pasted text',sourceType:state.sourceType,subject:state.subject,extractionWarnings:state.extractedWarnings,...r},null,2), 'application/json;charset=utf-8');
}

$('dropzone').addEventListener('click', () => $('file-input').click());
$('dropzone').addEventListener('keydown', e => {if (e.key==='Enter' || e.key===' ') {e.preventDefault(); $('file-input').click();}});
$('dropzone').addEventListener('dragover', e => {e.preventDefault(); $('dropzone').classList.add('drag-over');});
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('drag-over'));
$('dropzone').addEventListener('drop', e => {e.preventDefault(); $('dropzone').classList.remove('drag-over'); if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);});
$('file-input').addEventListener('change', e => {if(e.target.files.length)loadFile(e.target.files[0]);e.target.value='';});
$('paste-toggle').addEventListener('click', () => {showEditor();$('chapter-text').focus();});
$('subject-select').addEventListener('change', clearReport);
$('grade-select').addEventListener('change', updateMethod);
$('method-select').addEventListener('change', updateMethod);
$('chapter-text').addEventListener('input', () => {if (!state.sourceName && $('chapter-text').value.trim()) state.sourceType='PASTED TEXT'; updateTextCount();});
$('analyze-btn').addEventListener('click', runAnalysis);
$('show-more').addEventListener('click', () => {if(state.analysis){state.expanded=!state.expanded;renderVocabulary(state.analysis);}});
$('download-csv').addEventListener('click', downloadCSV);
$('download-json').addEventListener('click', downloadJSON);
$('print-report').addEventListener('click', () => {if(state.analysis)window.print();});
function resetAssessment() {
  ++state.requestId;
  state.sourceName = '';
  state.sourceType = 'PASTED TEXT';
  state.subject = '';
  state.extractedWarnings = [];
  state.processing = false;
  state.analysing = false;
  $('file-input').value = '';
  $('chapter-text').value = '';
  $('chapter-text').disabled = false;
  $('text-editor-wrap').classList.add('hidden');
  $('paste-toggle').querySelector('span').textContent = 'Paste chapter text';
  $('source-meta').classList.add('hidden');
  $('extraction-feedback').classList.add('hidden');
  $('subject-select').value = '';
  $('grade-select').value = '5';
  $('method-select').value = 'auto';
  updateMethod();
  updateTextCount();
  $('workspace').classList.remove('hidden');
  $('methods').classList.add('hidden');
  $('nav-workspace').classList.add('active');
  $('nav-methods').classList.remove('active');
  setDrawer(true, true);
}
$('reset-btn').addEventListener('click', resetAssessment);
$('open-upload-inline').addEventListener('click', () => setDrawer(true, true));
$('drawer-close').addEventListener('click', () => setDrawer(false, true));
$('drawer-backdrop').addEventListener('click', () => setDrawer(false));
$('view-report-btn').addEventListener('click', () => $('results-section').scrollIntoView({behavior: 'smooth', block: 'start'}));
$('nav-methods').addEventListener('click', () => {
  setDrawer(false);
  $('nav-workspace').classList.remove('active');
  $('nav-methods').classList.add('active');
  $('workspace').classList.add('hidden');
  $('methods').classList.remove('hidden');
});
$('nav-workspace').addEventListener('click', () => {
  setDrawer(false);
  $('nav-methods').classList.remove('active');
  $('nav-workspace').classList.add('active');
  $('workspace').classList.remove('hidden');
  $('methods').classList.add('hidden');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('upload-drawer').classList.contains('open')) setDrawer(false, true);
});
updateMethod();
updateTextCount();
setDrawer(false);
