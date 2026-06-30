import { db } from './db';
import type { AppRecord } from '../types';

interface BackupFile {
  version: number;
  exportedAt: string;
  records: AppRecord[];
}

export async function exportBackup(): Promise<Blob> {
  const records = await db.records.toArray();
  const payload: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    records,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

// Merge-restore: bulkPut upserts by id, so re-importing is idempotent and
// never duplicates existing rows.
export async function importBackup(file: Blob): Promise<number> {
  const data = JSON.parse(await file.text()) as Partial<BackupFile>;
  const records = data.records ?? [];
  await db.records.bulkPut(records);
  return records.length;
}
