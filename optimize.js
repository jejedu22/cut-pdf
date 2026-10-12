'use strict';
// Optimisation du poids d'un PDF (côté navigateur).
// Les images JPEG intégrées sont redimensionnées / recompressées ; le texte et les vectoriels sont conservés.
const OPT_LEVELS = {
  0: { label: 'Aucune' },
  1: { label: 'Équilibrée (≤ 2000 px, q. 75 %)', maxSide: 2000, quality: 0.75 },
  2: { label: 'Forte (≤ 1400 px, q. 55 %)', maxSide: 1400, quality: 0.55 },
  3: { label: 'Maximale (≤ 1000 px, q. 40 %)', maxSide: 1000, quality: 0.4 }
};

// Nombre de composantes d'un JPEG (1 = gris, 3 = RGB, 4 = CMYK), lu dans l'en-tête SOF.
function jpegComponents(b) {
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return b[i + 9];
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return 0;
}

async function recompressJpeg(bytes, w, h, { maxSide, quality }) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), { imageOrientation: 'none' });
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const nw = Math.max(1, Math.round(bmp.width * k)), nh = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = nw; c.height = nh;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, nw, nh);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: nw, h: nh };
  } finally { bmp.close?.(); }
}

// Remplace, dans `doc` (pdf-lib), les images JPEG par une version plus légère quand elle l'est vraiment.
async function optimizeImages(doc, level) {
  const opts = OPT_LEVELS[level];
  if (!opts || !opts.maxSide) return;
  const { PDFName, PDFNumber, PDFRawStream } = PDFLib;
  const N = s => PDFName.of(s);
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(N('Subtype')) !== N('Image') || d.get(N('Filter')) !== N('DCTDecode')) continue;
    // Images à ne pas toucher : masques, décodage inversé, couleurs non RGB/gris.
    if (d.has(N('ImageMask')) || d.has(N('Mask')) || d.has(N('Decode'))) continue;
    const orig = obj.contents;
    const comps = jpegComponents(orig);
    if (comps !== 1 && comps !== 3) continue;
    try {
      const out = await recompressJpeg(orig, 0, 0, opts);
      if (!out || out.bytes.length >= orig.length * 0.95) continue;
      const nd = d.clone(doc.context);
      nd.set(N('Width'), PDFNumber.of(out.w));
      nd.set(N('Height'), PDFNumber.of(out.h));
      nd.set(N('ColorSpace'), N('DeviceRGB'));
      nd.set(N('BitsPerComponent'), PDFNumber.of(8));
      nd.delete(N('DecodeParms'));
      doc.context.assign(ref, PDFRawStream.of(nd, out.bytes));
    } catch (e) { /* image illisible : on la laisse telle quelle */ }
  }
}
