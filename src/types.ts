export type FieldType = 'string' | 'number' | 'date';

export interface TemplateField {
  key: string;
  label: string;
  type: FieldType;
  /** Regex applied to the OCR text; capture group 1 (or the whole match) is the value. */
  regex?: string;
  flags?: string;
}

export interface Template {
  id: string;
  name: string;
  fields: TemplateField[];
  /**
   * When set, a dedicated built-in parser fills the fields instead of running
   * each field's regex. Used for layouts too varied for a single regex (e.g.
   * 'upi' handles GPay / PhonePe / Paytm / PayZapp confirmation screens).
   */
  parser?: 'upi';
}

export interface AppRecord {
  id: string;
  /** ISO timestamp of when the user captured/uploaded the image. */
  capturedAt: string;
  /** "YYYY-MM" — indexed for fast monthly export. */
  month: string;
  templateId: string;
  fields: Record<string, string | number>;
  meta: {
    /** Overall heuristic confidence, 0..1. */
    confidence: number;
    fieldConfidence: Record<string, number>;
    rawText: string;
    /** True once the user has manually corrected any field. */
    edited: boolean;
  };
}
