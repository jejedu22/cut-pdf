import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { docxToHtml } from './docx'
import { odtToHtml } from './odt'
import { isDisplayable } from './common'

export const ACCEPTED = '.docx,.odt'

// Fichier (.docx ou .odt) -> { html, images, warnings } ; les images sont référencées par `images/<nom>`
export async function convertFile(file) {
  const buf = await file.arrayBuffer()
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'docx') return docxToHtml(buf)
  if (ext === 'odt') return odtToHtml(buf)
  throw new Error('Format non pris en charge : choisissez un fichier .docx ou .odt.')
}

/* ---------- HTML ---------- */

const dataUri = img => {
  let bin = ''
  for (let i = 0; i < img.bytes.length; i += 0x8000) bin += String.fromCharCode(...img.bytes.subarray(i, i + 0x8000))
  return `data:${img.mime};base64,${btoa(bin)}`
}

// Remplace les références `images/...` par des images intégrées (data URI)
export function embedImages(html, images) {
  let out = html
  for (const img of images) out = out.split(`src="images/${img.name}"`).join(`src="${dataUri(img)}"`)
  return out
}

// Mise en forme lisible : un bloc par ligne
export function prettyHtml(html) {
  return html
    .replace(/(<(?:ul|ol|table|thead|tbody|tr|blockquote|section)[^>]*>)/g, '$1\n')
    .replace(/(<\/(?:p|h[1-6]|li|ul|ol|table|thead|tbody|tr|blockquote|section|hr)>|<hr>)/g, '$1\n')
    .replace(/\n{2,}/g, '\n')
    .trim() + '\n'
}

export function htmlDocument(body, title) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n</head>\n<body>\n${body}</body>\n</html>\n`
}

// Aperçu : on retire tout ce qui pourrait s'exécuter
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,link,iframe,object,embed,meta,base,form').forEach(n => n.remove())
  doc.querySelectorAll('*').forEach(n => {
    for (const a of Array.from(n.attributes)) {
      const v = a.value.trim().toLowerCase()
      if (a.name.startsWith('on') || ((a.name === 'href' || a.name === 'src') && /^(javascript|vbscript):/.test(v)) ||
          (a.name === 'src' && /^data:/.test(v) && !/^data:image\/(png|jpe?g|gif|bmp|webp)/.test(v))) n.removeAttribute(a.name)
    }
  })
  return doc.body.innerHTML
}

// Images que le navigateur ne peut pas afficher (EMF, WMF…) : on les signale
export const unsupportedImages = images => images.filter(i => !isDisplayable(i.mime)).length

/* ---------- Markdown ---------- */

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', hr: '---'
  })
  td.use(gfm)
  td.keep(['u', 'sup', 'sub'])
  return td
}

const unwrap = el => { while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el); el.remove() }

// Prépare le HTML pour la conversion Markdown (tableaux GFM, notes de bas de page)
function prepareForMarkdown(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Tableau GFM : une ligne d'en-tête obligatoire, cellules sur une seule ligne
  doc.querySelectorAll('table').forEach(t => {
    t.querySelectorAll('td,th').forEach(cell => {
      const ps = Array.from(cell.children).filter(c => c.tagName === 'P')
      ps.forEach((p, i) => { if (i < ps.length - 1) p.after(doc.createElement('br')); unwrap(p) })
    })
    const first = t.querySelector('tr')
    if (!first) return
    if (!first.querySelector('th')) {
      first.querySelectorAll('td').forEach(td => {
        const th = doc.createElement('th')
        th.innerHTML = td.innerHTML
        td.replaceWith(th)
      })
    }
    t.querySelectorAll('th strong,th b').forEach(unwrap)   // l'en-tête est déjà en gras
  })

  // Notes de bas de page -> [^n] / [^n]: texte (jetons remplacés après la conversion)
  const refs = Array.from(doc.querySelectorAll('sup > a[id^="footnote-ref-"]'))
  const defs = new Map()
  refs.forEach((a, i) => {
    defs.set(a.getAttribute('href').slice(1), i + 1)
    a.parentNode.replaceWith(doc.createTextNode(`§§FN${i + 1}§§`))
  })
  const notes = []
  doc.querySelectorAll('li[id^="footnote-"]').forEach(li => {
    const n = defs.get(li.id)
    if (!n) return
    li.querySelectorAll('a[href^="#footnote-ref-"]').forEach(a => a.remove())
    Array.from(li.querySelectorAll(':scope > p')).forEach(unwrap)
    const p = doc.createElement('p')
    p.innerHTML = `§§FNDEF${n}§§ ${li.innerHTML.trim()}`
    notes[n] = p
    const list = li.parentNode
    li.remove()
    if (!list.children.length) (list.closest('section.footnotes') || list).remove()
  })
  notes.forEach(p => doc.body.appendChild(p))
  return doc.body.innerHTML
}

export function htmlToMarkdown(html) {
  return makeTurndown().turndown(prepareForMarkdown(html))
    .replace(/§§FNDEF(\d+)§§ /g, '[^$1]: ')
    .replace(/§§FN(\d+)§§/g, '[^$1]')
    .trim() + '\n'
}
