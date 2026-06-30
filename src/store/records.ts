import { db } from './db';
import type { AppRecord } from '../types';

export function addRecord(r: AppRecord): Promise<string> {
  return db.records.add(r);
}

export function saveRecord(r: AppRecord): Promise<string> {
  return db.records.put(r);
}

export function deleteRecord(id: string): Promise<void> {
  return db.records.delete(id);
}

export function allRecords(): Promise<AppRecord[]> {
  return db.records.orderBy('capturedAt').reverse().toArray();
}

export function recordsForMonth(month: string): Promise<AppRecord[]> {
  return db.records.where('month').equals(month).toArray();
}
