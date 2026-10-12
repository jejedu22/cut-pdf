'use strict';
const { PDFDocument, degrees } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

const $ = id => document.getElementById(id);
let srcBytes = null, srcName = '', pageCount = 0, outputs = [];
const selected = new Set();
let pdfDoc = null;
const rotations = new Map(); // page -> 0/90/180/270 (ajout à la rotation d'origine)

const drop = $('drop'), fileInput = $('file');
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => fileInput.files[0] && load(fileInput.files[0]));
$('reset').onclick = () => { $('editor').hidden = true; drop.hidden = false; fileInput.value = ''; };
$('mode').onchange = updateMode;
$('selAll').onclick = () => { for (let i = 1; i <= pageCount; i++) selected.add(i); refreshSel(); };
$('selNone').onclick = () => { selected.clear(); refreshSel(); };
$('go').onclick = split;
$('rotL').onclick = () => rotateMany(-90);
$('rotR').onclick = () => rotateMany(90);
$('zip').onclick = downloadZip;

function showError(msg) { const e = $('error'); e.textContent = msg || ''; e.hidden = !msg; }

async function load(file) {
  showError('');
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return alert('Veuillez choisir un fichier PDF.');
  srcBytes = new Uint8Array(await file.arrayBuffer());
  srcName = file.name.replace(/\.pdf$/i, '');
  let pdf;
  try { pdf = await pdfjsLib.getDocument({ data: srcBytes.slice() }).promise; }
  catch (e) { return alert('Impossible de lire ce PDF (fichier corrompu ou protégé par mot de passe).'); }
  pdfDoc = pdf;
  pageCount = pdf.numPages;
  selected.clear(); rotations.clear(); outputs = []; $('results').hidden = true;
  $('fileInfo').textContent = `${file.name} — ${pageCount} page${pageCount > 1 ? 's' : ''}`;
  drop.hidden = true; $('editor').hidden = false;
  updateMode();
  await renderThumbs();
}

async function renderPage(i) {
  const cell = document.querySelector(`.thumb[data-page="${i}"]`);
  if (!cell) return;
  const page = await pdfDoc.getPage(i);
  const vp = page.getViewport({ scale: 0.3, rotation: (page.rotate + (rotations.get(i) || 0)) % 360 });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  cell.querySelector('.ph').replaceChildren(c);
  cell.querySelector('.rot').textContent = rotations.get(i) ? `↻ ${rotations.get(i)}°` : '';
}

function rotatePage(i, delta) {
  rotations.set(i, ((rotations.get(i) || 0) + delta + 360) % 360);
  return renderPage(i);
}

const useSel = () => $('mode').value === 'selection' && selected.size > 0;
// Pivote les pages sélectionnées, ou toutes si aucune sélection
function rotateMany(delta) {
  const pages = useSel() ? [...selected] : Array.from({ length: pageCount }, (_, i) => i + 1);
  return Promise.all(pages.map(p => rotatePage(p, delta)));
}

async function renderThumbs() {
  const box = $('thumbs'); box.innerHTML = '';
  for (let i = 1; i <= pageCount; i++) {
    const d = document.createElement('div'); d.className = 'thumb'; d.dataset.page = i;
    d.innerHTML = `<div class="ph"></div>Page ${i} <span class="rot"></span>
      <div class="btns"><button type="button" title="Pivoter à gauche">⟲</button><button type="button" title="Pivoter à droite">⟳</button></div>`;
    const [l, r] = d.querySelectorAll('.btns button');
    l.onclick = e => { e.stopPropagation(); rotatePage(i, -90); };
    r.onclick = e => { e.stopPropagation(); rotatePage(i, 90); };
    d.onclick = () => { if ($('mode').value !== 'selection') return; selected.has(i) ? selected.delete(i) : selected.add(i); refreshSel(); };
    box.appendChild(d);
  }
  const doc = pdfDoc;
  for (let i = 1; i <= pageCount; i++) {
    if (doc !== pdfDoc) return;
    await renderPage(i);
  }
}

