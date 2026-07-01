import type { Template, AppRecord } from '../types';
import type { OcrResult, OcrWord } from '../ocr/ocr';
import { parseUpi } from './upi';

export type ParsedRecord = Pick<AppRecord, 'templateId' | 'fields' | 'meta'>;

function toNumber(raw: string): number | string {
  const n = Number(raw.replace(/[^0-9.\-]/g, '').replace(/(\..*)\./g, '$1'));
  return Number.isFinite(n) ? n : raw;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9@._-]/g, '');
}

// Confidence of an extracted value = the average confidence of the OCR words
// that make it up. This reflects how well the *field* was read, rather than the
// global mean which is dragged down by UI noise (icons, "POWERED BY", etc.).
function valueConfidence(value: string, words: OcrWord[], fallback: number): number {
  if (!value || words.length === 0) return fallback;
  const tokens = value.split(/\s+/).map(norm).filter(Boolean);
  const confs: number[] = [];
  for (const tok of tokens) {
    const hit = words.find((w) => {
      const t = norm(w.text);
      return t.length > 0 && (t === tok || t.includes(tok) || tok.includes(t));
    });
    if (hit) confs.push(hit.confidence);
  }
  if (confs.length === 0) return fallback;
  return confs.reduce((a, b) => a + b, 0) / confs.length / 100;
}

// Builds the record from a map of already-extracted raw string values.
// `detectionKeys` are fields that are classified rather than transcribed (e.g.
// the payment app) — they get a flat high confidence instead of word-matching.
function assemble(
  template: Template,
  ocr: OcrResult,
  raw: Record<string, string>,
  detectionKeys: Set<string> = new Set(),
): ParsedRecord {
  const fields: Record<string, string | number> = {};
  const fieldConfidence: Record<string, number> = {};
  const baseConf = ocr.confidence / 100;

  for (const f of template.fields) {
    const value = raw[f.key] ?? '';
    fields[f.key] = f.type === 'number' && value ? toNumber(value) : value;
    fieldConfidence[f.key] = !value
      ? 0
      : detectionKeys.has(f.key)
        ? 0.95
        : valueConfidence(value, ocr.words, baseConf);
  }

  // Overall confidence averages only the fields we actually extracted.
  const found = Object.values(fieldConfidence).filter((c) => c > 0);
  const confidence = found.length ? found.reduce((a, b) => a + b, 0) / found.length : 0;

  return {
    templateId: template.id,
    fields,
    meta: { confidence, fieldConfidence, rawText: ocr.text, edited: false },
  };
}

// Pure transform: OCR result + template -> structured fields with per-field
// confidence. Either delegates to a built-in parser or runs each field's regex.
export function applyTemplate(ocr: OcrResult, template: Template): ParsedRecord {
  if (template.parser === 'upi') {
    const parsed = parseUpi(ocr.text, ocr.words) as unknown as Record<string, string>;
    return assemble(template, ocr, parsed, new Set(['provider']));
  }

  const raw: Record<string, string> = {};
  for (const f of template.fields) {
    if (!f.regex) continue;
    const m = new RegExp(f.regex, f.flags ?? 'i').exec(ocr.text);
    if (m) raw[f.key] = (m[1] ?? m[0]).trim();
  }
  return assemble(template, ocr, raw);
}
