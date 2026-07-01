// Parser for UPI payment confirmation screenshots (Google Pay, PhonePe, Paytm,
// PayZapp, ...). Rather than encode each app's layout — which breaks whenever an
// app is redesigned — we extract each field by an *invariant* that holds across
// apps and versions:
//   amount        -> the largest money-shaped text on screen (geometry)
//   transactionId -> the longest id near an id/ref/UTR keyword (universal terms)
//   datetime      -> universal date/time patterns (not app-specific)
//   recipient     -> the name after "to / paid to / sent to" (shared UPI vocab)
//   note          -> the leftover free-text line
// Pure functions, no IO.

import type { OcrWord } from '../ocr/ocr';

export interface UpiFields {
  provider: string;
  recipient: string;
  amount: string;
  transactionId: string;
  datetime: string;
  note: string;
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

// Returns the first capturing-group match across the patterns, tried in order.
function firstMatch(text: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

function detectProvider(text: string): string {
  const t = text.toLowerCase();
  if (/google\s*pay|g\s?pay\b/.test(t)) return 'Google Pay';
  if (/phone\s?pe/.test(t)) return 'PhonePe';
  if (/pay\s?zapp/.test(t)) return 'PayZapp';
  if (/paytm/.test(t)) return 'Paytm';
  return '';
}

// A money value has at most 7 integer digits (so it can't be a 10-digit phone
// or a 12-digit transaction id) and optional 1-2 decimals. Currency symbols and
// thousands separators are stripped first.
function moneyString(raw: string): string | null {
  const s = raw.replace(/[^\d.]/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  return Number(s) > 0 ? s : null;
}

function extractAmount(text: string, words: OcrWord[]): string {
  // Invariant: the amount is the largest money-shaped text on the screen. Using
  // glyph height (not position or the ₹ symbol) makes this survive redesigns
  // and OCR dropping the currency glyph.
  const heights = words
    .map((w) => w.bbox.y1 - w.bbox.y0)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);
  const median = heights.length ? heights[Math.floor(heights.length / 2)] : 0;

  let best: { val: string; h: number } | null = null;
  for (const w of words) {
    const val = moneyString(w.text);
    if (!val) continue;
    const h = w.bbox.y1 - w.bbox.y0;
    if (!best || h > best.h) best = { val, h };
  }
  // Require the candidate to be clearly larger than body text, so we never
  // mistake a small phone/date fragment for the amount when the real amount
  // wasn't read — better to leave it blank for review.
  if (best && median > 0 && best.h >= median * 1.5) return best.val;

  // Fallback when geometry is unavailable: an explicit currency-marked value.
  const sym = /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(text);
  if (sym) return sym[1].replace(/,/g, '');
  return '';
}

function extractTransactionId(text: string): string {
  // Prefer an id next to a universal keyword (these terms are stable across
  // apps even when layouts change).
  const labelled = firstMatch(text, [
    /(?:upi\s*(?:transaction\s*id|ref(?:erence)?\s*(?:no\.?|id|number)?))\s*[:\-]?\s*([A-Za-z0-9]{8,30})/i,
    /(?:transaction\s*id|txn\s*id|order\s*id|google\s*transaction\s*id|reference\s*(?:id|number|no\.?))\s*[:\-]?\s*([A-Za-z0-9]{8,30})/i,
    /\butr\b\s*[:\-]?\s*([0-9]{10,22})/i,
  ]);
  if (labelled) return labelled;

  // Fallback invariant: the longest 12+ digit run (UPI ref / UTR are always
  // long numbers), avoiding shorter phone-length numbers.
  const runs = text.match(/\d{12,22}/g);
  return runs ? runs.sort((a, b) => b.length - a.length)[0] : '';
}

function extractRecipient(text: string): string {
  return firstMatch(text, [
    /(?:paid\s*to|sent\s*to|transferred\s*to|money\s*sent\s*to|received\s*from)\s*[:\-]?\s*([A-Za-z][^\n]{2,48})/i,
    // GPay headline "To <Name>" / "To: <NAME>" — prefer the readable name.
    // [Tt]o (not the /i flag) so the captured name still requires a capital.
    /(?:^|\n)\s*[Tt]o\s*[:\-]?\s+([A-Z][A-Za-z .]{2,48})/,
    /banking\s*name\s*[:\-]?\s*([A-Za-z][^\n]{2,48})/i,
    /([a-z0-9.\-_]{2,}@[a-z]{2,})/i, // UPI handle, e.g. name@oksbi (last resort)
  ]);
}

function extractDateTime(text: string): string {
  const date = firstMatch(text, [
    // Day-month ("24 Jun 2026", "24 Jun") and month-day ("May 18, 2026",
    // "May 18") — the year is optional in both.
    new RegExp(`\\b(\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\.?(?:,?\\s*\\d{2,4})?)`, 'i'),
    new RegExp(`\\b((?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2}(?:,?\\s*\\d{2,4})?)`, 'i'),
    /\b(\d{4}-\d{2}-\d{2})/,
    /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/,
  ]);
  const time = firstMatch(text, [/\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?)/i]);
  return [date, time].filter(Boolean).join(' ').trim();
}

// A line that can't be the note: phone, handle, a known labelled field, a
// date/time, or a status word.
function isNoteNoise(line: string): boolean {
  return (
    !line ||
    /^\+?\d[\d\s\-]{6,}$/.test(line) ||
    /@/.test(line) ||
    /^(to|from|paid|sent|received|upi|google|phonepe|paytm|payzapp|transaction|amount|order|ref|utr|bank)\b/i.test(line) ||
    /\b\d{1,2}:\d{2}\b/.test(line) ||
    new RegExp(`\\b(${MONTHS})`, 'i').test(line) ||
    /^(completed|success(ful)?|payment successful|paid successfully|transaction successful)\b/i.test(line)
  );
}

function extractNote(text: string): string {
  const labelled = firstMatch(text, [
    /(?:note|message|remark|comment|added\s*a\s*note|paying\s*for)\s*[:\-]?\s*([^\n]{1,80})/i,
  ]);
  if (labelled) return labelled;

  // Positional fallback: apps like GPay show an unlabelled note just above the
  // "Completed"/"successful" status. Take the nearest non-empty line before it;
  // if that line is itself a known field, there is no note.
  const lines = text.split('\n').map((l) => l.trim());
  // Match the status word anywhere in the line — OCR often prefixes the green
  // check as junk, e.g. "© Completed • May 18".
  const statusIdx = lines.findIndex((l) =>
    /\b(completed|payment successful|paid successfully|transaction successful)\b/i.test(l),
  );
  if (statusIdx > 0) {
    for (let i = statusIdx - 1; i >= 0; i--) {
      if (!lines[i]) continue;
      return isNoteNoise(lines[i]) ? '' : lines[i];
    }
  }
  return '';
}

export function parseUpi(text: string, words: OcrWord[] = []): UpiFields {
  return {
    provider: detectProvider(text),
    recipient: extractRecipient(text),
    amount: extractAmount(text, words),
    transactionId: extractTransactionId(text),
    datetime: extractDateTime(text),
    note: extractNote(text),
  };
}
