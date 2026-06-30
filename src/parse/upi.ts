// Dedicated parser for UPI payment confirmation screenshots from the major
// Indian apps (Google Pay, PhonePe, Paytm, PayZapp). Each app lays its screen
// out differently, so per-field we try several patterns in priority order
// rather than one rigid regex. Pure functions, no IO.

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

function extractAmount(text: string): string {
  // 1. Amount marked by a currency symbol (the ₹ glyph often OCRs poorly, so
  //    accept Rs / INR too).
  const sym = /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(text);
  if (sym) return sym[1].replace(/,/g, '');

  const labelled = /amount\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(text);
  if (labelled) return labelled[1].replace(/,/g, '');

  // 2. Fallback: a line that is *only* a number — the headline amount with the
  //    currency glyph dropped by OCR. Bounded to <=7 digits so it can't match a
  //    12-digit transaction id or a phone number.
  for (const raw of text.split('\n')) {
    const m = /^\s*₹?\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]{1,6}(?:\.[0-9]{1,2})?)\s*$/.exec(raw.trim());
    if (m && m[1].replace(/[,.]/g, '').length <= 7) return m[1].replace(/,/g, '');
  }
  return '';
}

function extractTransactionId(text: string): string {
  return firstMatch(text, [
    /(?:upi\s*(?:transaction\s*id|ref(?:erence)?\s*(?:no\.?|id|number)?))\s*[:\-]?\s*([A-Za-z0-9]{8,30})/i,
    /(?:transaction\s*id|txn\s*id|order\s*id|google\s*transaction\s*id|reference\s*(?:id|number|no\.?))\s*[:\-]?\s*([A-Za-z0-9]{8,30})/i,
    /\butr\b\s*[:\-]?\s*([0-9]{10,22})/i,
  ]);
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

export function parseUpi(text: string): UpiFields {
  return {
    provider: detectProvider(text),
    recipient: extractRecipient(text),
    amount: extractAmount(text),
    transactionId: extractTransactionId(text),
    datetime: extractDateTime(text),
    note: extractNote(text),
  };
}
