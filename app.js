'use strict';
const { PDFDocument, degrees } = PDFLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

const $ = id => document.getElementById(id);
const MAX_PIXELS = 16e6;

let sources = [];          // documents ouverts : { name, pdf (pdf.js), bytes, doc (pdf-lib, paresseux), cache }
let srcName = '';
let pages = [];            // pages du document courant : { src, num, rot, deleted, cut } (cut = coupure après cette page)
let cur = 1, zoom = 1;     // page courante (1-based), zoom relatif à « ajusté »
let loadId = 0, mainTask = 0;

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
  sources = [newSource(file.name, doc, bytes)];
  srcName = file.name.replace(/\.pdf$/i, '');
  pages = Array.from({ length: doc.numPages }, (_, k) => newPage(0, k + 1));
  cur = 1; zoom = 1;
  $('fileInfo').hidden = false; $('reset').hidden = false;
  drop.hidden = true; $('app').hidden = false;
  buildThumbs();
  refresh();
  goTo(1);
  renderAllThumbs(++loadId);
}

const newSource = (name, pdf, bytes) => ({ name, pdf, bytes, doc: null, cache: new Map() });
const newPage = (src, num) => ({ src, num, rot: 0, deleted: false, cut: false });

const getPageOf = e => {
  const s = sources[e.src];
  if (!s.cache.has(e.num)) s.cache.set(e.num, s.pdf.getPage(e.num));
  return s.cache.get(e.num);
};
const getPage = i => getPageOf(pages[i - 1]);
const rotationOf = (page, e) => (page.rotate + e.rot) % 360;

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
    d.className = 'thumb'; d.dataset.page = i; d.draggable = true;
    pages[i - 1].el = d;
    d.innerHTML = '<div class="ph"></div><div><span class="num"></span> <span class="rot"></span></div><div class="from"></div>';
    d.querySelector('.num').textContent = i;
    if (pages[i - 1].src) {
      const f = d.querySelector('.from');
      f.textContent = '📎 ' + sources[pages[i - 1].src].name; f.title = 'Insérée depuis ' + sources[pages[i - 1].src].name;
    }
    if (pages[i - 1].thumb) d.querySelector('.ph').replaceChildren(pages[i - 1].thumb);
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
  const e = pages[i - 1];
  if (!e) return;
  const page = await getPageOf(e);
  const vp = page.getViewport({ scale: 0.25, rotation: rotationOf(page, e) });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  e.thumb = c;
  e.el?.querySelector('.ph').replaceChildren(c);
}

async function renderAllThumbs(id) {
  for (let i = 1; i <= pages.length; i++) {
    if (id !== loadId) return;
    if (!pages[i - 1].thumb) await renderThumb(i);
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
  $('pageNum').value = cur; $('pageNum').max = pages.length; $('pageTotal').textContent = `/ ${pages.length}`;
  $('fileInfo').textContent = `${srcName}.pdf — ${pages.length} page${pages.length > 1 ? 's' : ''}`;
  $('prev').disabled = cur <= 1; $('next').disabled = last;
  $('cutBtn').disabled = last; $('cutBtn').classList.toggle('on', st.cut && !last);
  $('delBtn').textContent = st.deleted ? '↩ Restaurer' : '🗑 Supprimer';
  $('delBtn').classList.toggle('on', st.deleted);
  $('moveUp').disabled = cur <= 1; $('moveDown').disabled = last;
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

$('moveUp').onclick = () => movePage(cur, cur - 1);
$('moveDown').onclick = () => movePage(cur, cur + 1);

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
  if (!pages.length || !$('insertDlg').hidden || e.ctrlKey || e.metaKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const k = e.key;
  if (e.altKey) {
    if (k === 'ArrowLeft' || k === 'ArrowUp') movePage(cur, cur - 1);
    else if (k === 'ArrowRight' || k === 'ArrowDown') movePage(cur, cur + 1);
    else return;
    e.preventDefault(); return;
  }
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
new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => pages.length && renderMain(), 150); }).observe($('stage'));

