const MIME_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp',
  'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/tiff': 'tiff', 'image/x-emf': 'emf', 'image/x-wmf': 'wmf'
}
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]))
EXT_MIME.jpeg = 'image/jpeg'

export const extFromMime = m => MIME_EXT[m] || 'bin'
export const mimeFromName = n => EXT_MIME[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream'

// Les formats que le navigateur sait afficher dans un <img>
export const isDisplayable = mime => /^image\/(png|jpe?g|gif|bmp|svg\+xml|webp)$/.test(mime)