function updateMode() {
  const m = $('mode').value;
  $('rangesBox').hidden = m !== 'ranges';
  $('everyBox').hidden = m !== 'every';
  $('selTools').hidden = m !== 'selection';
  $('thumbs').classList.toggle('selectable', m === 'selection');
  $('hint').textContent = {
    ranges: `Séparez les plages par des virgules : "1-3, 4-6, 9" crée 3 fichiers. Document de ${pageCount} pages.`,
    selection: 'Cliquez sur les miniatures pour choisir les pages à extraire dans un seul fichier.',
    every: 'Crée un fichier tous les N pages.',
    single: `Crée ${pageCount} fichiers d'une page.`
  }[m];
  refreshSel();
}

function refreshSel() {
  document.querySelectorAll('.thumb').forEach(t => t.classList.toggle('sel', selected.has(+t.dataset.page)));
  $('rotHint').textContent = useSel() ? 'Pivote la sélection' : 'Pivote toutes les pages';
  $('selCount').textContent = `${selected.size} page(s) sélectionnée(s)`;
}

// "1-3, 5" -> [[1,2,3],[5]]
function parseRanges(text) {
  const groups = [];
  for (const part of text.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error(`Plage invalide : "${part}"`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b < a || b > pageCount) throw new Error(`Plage hors limites : "${part}" (le document a ${pageCount} pages)`);
    groups.push(Array.from({ length: b - a + 1 }, (_, i) => a + i));
  }
  if (!groups.length) throw new Error('Indiquez au moins une plage.');
  return groups;
}

function buildGroups() {
  const m = $('mode').value;
  const all = Array.from({ length: pageCount }, (_, i) => i + 1);
  if (m === 'ranges') return parseRanges($('ranges').value);
  if (m === 'selection') {
    if (!selected.size) throw new Error('Sélectionnez au moins une page.');
    return [[...selected].sort((a, b) => a - b)];
  }
  if (m === 'single') return all.map(p => [p]);
  const n = Math.max(1, parseInt($('every').value, 10) || 1);
  const g = []; for (let i = 0; i < all.length; i += n) g.push(all.slice(i, i + n));
  return g;
}

const label = g => g.length === 1 ? `p${g[0]}` : `p${g[0]}-${g[g.length - 1]}`;

async function split() {
  showError('');
  let groups;
  try { groups = buildGroups(); } catch (e) { return showError(e.message); }
  const btn = $('go'); btn.disabled = true; btn.textContent = 'Découpe en cours…';
  try {
    const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
    outputs.forEach(o => URL.revokeObjectURL(o.url));
    outputs = [];
    for (const g of groups) {
      const doc = await PDFDocument.create();
      const pages = await doc.copyPages(src, g.map(p => p - 1));
      pages.forEach((p, k) => {
        const extra = rotations.get(g[k]) || 0;
        if (extra) p.setRotation(degrees((p.getRotation().angle + extra) % 360));
        doc.addPage(p);
      });
      const bytes = await doc.save();
      const name = `${srcName}_${label(g)}.pdf`;
      outputs.push({ name, bytes, url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), pages: g.length });
    }
    showResults();
  } catch (e) { showError('Erreur pendant la découpe : ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Découper'; }
}

function showResults() {
  const ul = $('list'); ul.innerHTML = '';
  for (const o of outputs) {
    const li = document.createElement('li');
    const a = document.createElement('a'); a.href = o.url; a.download = o.name; a.textContent = o.name;
    const s = document.createElement('span'); s.textContent = `${o.pages} page(s) · ${(o.bytes.length / 1024).toFixed(0)} Ko`;
    li.append(a, s); ul.appendChild(li);
  }
  $('zip').hidden = outputs.length < 2;
  $('results').hidden = false;
  $('results').scrollIntoView({ behavior: 'smooth' });
}

async function downloadZip() {
  const zip = new JSZip();
  outputs.forEach(o => zip.file(o.name, o.bytes));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${srcName}_decoupe.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