/* ---------- Rendu de la page courante ---------- */

async function renderMain() {
  const i = cur, task = ++mainTask;
  const page = await getPage(i);
  const rotation = rotationOf(page, pages[i - 1]);
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

async function sourceDoc(k) {
  const src = sources[k];
  src.doc ||= await PDFDocument.load(src.bytes, { ignoreEncryption: true });
  return src.doc;
}

async function buildPart(group) {
  const doc = await PDFDocument.create();
  // Copie par séries de pages consécutives issues du même document (évite de dupliquer les ressources).
  for (let i = 0; i < group.length;) {
    const k = pages[group[i] - 1].src;
    let j = i; while (j < group.length && pages[group[j] - 1].src === k) j++;
    const run = group.slice(i, j);
    const copied = await doc.copyPages(await sourceDoc(k), run.map(p => pages[p - 1].num - 1));
    copied.forEach((pg, n) => {
      const extra = pages[run[n] - 1].rot;
      if (extra) pg.setRotation(degrees((pg.getRotation().angle + extra) % 360));
      doc.addPage(pg);
    });
    i = j;
  }
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

/* ---------- Insertion de pages d'un autre document ---------- */

const dlg = $('insertDlg');
let incoming = null;                 // { name, pdf, bytes } du document A
const picked = new Set();

$('insertBtn').onclick = () => $('insertFile').click();
$('insertFile').addEventListener('change', async () => {
  const file = $('insertFile').files[0];
  $('insertFile').value = '';
  if (!file) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return alert('Veuillez choisir un fichier PDF.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let doc;
  try { doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise; }
  catch (e) { return alert('Impossible de lire ce PDF (fichier corrompu ou protégé par mot de passe).'); }
  openInsertDialog(newSource(file.name, doc, bytes));
});

function openInsertDialog(src) {
  incoming = src; picked.clear();
  $('insertTitle').textContent = `Pages à insérer depuis « ${src.name} »`;
  const sel = $('insertPos');
  sel.replaceChildren(
    new Option('Au début du document', '0'),
    new Option(`Après la page courante (${cur})`, String(cur)),
    new Option('À la fin du document', String(pages.length)));
  sel.value = String(cur);
  const box = $('insertThumbs'); box.replaceChildren();
  for (let n = 1; n <= src.pdf.numPages; n++) {
    const d = document.createElement('div');
    d.className = 'pick'; d.dataset.num = n; d.tabIndex = 0; d.setAttribute('role', 'checkbox'); d.setAttribute('aria-checked', 'false');
    d.innerHTML = '<div class="ph"></div><span></span>';
    d.lastChild.textContent = `Page ${n}`;
    const toggle = () => {
      picked.has(n) ? picked.delete(n) : picked.add(n);
      d.classList.toggle('sel', picked.has(n)); d.setAttribute('aria-checked', picked.has(n));
      updateInsertCount();
    };
    d.onclick = toggle;
    d.onkeydown = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } };
    box.appendChild(d);
  }
  updateInsertCount();
  dlg.hidden = false;
  renderPickThumbs(src);
}

async function renderPickThumbs(src) {
  for (let n = 1; n <= src.pdf.numPages; n++) {
    if (incoming !== src) return;
    const page = await src.pdf.getPage(n);
    const vp = page.getViewport({ scale: 0.3 });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    document.querySelector(`.pick[data-num="${n}"] .ph`)?.replaceChildren(c);
  }
}

function updateInsertCount() {
  $('insertCount').textContent = `${picked.size} page(s) sélectionnée(s)`;
  $('insertOk').disabled = picked.size === 0;
}

function closeInsertDialog() { dlg.hidden = true; incoming = null; $('insertThumbs').replaceChildren(); }

$('pickAll').onclick = () => { for (let n = 1; n <= incoming.pdf.numPages; n++) picked.add(n); syncPicks(); };
$('pickNone').onclick = () => { picked.clear(); syncPicks(); };
function syncPicks() {
  document.querySelectorAll('.pick').forEach(d => {
    const on = picked.has(+d.dataset.num); d.classList.toggle('sel', on); d.setAttribute('aria-checked', on);
  });
  updateInsertCount();
}
$('insertCancel').onclick = closeInsertDialog;
dlg.addEventListener('click', e => { if (e.target === dlg) closeInsertDialog(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !dlg.hidden) closeInsertDialog(); });

$('insertOk').onclick = () => {
  const idx = sources.push(incoming) - 1;
  const at = parseInt($('insertPos').value, 10);        // nombre de pages qui précèdent
  const added = [...picked].sort((a, b) => a - b).map(n => newPage(idx, n));
  // Les pages insérées rejoignent la partie de la page qui les précède : la coupure éventuelle passe après elles.
  if (at > 0 && pages[at - 1].cut) { added[added.length - 1].cut = true; pages[at - 1].cut = false; }
  pages.splice(at, 0, ...added);
  incoming = null; dlg.hidden = true; $('insertThumbs').replaceChildren();
  buildThumbs();
  goTo(at + 1);
  renderAllThumbs(++loadId);
};

/* ---------- Déplacement de pages (glisser-déposer) ---------- */

// Déplace la page `from` pour qu'elle devienne la page `to` (1-based).
// Les coupures restent attachées aux emplacements (entre deux positions), pas aux pages :
// une page déplacée au-delà d'une coupure change donc de partie.
function movePage(from, to) {
  if (from === to || to < 1 || to > pages.length) return;
  const cuts = pages.map(p => p.cut);
  pages.splice(to - 1, 0, ...pages.splice(from - 1, 1));
  pages.forEach((p, i) => { p.cut = cuts[i]; });
  buildThumbs();
  goTo(to);
}

let dragFrom = 0, dropAt = null;      // dropAt = { gap, el, edge } : `gap` pages restent avant l'emplacement visé
const thumbsBox = $('thumbs');
const horizontal = () => getComputedStyle(thumbsBox).display === 'flex';

function clearDrop() {
  document.querySelectorAll('.drop-before,.drop-after,.drop-cut').forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-cut'));
  dropAt = null;
}

thumbsBox.addEventListener('dragstart', e => {
  const t = e.target.closest?.('.thumb');
  if (!t) return;
  dragFrom = +t.dataset.page;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragFrom));
  t.classList.add('dragging');
});

