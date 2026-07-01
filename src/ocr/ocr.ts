import { runTesseract, terminateTesseract } from './tesseract';

export interface OcrWord {
  text: string;
  /** Per-word (or per-line) confidence, 0..100. */
  confidence: number;
  /** Pixel bounding box, used to find the largest text (the amount). */
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrResult {
  text: string;
  /** Mean confidence, 0..100. */
  confidence: number;
  words: OcrWord[];
}

export type OcrEngine = 'tesseract' | 'paddle';

// Dispatch to the chosen engine. PaddleOCR is dynamically imported so its ~15 MB
// models and the ORT runtime never load unless the user opts into it.
export async function recognize(
  image: Blob,
  engine: OcrEngine,
  onProgress?: (p: number) => void,
): Promise<OcrResult> {
  if (engine === 'paddle') {
    const { runPaddle } = await import('./paddle');
    return runPaddle(image, onProgress);
  }
  return runTesseract(image, onProgress);
}

export { terminateTesseract as terminateOcr };
