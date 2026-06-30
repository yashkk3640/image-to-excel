// Dedicated parser for UPI payment confirmation screenshots from the major
// Indian apps (Google Pay, PhonePe, Paytm, PayZapp). Each app lays its screen
// out differently, so per-field we try several labelled patterns in priority
// order rather than one rigid regex. Pure functions, no IO.

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
  // Headline amount, marked by a currency symbol. The ₹ glyph sometimes OCRs
  // poorly, so accept Rs / INR too. Take the first currency value — on
  // confirmation screens it is the prominent transferred amount.
  const withSymbol = /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(text);
  if (withSymbol) return withSymbol[1].replace(/,/g, '');

  const labelled = /amount\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i.exec(text);
  return labelled ? labelled[1].replace(/,/g, '') : '';
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
    /banking\s*name\s*[:\-]?\s*([A-Za-z][^\n]{2,48})/i,
    /([a-z0-9.\-_]{2,}@[a-z]{2,})/i, // UPI handle, e.g. name@oksbi
    /(?:^|\n)\s*to\s*[:\-]\s*([A-Za-z][^\n]{2,48})/i,
  ]);
}

function extractDateTime(text: string): string {
  const date = firstMatch(text, [
    new RegExp(`\\b(\\d{1,2}\\s+(?:${MONTHS})[a-z]*\\.?,?\\s*\\d{2,4})`, 'i'),
    new RegExp(`\\b((?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2},?\\s*\\d{2,4})`, 'i'),
    /\b(\d{4}-\d{2}-\d{2})/,
    /\b(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/,
  ]);
  const time = firstMatch(text, [/\b(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?)/i]);
  return [date, time].filter(Boolean).join(' ').trim();
}

function extractNote(text: string): string {
  return firstMatch(text, [
    /(?:note|message|remark|comment|added\s*a\s*note|paying\s*for)\s*[:\-]?\s*([^\n]{1,80})/i,
  ]);
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
