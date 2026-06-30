import type { Template } from '../types';

// Built-in starter templates. Users can add their own later (phase 2:
// TemplateEditor). Each field's regex runs against the raw OCR text; the first
// capture group is taken as the value.
export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: 'upi',
    name: 'UPI Payment (GPay / PhonePe / Paytm / PayZapp)',
    parser: 'upi',
    fields: [
      { key: 'provider', label: 'App', type: 'string' },
      { key: 'recipient', label: 'Paid To', type: 'string' },
      { key: 'amount', label: 'Amount (₹)', type: 'number' },
      { key: 'transactionId', label: 'Transaction ID', type: 'string' },
      { key: 'datetime', label: 'Date & Time', type: 'string' },
      { key: 'note', label: 'Note / Purpose', type: 'string' },
    ],
  },
  {
    id: 'receipt',
    name: 'Receipt',
    fields: [
      { key: 'date', label: 'Date', type: 'date', regex: '(\\d{1,4}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{1,4})' },
      { key: 'vendor', label: 'Vendor', type: 'string', regex: '^\\s*([A-Za-z][A-Za-z0-9 &.\\-]{2,})', flags: 'm' },
      { key: 'total', label: 'Total', type: 'number', regex: 'total[^0-9]*([0-9]+[.,][0-9]{2})', flags: 'i' },
    ],
  },
  {
    id: 'meter',
    name: 'Meter reading',
    fields: [
      { key: 'meterId', label: 'Meter ID', type: 'string', regex: '(?:meter|id)[^A-Za-z0-9]*([A-Za-z0-9\\-]{3,})', flags: 'i' },
      { key: 'reading', label: 'Reading', type: 'number', regex: '([0-9]{3,}(?:[.,][0-9]+)?)' },
    ],
  },
];
