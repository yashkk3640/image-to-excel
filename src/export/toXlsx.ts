import * as XLSX from 'xlsx';
import type { AppRecord, Template } from '../types';

// Pure: records -> workbook, generated entirely in-browser. The workbook has a
// Summary sheet (counts per month), an "All records" sheet, and one sheet per
// month — the shape the month-end export workflow wants.

function rowFor(record: AppRecord, byId: Map<string, Template>): Record<string, unknown> {
  const t = byId.get(record.templateId);
  const row: Record<string, unknown> = {
    Date: record.capturedAt.slice(0, 10),
    Template: t?.name ?? record.templateId,
  };
  // json_to_sheet unions keys across all rows, so ragged rows (mixed templates)
  // are fine — absent fields become blank cells.
  if (t) for (const f of t.fields) row[f.label] = record.fields[f.key] ?? '';
  row.Confidence = `${Math.round(record.meta.confidence * 100)}%`;
  return row;
}

function groupByMonth(records: AppRecord[]): Map<string, AppRecord[]> {
  const map = new Map<string, AppRecord[]>();
  for (const r of records) {
    const list = map.get(r.month) ?? [];
    list.push(r);
    map.set(r.month, list);
  }
  return map;
}

export function recordsToWorkbook(records: AppRecord[], templates: Template[]): XLSX.WorkBook {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const wb = XLSX.utils.book_new();

  const byMonth = groupByMonth(records);
  const months = [...byMonth.keys()].sort().reverse();

  const summary = months.map((m) => ({ Month: m, Records: byMonth.get(m)!.length }));
  summary.push({ Month: 'Total', Records: records.length });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary');

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(records.map((r) => rowFor(r, byId))),
    'All records',
  );

  for (const m of months) {
    const rows = byMonth.get(m)!.map((r) => rowFor(r, byId));
    // Sheet names are capped at 31 chars and forbid : \ / ? * [ ] — "YYYY-MM" is safe.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), m);
  }

  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, filename);
}
