import type { Template, AppRecord } from '../types';
import type { OcrResult } from '../ocr/ocr';
import { parseUpi } from './upi';

export type ParsedRecord = Pick<AppRecord, 'templateId' | 'fields' | 'meta'>;

function toNumber(raw: string): number | string {
  const n = Number(raw.replace(/[^0-9.\-]/g, '').replace(/(\..*)\./g, '$1'));
  return Number.isFinite(n) ? n : raw;
}

// Builds the record from a map of already-extracted raw string values.
function assemble(template: Template, ocr: OcrResult, raw: Record<string, string>): ParsedRecord {
  const fields: Record<string, string | number> = {};
  const fieldConfidence: Record<string, number> = {};
  const baseConf = ocr.confidence / 100;

  for (const f of template.fields) {
    const value = raw[f.key] ?? '';
    fields[f.key] = f.type === 'number' && value ? toNumber(value) : value;
    fieldConfidence[f.key] = value ? baseConf : 0;
  }

  const confs = Object.values(fieldConfidence);
  const confidence = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;

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
    return assemble(template, ocr, parseUpi(ocr.text) as unknown as Record<string, string>);
  }

  const raw: Record<string, string> = {};
  for (const f of template.fields) {
    if (!f.regex) continue;
    const m = new RegExp(f.regex, f.flags ?? 'i').exec(ocr.text);
    if (m) raw[f.key] = (m[1] ?? m[0]).trim();
  }
  return assemble(template, ocr, raw);
}
