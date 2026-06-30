// Image preprocessing for OCR of payment-app screenshots. Runs on-device; the
// image never leaves memory.
//
// These screenshots are already crisp, high-contrast digital text, so the best
// thing preprocessing can do is *stay out of the way*: never downscale (that
// blurs thin glyphs like the headline amount), upscale only small images so
// glyphs are large enough for Tesseract, and otherwise pass pixels through.
// (Aggressive binarization was tried and measurably hurt — it adds artifacts to
// already-clean text and lowers both accuracy and confidence.)

const MAX_EDGE = 3000; // downscale only images larger than this
const MIN_EDGE = 1400; // upscale smaller images toward this (max 2x)

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function targetScale(longest: number): number {
  if (longest > MAX_EDGE) return MAX_EDGE / longest;
  if (longest < MIN_EDGE) return Math.min(2, MIN_EDGE / longest);
  return 1;
}

async function toBlob(canvas: AnyCanvas): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

export async function normalizeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = targetScale(Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return file; // pass the original through untouched

    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d') as AnyCtx | null;
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await toBlob(canvas);
  } finally {
    bitmap.close();
  }
}
