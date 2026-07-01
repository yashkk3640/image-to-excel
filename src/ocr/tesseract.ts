import { createWorker, type Worker } from 'tesseract.js';
import type { OcrResult, OcrWord } from './ocr';

// One reused Tesseract worker. Its heavy WASM work runs off the main thread,
// so the UI stays responsive. The worker is created lazily on first OCR.
let workerPromise: Promise<Worker> | null = null;

// Tesseract sets its logger once at worker creation, so route progress through
// a module-level callback that each call swaps in.
let progressCb: ((p: number) => void) | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') progressCb?.(m.progress);
      },
    });
  }
  return workerPromise;
}

export async function runTesseract(image: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  progressCb = onProgress ?? null;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    const words: OcrWord[] = (data.words ?? []).map((w) => ({
      text: w.text,
      confidence: w.confidence,
      bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
    }));
    return { text: data.text, confidence: data.confidence, words };
  } finally {
    progressCb = null;
  }
}

export async function terminateTesseract(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}