thumbsBox.addEventListener('dragover', e => {
  if (!dragFrom) return;
  const t = e.target.closest('.thumb'), c = e.target.closest('.cut');
  if (!t && !c) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  clearDrop();
  if (t) {
    const r = t.getBoundingClientRect();
    const after = horizontal() ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    const p = +t.dataset.page;
    dropAt = { gap: after ? p : p - 1 };
    t.classList.add(after ? 'drop-after' : 'drop-before');
  } else {
    dropAt = { gap: +c.dataset.after };
    c.classList.add('drop-cut');
  }
});

thumbsBox.addEventListener('dragleave', e => { if (!thumbsBox.contains(e.relatedTarget)) clearDrop(); });

thumbsBox.addEventListener('drop', e => {
  e.preventDefault();
  const g = dropAt?.gap, from = dragFrom;
  clearDrop(); dragFrom = 0;
  if (g === undefined || !from) return;
  movePage(from, g > from ? g : g + 1);
});

thumbsBox.addEventListener('dragend', () => {
  dragFrom = 0; clearDrop();
  document.querySelectorAll('.dragging').forEach(n => n.classList.remove('dragging'));
});

// Défilement automatique de la colonne pendant le glisser
$('side').addEventListener('dragover', e => {
  if (!dragFrom) return;
  const r = $('side').getBoundingClientRect(), m = 48;
  if (horizontal()) {
    if (e.clientX < r.left + m) $('side').scrollLeft -= 12; else if (e.clientX > r.right - m) $('side').scrollLeft += 12;
  } else if (e.clientY < r.top + m) $('side').scrollTop -= 12;
  else if (e.clientY > r.bottom - m) $('side').scrollTop += 12;
});
