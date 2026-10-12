// ODT -> HTML : lecture directe de content.xml / styles.xml (mammoth ne gère pas l'OpenDocument).
import JSZip from 'jszip'
import { mimeFromName } from './common'

const NS = {
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink'
}

const attr = (el, ns, name) => el.getAttributeNS(NS[ns], name)
const kids = el => Array.from(el.children)
const is = (el, ns, name) => el.namespaceURI === NS[ns] && el.localName === name

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Fichier ODT invalide (XML illisible).')
  return doc
}

// Styles (automatiques + nommés) : nom -> { parent, props }
function collectStyles(...docs) {
  const styles = new Map()
  const lists = new Map()
  for (const doc of docs) {
    for (const el of doc.getElementsByTagNameNS(NS.style, 'style')) {
      const name = attr(el, 'style', 'name')
      const tp = el.getElementsByTagNameNS(NS.style, 'text-properties')[0]
      const props = {}
      if (tp) {
        if (/bold|^[7-9]00$/.test(attr(tp, 'fo', 'font-weight') || '')) props.bold = true
        if (/italic|oblique/.test(attr(tp, 'fo', 'font-style') || '')) props.italic = true
        const ul = attr(tp, 'style', 'text-underline-style')
        if (ul && ul !== 'none') props.underline = true
        const lt = attr(tp, 'style', 'text-line-through-style')
        if (lt && lt !== 'none') props.strike = true
        const pos = attr(tp, 'style', 'text-position') || ''
        if (/^super|^[1-9]/.test(pos)) props.sup = true
        else if (/^sub|^-/.test(pos)) props.sub = true
        if (/mono|courier|consolas/i.test(attr(tp, 'style', 'font-name') || attr(tp, 'fo', 'font-family') || '')) props.code = true
      }
      styles.set(name, { parent: attr(el, 'style', 'parent-style-name'), props })
    }
    for (const el of doc.getElementsByTagNameNS(NS.text, 'list-style')) lists.set(attr(el, 'style', 'name'), el)
  }
  return { styles, lists }
}

// <strong>a</strong><strong>b</strong> -> <strong>ab</strong> (les « runs » ODT découpent souvent un même formatage)
function mergeAdjacent(root) {
  for (const e of Array.from(root.querySelectorAll('strong,em,u,s,sup,sub,code'))) {
    if (!e.isConnected) continue
    let n = e.nextSibling
    while (n && n.nodeType === 1 && n.tagName === e.tagName) {
      while (n.firstChild) e.appendChild(n.firstChild)
      const next = n.nextSibling
      n.remove()
      n = next
    }
  }
}

