import { db } from './db';
import { BUILTIN_TEMPLATES } from '../parse/templates';
import type { Template } from '../types';

// Ensure every built-in template exists (by id), without overwriting any the
// user has since edited. Newly shipped built-ins appear automatically; user
// templates and edits are preserved.
export async function ensureTemplates(): Promise<Template[]> {
  const existingIds = new Set(await db.templates.toCollection().primaryKeys());
  const missing = BUILTIN_TEMPLATES.filter((t) => !existingIds.has(t.id));
  if (missing.length) await db.templates.bulkAdd(missing);
  return db.templates.toArray();
}

export function allTemplates(): Promise<Template[]> {
  return db.templates.toArray();
}

export function saveTemplate(t: Template): Promise<string> {
  return db.templates.put(t);
}

export function deleteTemplate(id: string): Promise<void> {
  return db.templates.delete(id);
}
