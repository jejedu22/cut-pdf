'use strict';
const { PDFDocument, degrees } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

const $ = id => document.getElementById(id);
const MAX_PIXELS = 16e6;

let pdf = null, srcBytes = null, srcDoc = null, srcName = '';
let pages = [];            // état par page : { rot, deleted, cut } (cut = coupure après cette page)
let cur = 1, zoom = 1;     // page courante (1-based), zoom relatif à « ajusté »
let loadId = 0, mainTask = 0;
const pageCache = new Map();

/* ---------- Chargement ---------- */

const drop = $('drop'), fileInput = $('file');
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => { e.preventDefault(); if (e.target !== drop && e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => fileInput.files[0] && load(fileInput.files[0]));
$('reset').onclick = () => fileInput.click();

async function load(file) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return alert('Veuillez choisir un fichier PDF.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let doc;
  try { doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise; }
  catch (e) { return alert('Impossible de lire ce PDF (fichier corrompu ou protégé par mot de passe).'); }
  fileInput.value = '';
  pdf = doc; srcBytes = bytes; srcDoc = null;
  srcName = file.name.replace(/\.pdf$/i, '');
  pageCache.clear();
  pages = Array.from({ length: pdf.numPages }, () => ({ rot: 0, deleted: false, cut: false }));
  cur = 1; zoom = 1;
  $('fileInfo').textContent = `${file.name} — ${pages.length} page${pages.length > 1 ? 's' : ''}`;
  $('fileInfo').hidden = false; $('reset').hidden = false;
  drop.hidden = true; $('app').hidden = false;
  $('pageNum').max = pages.length; $('pageTotal').textContent = `/ ${pages.length}`;
  buildThumbs();
  refresh();
  goTo(1);
  renderAllThumbs(++loadId);
}

const getPage = i => {
  if (!pageCache.has(i)) pageCache.set(i, pdf.getPage(i));
  return pageCache.get(i);
};
const rotationOf = (page, i) => (page.rotate + pages[i - 1].rot) % 360;

/* ---------- Parties ---------- */

function computeParts() {
  const out = []; let group = [];
  pages.forEach((p, idx) => {
    if (!p.deleted) group.push(idx + 1);
    if (p.cut && group.length) { out.push(group); group = []; }
  });
  if (group.length) out.push(group);
  return out;
}

function rangesLabel(list, sep) {
  const r = [];
  for (let i = 0; i < list.length;) {
    let j = i; while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    r.push(j > i ? `${list[i]}-${list[j]}` : `${list[i]}`); i = j + 1;
  }
  return r.join(sep);
}

/* ---------- Miniatures ---------- */

function buildThumbs() {
  const box = $('thumbs'); box.replaceChildren();
  for (let i = 1; i <= pages.length; i++) {
    const d = document.createElement('div');
    d.className = 'thumb'; d.dataset.page = i;
    d.innerHTML = '<div class="ph"></div><div><span class="num"></span> <span class="rot"></span></div>';
    d.querySelector('.num').textContent = i;
    d.onclick = () => goTo(i);
    box.appendChild(d);
    if (i < pages.length) {
      const c = document.createElement('button');
      c.type = 'button'; c.className = 'cut'; c.dataset.after = i;
      c.title = `Couper entre les pages ${i} et ${i + 1}`;
      c.innerHTML = '<span>✂</span>';
      c.onclick = () => toggleCut(i);
      box.appendChild(c);
    }
  }
}

async function renderThumb(i) {
  const cell = document.querySelector(`.thumb[data-page="${i}"]`);
  if (!cell) return;
  const page = await getPage(i);
  const vp = page.getViewport({ scale: 0.25, rotation: rotationOf(page, i) });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  cell.querySelector('.ph').replaceChildren(c);
}

async function renderAllThumbs(id) {
  for (let i = 1; i <= pages.length; i++) {
    if (id !== loadId) return;
    await renderThumb(i);
  }
}

/* ---------- Mise à jour de l'interface ---------- */

function refresh() {
  const parts = computeParts();
  const partOf = new Map();
  parts.forEach((g, k) => g.forEach(p => partOf.set(p, k)));

  document.querySelectorAll('.thumb').forEach(t => {
    const i = +t.dataset.page, st = pages[i - 1];
    t.classList.toggle('cur', i === cur);
    t.classList.toggle('del', st.deleted);
    if (partOf.has(i)) t.dataset.part = partOf.get(i) % 6; else delete t.dataset.part;
    t.querySelector('.rot').textContent = st.rot ? `↻ ${st.rot}°` : '';
  });
  document.querySelectorAll('.cut').forEach(c => c.classList.toggle('on', pages[+c.dataset.after - 1].cut));

  const st = pages[cur - 1], last = cur === pages.length;
  $('pageNum').value = cur;
  $('prev').disabled = cur <= 1; $('next').disabled = last;
  $('cutBtn').disabled = last; $('cutBtn').classList.toggle('on', st.cut && !last);
  $('delBtn').textContent = st.deleted ? '↩ Restaurer' : '🗑 Supprimer';
  $('delBtn').classList.toggle('on', st.deleted);
  $('cutLine').hidden = last;
  $('cutLine').classList.toggle('on', st.cut);
  $('cutLine').textContent = st.cut ? `✂ Coupure après la page ${cur} (cliquer pour retirer)` : `✂ Couper après la page ${cur}`;
  $('pageWrap').classList.toggle('del', st.deleted);
  $('zoomLabel').textContent = `${Math.round(zoom * 100)} %`;

  renderParts(parts);
}

function renderParts(parts) {
  const ol = $('partList'); ol.replaceChildren();
  parts.forEach((g, k) => {
    const li = document.createElement('li'); li.dataset.part = k % 6;
    const t = document.createElement('div'); t.className = 't';
    const b = document.createElement('b'); b.textContent = `Partie ${k + 1}`;
    const s = document.createElement('span');
    s.textContent = `page${g.length > 1 ? 's' : ''} ${rangesLabel(g, ', ')} (${g.length})`;
    t.append(b, s);
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn'; btn.textContent = '⬇'; btn.title = 'Télécharger cette partie';
    btn.onclick = () => downloadPart(g, btn);
    li.append(t, btn); ol.appendChild(li);
  });
  $('partEmpty').hidden = parts.length > 0;
  $('zip').hidden = parts.length < 2;
}

/* ---------- Navigation et actions sur la page ---------- */

function goTo(i) {
  cur = Math.min(Math.max(1, i | 0), pages.length);
  refresh();
  document.querySelector(`.thumb[data-page="${cur}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  renderMain();
}

function rotate(i, d) {
  pages[i - 1].rot = (pages[i - 1].rot + d + 360) % 360;
  renderThumb(i);
  if (i === cur) renderMain();
}

function rotateAll(d) {
  for (let i = 1; i <= pages.length; i++) pages[i - 1].rot = (pages[i - 1].rot + d + 360) % 360;
  for (let i = 1; i <= pages.length; i++) renderThumb(i);
  renderMain(); refresh();
}

function toggleCut(i) {
  if (i < 1 || i >= pages.length) return;
  pages[i - 1].cut = !pages[i - 1].cut;
  refresh();
}

function toggleDelete(i) {
  pages[i - 1].deleted = !pages[i - 1].deleted;
  refresh();
}

function setZoom(z) {
  zoom = Math.min(4, Math.max(0.25, z));
  refresh(); renderMain();
}

$('prev').onclick = () => goTo(cur - 1);
$('next').onclick = () => goTo(cur + 1);
$('pageNum').onchange = e => goTo(parseInt(e.target.value, 10) || cur);
$('rotL').onclick = () => { rotate(cur, -90); refresh(); };
$('rotR').onclick = () => { rotate(cur, 90); refresh(); };
$('cutBtn').onclick = () => toggleCut(cur);
$('cutLine').onclick = () => toggleCut(cur);
$('delBtn').onclick = () => toggleDelete(cur);
$('zoomIn').onclick = () => setZoom(zoom * 1.25);
$('zoomOut').onclick = () => setZoom(zoom / 1.25);
$('zoomFit').onclick = () => setZoom(1);

$('allL').onclick = () => rotateAll(-90);
$('allR').onclick = () => rotateAll(90);
$('cutAll').onclick = () => { pages.forEach((p, k) => p.cut = k < pages.length - 1); refresh(); };
$('cutEvery').onclick = () => {
  const n = Math.max(1, parseInt($('every').value, 10) || 1);
  pages.forEach((p, k) => p.cut = (k + 1) % n === 0 && k < pages.length - 1);
  refresh();
};
$('clearCuts').onclick = () => { pages.forEach(p => p.cut = false); refresh(); };
$('restore').onclick = () => { pages.forEach(p => p.deleted = false); refresh(); };

document.addEventListener('keydown', e => {
  if (!pdf || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'PageUp') goTo(cur - 1);
  else if (k === 'ArrowRight' || k === 'PageDown') goTo(cur + 1);
  else if (k === 'Home') goTo(1);
  else if (k === 'End') goTo(pages.length);
  else if (k === 'r') { rotate(cur, 90); refresh(); }
  else if (k === 'R') { rotate(cur, -90); refresh(); }
  else if (k === 'c' || k === 'C') toggleCut(cur);
  else if (k === 'Delete') toggleDelete(cur);
  else if (k === '+' || k === '=') setZoom(zoom * 1.25);
  else if (k === '-') setZoom(zoom / 1.25);
  else if (k === '0') setZoom(1);
  else return;
  e.preventDefault();
});

$('stage').addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });

let resizeTimer;
new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => pdf && renderMain(), 150); }).observe($('stage'));

/* ---------- Rendu de la page courante ---------- */

async function renderMain() {
  const i = cur, task = ++mainTask;
  const page = await getPage(i);
  const rotation = rotationOf(page, i);
  const base = page.getViewport({ scale: 1, rotation });
  const st = $('stage');
  const fit = Math.max(0.05, Math.min((st.clientWidth - 32) / base.width, (st.clientHeight - 32 - ($('cutLine').offsetHeight || 0) - 10) / base.height));
  const css = fit * zoom;
  let scale = css * (window.devicePixelRatio || 1);
  const area = base.width * base.height * scale * scale;
  if (area > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / area);
  const vp = page.getViewport({ scale, rotation });
  const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
  c.style.width = base.width * css + 'px'; c.style.height = base.height * css + 'px';
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  if (task !== mainTask) return;
  $('pageWrap').replaceChildren(c);
}

/* ---------- Export ---------- */

async function buildPart(group) {
  srcDoc ||= await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(srcDoc, group.map(p => p - 1));
  copied.forEach((pg, k) => {
    const extra = pages[group[k] - 1].rot;
    if (extra) pg.setRotation(degrees((pg.getRotation().angle + extra) % 360));
    doc.addPage(pg);
  });
  return doc.save();
}

const partName = g => `${srcName}_p${rangesLabel(g, '+')}.pdf`;

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function withBusy(btn, fn) {
  const label = btn.textContent; btn.disabled = true; btn.textContent = '…';
  try { await fn(); }
  catch (e) { alert('Erreur pendant la découpe : ' + e.message); }
  finally { btn.disabled = false; btn.textContent = label; }
}

const downloadPart = (g, btn) => withBusy(btn, async () => {
  saveBlob(new Blob([await buildPart(g)], { type: 'application/pdf' }), partName(g));
});

$('zip').onclick = e => withBusy(e.currentTarget, async () => {
  const zip = new JSZip();
  for (const g of computeParts()) zip.file(partName(g), await buildPart(g));
  saveBlob(await zip.generateAsync({ type: 'blob' }), `${srcName}_decoupe.zip`);
});
