import Dexie, { type Table } from 'dexie';
import type { AppRecord, Template } from '../types';

export class AppDB extends Dexie {
  records!: Table<AppRecord, string>;
  templates!: Table<Template, string>;

  constructor() {
    super('image-to-excel');
    this.version(1).stores({
      records: 'id, month, capturedAt, templateId',
      templates: 'id',
    });
  }
}

export const db = new AppDB();
