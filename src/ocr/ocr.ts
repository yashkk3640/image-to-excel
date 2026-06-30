import { createWorker, type Worker } from 'tesseract.js';

// One reused Tesseract worker. Its heavy WASM work runs off the main thread,
// so the UI stays responsive. The worker is created lazily on first OCR.
let workerPromise: Promise<Worker> | null = null;

// Tesseract sets its logger once at worker creation, so route progress through
// a module-level callback that each runOcr() call swaps in.
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

export interface OcrResult {
  text: string;
  /** Tesseract mean confidence, 0..100. */
  confidence: number;
}

export async function runOcr(image: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  progressCb = onProgress ?? null;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image);
    return { text: data.text, confidence: data.confidence };
  } finally {
    progressCb = null;
  }
}

export async function terminateOcr(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}
