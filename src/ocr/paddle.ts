import type { OcrResult, OcrWord } from './ocr';

// PaddleOCR (PP-OCR) via onnxruntime-web — an opt-in "high accuracy" engine.
// Everything is lazy: the ~15 MB models and the ORT runtime load only when the
// user first runs this engine, so the default (Tesseract) stays lightweight.

type PaddleLine = { text: string; mean: number; box?: number[][] };
type PaddleOcr = { detect: (image: string) => Promise<PaddleLine[]> };

let ocrPromise: Promise<PaddleOcr> | null = null;

async function getOcr(): Promise<PaddleOcr> {
  if (!ocrPromise) {
    ocrPromise = (async () => {
      const [{ default: Ocr }, ort] = await Promise.all([
        import('@gutenye/ocr-browser'),
        import('onnxruntime-web'),
      ]);
      // ORT loads its own WASM binaries from the jsDelivr CDN (code only — no
      // user image ever leaves the device). The service worker caches them.
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
      const base = import.meta.env.BASE_URL;
      return Ocr.create({
        models: {
          detectionPath: `${base}models/ch_PP-OCRv4_det_infer.onnx`,
          recognitionPath: `${base}models/ch_PP-OCRv4_rec_infer.onnx`,
          dictionaryPath: `${base}models/ppocr_keys_v1.txt`,
        },
      }) as Promise<PaddleOcr>;
    })();
  }
  return ocrPromise;
}

function boxToBbox(box: number[][]): OcrWord['bbox'] {
  const xs = box.map((p) => p[0]);
  const ys = box.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export async function runPaddle(image: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  onProgress?.(0.1);
  const ocr = await getOcr();
  onProgress?.(0.4);
  const url = URL.createObjectURL(image);
  try {
    const lines = await ocr.detect(url);
    onProgress?.(1);
    const words: OcrWord[] = lines
      .filter((l) => Array.isArray(l.box) && l.box.length > 0)
      .map((l) => ({ text: l.text, confidence: (l.mean ?? 0) * 100, bbox: boxToBbox(l.box as number[][]) }));
    const text = lines.map((l) => l.text).join('\n');
    const confidence = words.length ? words.reduce((a, w) => a + w.confidence, 0) / words.length : 0;
    return { text, confidence, words };
  } finally {
    URL.revokeObjectURL(url);
  }
}