export async function odtToHtml(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const contentFile = zip.file('content.xml')
  if (!contentFile) throw new Error("Ce fichier n'est pas un ODT valide (content.xml introuvable).")
  const content = parseXml(await contentFile.async('string'))
  const stylesFile = zip.file('styles.xml')
  const stylesDoc = stylesFile ? parseXml(await stylesFile.async('string')) : null
  const { styles, lists } = collectStyles(...[stylesDoc, content].filter(Boolean))

  const out = document.implementation.createHTMLDocument('')
  const el = (tag, parent) => { const e = out.createElement(tag); parent?.appendChild(e); return e }
  const images = []
  const imageByPath = new Map()
  const footnotes = []

  // Propriétés d'un style en remontant la chaîne des parents
  const resolve = name => {
    const props = {}
    const chain = []
    for (let n = name, i = 0; n && styles.has(n) && i < 20; n = styles.get(n).parent, i++) chain.unshift(styles.get(n))
    chain.forEach(s => Object.assign(props, s.props))
    return props
  }
  const styleChain = name => {
    const names = []
    for (let n = name, i = 0; n && i < 20; n = styles.get(n)?.parent, i++) names.push(n)
    return names
  }

  const wrapFormat = (props, container) => {
    let inner = container
    const tags = [['code', props.code], ['strong', props.bold], ['em', props.italic], ['u', props.underline], ['s', props.strike], ['sup', props.sup], ['sub', props.sub]]
    for (const [tag, on] of tags) if (on) inner = el(tag, inner)
    return inner
  }

  async function imageFor(href) {
    if (imageByPath.has(href)) return imageByPath.get(href)
    const f = zip.file(href)
    if (!f) return null
    const ext = (href.split('.').pop() || 'bin').toLowerCase()
    const name = `image${images.length + 1}.${ext}`
    images.push({ name, mime: mimeFromName(href), bytes: await f.async('uint8array') })
    imageByPath.set(href, name)
    return name
  }

  /* ---- Inline ---- */
  async function inline(node, parent) {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) {
        if (c.nodeValue) parent.appendChild(out.createTextNode(c.nodeValue))
        continue
      }
      if (c.nodeType !== 1) continue
      if (c.namespaceURI === NS.text) {
        switch (c.localName) {
          case 'span':
            await inline(c, wrapFormat(resolve(attr(c, 'text', 'style-name')), parent))
            break
          case 'a': {
            const a = el('a', parent)
            a.setAttribute('href', attr(c, 'xlink', 'href') || '#')
            await inline(c, a)
            break
          }
          case 'line-break': el('br', parent); break
          case 'tab': parent.appendChild(out.createTextNode('\t')); break
          case 's': parent.appendChild(out.createTextNode(' '.repeat(+attr(c, 'text', 'c') || 1))); break
          case 'note': {
            const n = footnotes.length + 1
            const a = el('a', el('sup', parent))
            a.setAttribute('href', `#footnote-${n}`)
            a.setAttribute('id', `footnote-ref-${n}`)
            a.textContent = `[${n}]`
            const body = Array.from(c.getElementsByTagNameNS(NS.text, 'note-body'))[0]
            footnotes.push(body)
            break
          }
          case 'note-citation': case 'note-body': case 'bookmark': case 'bookmark-start': case 'bookmark-end': case 'soft-page-break':
            break
          default:
            await inline(c, parent)
        }
      } else if (is(c, 'draw', 'frame') || is(c, 'draw', 'image')) {
        const img = is(c, 'draw', 'image') ? c : c.getElementsByTagNameNS(NS.draw, 'image')[0]
        if (img) {
          const name = await imageFor(attr(img, 'xlink', 'href'))
          if (name) {
            const i = el('img', parent)
            i.setAttribute('src', `images/${name}`)
            const t = c.getElementsByTagNameNS(NS.svg, 'title')[0] || c.getElementsByTagNameNS(NS.svg, 'desc')[0]
            i.setAttribute('alt', t?.textContent || '')
          }
        }
      } else {
        await inline(c, parent)
      }
    }
  }

  /* ---- Blocs ---- */
  const isOrdered = (styleName, level) => {
    const ls = lists.get(styleName)
    if (!ls) return false
    const lvl = kids(ls).find(k => +attr(k, 'text', 'level') === level)
    return !!lvl && lvl.localName === 'list-level-style-number'
  }

  async function paragraph(node, parent, level = 0) {
    const sname = attr(node, 'text', 'style-name')
    const chain = styleChain(sname)
    let tag = 'p'
    if (is(node, 'text', 'h')) tag = `h${Math.min(6, Math.max(1, +attr(node, 'text', 'outline-level') || 1))}`
    else if (chain.some(n => /^(Title|Titre)$/i.test(n))) tag = 'h1'
    else if (chain.some(n => /^(Subtitle|Sous-titre)$/i.test(n))) tag = 'h2'
    else if (chain.some(n => /^(Quotations?|Citations?|Block_20_Quotation)$/i.test(n))) tag = 'blockquote'
    const block = el(tag, parent)
    const host = tag === 'blockquote' ? el('p', block) : block
    await inline(node, tag.startsWith('h') ? host : wrapFormat(resolve(sname), host))
    return block
  }

  async function list(node, parent, styleName, level) {
    const sname = attr(node, 'text', 'style-name') || styleName
    const ul = el(isOrdered(sname, level) ? 'ol' : 'ul', parent)
    for (const item of kids(node)) {
      if (!is(item, 'text', 'list-item') && !is(item, 'text', 'list-header')) continue
      const li = el('li', ul)
      for (const c of kids(item)) {
        if (is(c, 'text', 'list')) await list(c, li, sname, level + 1)
        else await block(c, li, true)
      }
      // <li><p>texte</p></li> -> <li>texte</li> pour un rendu plus compact
      const ps = kids(li).filter(k => k.tagName === 'P')
      if (ps.length === 1 && li.children.length === 1 + kids(li).filter(k => /^(UL|OL)$/.test(k.tagName)).length) {
        while (ps[0].firstChild) li.insertBefore(ps[0].firstChild, ps[0])
        ps[0].remove()
      }
    }
  }

  async function table(node, parent) {
    const t = el('table', parent)
    let head = null
    const rows = async (container, host, th) => {
      for (const r of kids(container)) {
        if (is(r, 'table', 'table-row')) {
          const tr = el('tr', host)
          for (const c of kids(r)) {
            if (!is(c, 'table', 'table-cell')) continue
            const td = el(th ? 'th' : 'td', tr)
            const cs = +attr(c, 'table', 'number-columns-spanned') || 1
            const rs = +attr(c, 'table', 'number-rows-spanned') || 1
            if (cs > 1) td.setAttribute('colspan', cs)
            if (rs > 1) td.setAttribute('rowspan', rs)
            for (const b of kids(c)) await block(b, td)
            const ps = kids(td).filter(k => k.tagName === 'P')
            if (ps.length === 1 && td.children.length === 1) {
              while (ps[0].firstChild) td.insertBefore(ps[0].firstChild, ps[0])
              ps[0].remove()
            }
          }
        } else if (is(r, 'table', 'table-row-group')) await rows(r, host, th)
      }
    }
    for (const c of kids(node)) {
      if (is(c, 'table', 'table-header-rows')) { head ||= el('thead', t); await rows(c, head, true) }
      else if (is(c, 'table', 'table-row') || is(c, 'table', 'table-rows') || is(c, 'table', 'table-row-group')) {
        const body = t.querySelector('tbody') || el('tbody', t)
        if (is(c, 'table', 'table-row')) await rows({ children: [c] }, body, false)
        else await rows(c, body, false)
      }
    }
  }

  async function block(node, parent, inListItem = false) {
    if (node.namespaceURI === NS.text) {
      switch (node.localName) {
        case 'p': case 'h': await paragraph(node, parent); return
        case 'list': await list(node, parent, null, 1); return
        case 'section': case 'index-body': case 'table-of-content': case 'illustration-index': case 'alphabetical-index':
          for (const c of kids(node)) await block(c, parent); return
        case 'index-title': for (const c of kids(node)) await block(c, parent); return
        default: return
      }
    }
    if (is(node, 'table', 'table')) await table(node, parent)
    else if (node.namespaceURI === NS.draw) {
      const p = el('p', parent)
      await inline({ childNodes: [node] }, p)
    }
  }

  const body = content.getElementsByTagNameNS(NS.office, 'text')[0]
  if (!body) throw new Error('Ce fichier ne contient pas de texte ODT.')
  for (const c of kids(body)) await block(c, out.body)

  if (footnotes.length) {
    const sec = el('section', out.body)
    sec.setAttribute('class', 'footnotes')
    el('hr', sec)
    const ol = el('ol', sec)
    for (const [k, body] of footnotes.entries()) {
      const li = el('li', ol)
      li.setAttribute('id', `footnote-${k + 1}`)
      for (const p of kids(body)) await inline(p, li)
      const back = el('a', li)
      back.setAttribute('href', `#footnote-ref-${k + 1}`)
      back.textContent = '↑'
    }
  }
  mergeAdjacent(out.body)
  return { html: out.body.innerHTML, images, warnings: [] }
}
