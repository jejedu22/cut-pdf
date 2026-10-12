// État partagé de l'application et actions (document ouvert, pages, coupures, export).
import { reactive, computed, markRaw } from 'vue'
import { PDFDocument, degrees } from 'pdf-lib'
import JSZip from 'jszip'
import pdfjsLib from './lib/pdfjs'
import { optimizeImages } from './lib/optimize'
import { rangesLabel, saveBlob } from './lib/utils'

export const state = reactive({
  sources: [],     // documents ouverts (0 = document principal)
  pages: [],       // pages du document courant : { id, src, num, rot, deleted, cut } — cut = coupure après cette page
  cur: 1,          // page courante (1-based)
  zoom: 1,         // relatif à « ajusté à la fenêtre »
  srcName: '',
  optLevel: 0,
  sizes: {},       // poids (octets) des parties déjà calculées, par `${niveau}|${signature}`
  incoming: null   // document en cours d'insertion (fenêtre de choix des pages)
})

const bytesCache = new Map()
let nextId = 1

const newPage = (src, num) => ({ id: nextId++, src, num, rot: 0, deleted: false, cut: false })
const newSource = (name, pdf, bytes) => markRaw({ name, pdf, bytes, doc: null, cache: new Map() })

export const loaded = computed(() => state.pages.length > 0)
export const fileInfo = computed(() => `${state.srcName}.pdf — ${state.pages.length} page${state.pages.length > 1 ? 's' : ''}`)

/* ---------- Ouverture ---------- */

export async function readPdf(file) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('Veuillez choisir un fichier PDF.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let doc
  try {
    doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  } catch {
    throw new Error('Impossible de lire ce PDF (fichier corrompu ou protégé par mot de passe).')
  }
  return newSource(file.name, doc, bytes)
}

export async function openFile(file) {
  const src = await readPdf(file)
  bytesCache.clear()
  state.sizes = {}
  state.sources = [src]
  state.srcName = file.name.replace(/\.pdf$/i, '')
  state.pages = Array.from({ length: src.pdf.numPages }, (_, k) => newPage(0, k + 1))
  state.cur = 1
  state.zoom = 1
}

export function getPdfPage(source, num) {
  if (!source.cache.has(num)) source.cache.set(num, source.pdf.getPage(num))
  return source.cache.get(num)
}

/* ---------- Parties ---------- */

export const parts = computed(() => {
  const out = []
  let group = []
  state.pages.forEach((p, idx) => {
    if (!p.deleted) group.push(idx + 1)
    if (p.cut && group.length) { out.push(group); group = [] }
  })
  if (group.length) out.push(group)
  return out
})

export const partOf = computed(() => {
  const m = new Map()
  parts.value.forEach((g, k) => g.forEach(p => m.set(p, k)))
  return m
})

/* ---------- Actions sur les pages ---------- */

export function goTo(i) {
  state.cur = Math.min(Math.max(1, i | 0), state.pages.length)
}

export function rotate(i, d) {
  const p = state.pages[i - 1]
  p.rot = (p.rot + d + 360) % 360
}

export function rotateAll(d) {
  for (let i = 1; i <= state.pages.length; i++) rotate(i, d)
}

export function toggleCut(i) {
  if (i < 1 || i >= state.pages.length) return
  state.pages[i - 1].cut = !state.pages[i - 1].cut
}

export function toggleDelete(i) {
  state.pages[i - 1].deleted = !state.pages[i - 1].deleted
}

export function setZoom(z) {
  state.zoom = Math.min(4, Math.max(0.25, z))
}

export function cutAll() {
  state.pages.forEach((p, k) => { p.cut = k < state.pages.length - 1 })
}

export function cutEvery(n) {
  n = Math.max(1, n | 0)
  state.pages.forEach((p, k) => { p.cut = (k + 1) % n === 0 && k < state.pages.length - 1 })
}

export function clearCuts() {
  state.pages.forEach(p => { p.cut = false })
}

export function restoreDeleted() {
  state.pages.forEach(p => { p.deleted = false })
}

// Déplace la page `from` pour qu'elle devienne la page `to` (1-based).
// Les coupures restent attachées aux emplacements (entre deux positions), pas aux pages :
// une page déplacée au-delà d'une coupure change donc de partie.
export function movePage(from, to) {
  if (from === to || to < 1 || to > state.pages.length) return
  const cuts = state.pages.map(p => p.cut)
  const [moved] = state.pages.splice(from - 1, 1)
  state.pages.splice(to - 1, 0, moved)
  state.pages.forEach((p, i) => { p.cut = cuts[i] })
  state.cur = to
}

// Insère les pages `nums` du document `src` après les `at` premières pages.
export function insertPages(src, nums, at) {
  const idx = state.sources.push(src) - 1
  const added = [...nums].sort((a, b) => a - b).map(n => newPage(idx, n))
  // Les pages insérées rejoignent la partie de la page qui les précède : la coupure éventuelle passe après elles.
  if (at > 0 && state.pages[at - 1].cut) {
    added[added.length - 1].cut = true
    state.pages[at - 1].cut = false
  }
  state.pages.splice(at, 0, ...added)
  state.cur = at + 1
}

/* ---------- Export ---------- */

async function sourceDoc(k) {
  const src = state.sources[k]
  src.doc ||= await PDFDocument.load(src.bytes, { ignoreEncryption: true })
  return src.doc
}

async function buildPart(group, level) {
  const doc = await PDFDocument.create()
  // Copie par séries de pages consécutives issues du même document (évite de dupliquer les ressources).
  for (let i = 0; i < group.length;) {
    const k = state.pages[group[i] - 1].src
    let j = i
    while (j < group.length && state.pages[group[j] - 1].src === k) j++
    const run = group.slice(i, j)
    const copied = await doc.copyPages(await sourceDoc(k), run.map(p => state.pages[p - 1].num - 1))
    copied.forEach((pg, n) => {
      const extra = state.pages[run[n] - 1].rot
      if (extra) pg.setRotation(degrees((pg.getRotation().angle + extra) % 360))
      doc.addPage(pg)
    })
    i = j
  }
  await optimizeImages(doc, level)
  return doc.save()
}

const signature = g => g.map(p => { const e = state.pages[p - 1]; return `${e.src}.${e.num}.${e.rot}` }).join(',')
const keyOf = (g, level) => `${level}|${signature(g)}`

// PDF d'une partie au niveau d'optimisation demandé (mis en cache tant que la partie ne change pas)
export async function getPart(group, level = state.optLevel) {
  const key = keyOf(group, level)
  if (!bytesCache.has(key)) {
    const bytes = await buildPart(group, level)
    bytesCache.set(key, bytes)
    state.sizes[key] = bytes.length
  }
  return bytesCache.get(key)
}

export const sizeOf = (g, level) => state.sizes[keyOf(g, level)]

export const partName = g => `${state.srcName}_p${rangesLabel(g, '+')}.pdf`

export async function downloadPart(g) {
  saveBlob(new Blob([await getPart(g)], { type: 'application/pdf' }), partName(g))
}

export async function downloadZip() {
  const zip = new JSZip()
  for (const g of parts.value) zip.file(partName(g), await getPart(g))
  saveBlob(await zip.generateAsync({ type: 'blob' }), `${state.srcName}_decoupe.zip`)
}

// Calcule le poids de chaque partie sans optimisation et au niveau choisi
export async function estimateSizes(onProgress) {
  const list = parts.value.slice()
  for (let k = 0; k < list.length; k++) {
    onProgress?.(k + 1, list.length)
    await getPart(list[k], 0)
    if (state.optLevel) await getPart(list[k], state.optLevel)
  }
}
