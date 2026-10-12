// DOCX -> HTML via mammoth. Les images sont référencées par `images/imageN.ext` et renvoyées à part.
import mammoth from 'mammoth/mammoth.browser'
import { extFromMime } from './common'

const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Titre'] => h1:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Sous-titre'] => h2:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Citation'] => blockquote > p:fresh",
  "p[style-name='Block Text'] => blockquote > p:fresh",
  "p[style-name='Source Code'] => pre > code:separator('\\n')",
  "r[style-name='Verbatim Char'] => code",
  "r[style-name='Source Code Char'] => code",
  "r[style-name='Code Char'] => code"
]

export async function docxToHtml(arrayBuffer) {
  const images = []
  const result = await mammoth.convertToHtml({ arrayBuffer }, {
    styleMap: STYLE_MAP,
    convertImage: mammoth.images.imgElement(async img => {
      const bytes = new Uint8Array(await img.readAsArrayBuffer())
      const name = `image${images.length + 1}.${extFromMime(img.contentType)}`
      images.push({ name, mime: img.contentType, bytes })
      return { src: `images/${name}` }
    })
  })
  return {
    html: result.value,
    images,
    // Les styles Word inconnus retombent simplement sur un paragraphe : inutile d'alerter
    warnings: [...new Set(result.messages
      .filter(m => m.type !== 'info' && !/^Unrecognised (paragraph|run|table) style/.test(m.message))
      .map(m => m.message))]
  }
}
