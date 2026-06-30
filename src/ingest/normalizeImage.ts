// Image preprocessing tuned for OCR of payment-app screenshots. Runs on-device;
// the image never leaves memory.
//
// Two steps matter for hard-to-read fields like the headline amount (often a
// thin/anti-aliased or low-contrast font):
//   1. Scale sensibly — never downscale a crisp screenshot (that blurs thin
//      strokes); upscale small images so glyphs are large enough for Tesseract.
//   2. Adaptive (Bradley) thresholding — a *local* threshold via an integral
//      image, robust to gradients, shadows, and coloured backgrounds that a
//      single global threshold would wash out.

const MAX_EDGE = 3000; // only downscale images larger than this
const MIN_EDGE = 1500; // upscale smaller images up to this (max 2x)

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

function toGray(data: Uint8ClampedArray, n: number): Uint8Array {
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    gray[i] = (data[j] * 299 + data[j + 1] * 587 + data[j + 2] * 114) / 1000;
  }
  return gray;
}

// Bradley adaptive threshold: a pixel is ink (black) if it is more than `t`%
// darker than the mean of its local window, computed in O(1) per pixel via an
// integral image.
function adaptiveThreshold(gray: Uint8Array, w: number, h: number): void {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }

  const radius = Math.max(8, Math.round(Math.min(w, h) / 50));
  const t = 12; // percent

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(w - 1, x + radius);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * (w + 1) + (x2 + 1)] -
        integral[y1 * (w + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (w + 1) + x1] +
        integral[y1 * (w + 1) + x1];
      const idx = y * w + x;
      gray[idx] = gray[idx] * count <= (sum * (100 - t)) / 100 ? 0 : 255;
    }
  }
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
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d') as AnyCtx | null;
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, w, h);

    const img = ctx.getImageData(0, 0, w, h);
    const n = w * h;
    const gray = toGray(img.data, n);
    adaptiveThreshold(gray, w, h);
    for (let i = 0; i < n; i++) {
      const v = gray[i];
      const j = i * 4;
      img.data[j] = img.data[j + 1] = img.data[j + 2] = v;
      img.data[j + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    return await toBlob(canvas);
  } finally {
    bitmap.close();
  }
}
