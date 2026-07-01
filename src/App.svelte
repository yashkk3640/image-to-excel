<script lang="ts">
  import { onMount } from 'svelte';
  import UploadDropzone from './ui/UploadDropzone.svelte';
  import ReviewTable from './ui/ReviewTable.svelte';
  import TemplateEditor from './ui/TemplateEditor.svelte';
  import { normalizeImage } from './ingest/normalizeImage';
  import { recognize, type OcrEngine } from './ocr/ocr';
  import { applyTemplate } from './parse/applyTemplate';
  import { ensureTemplates, allTemplates } from './store/templates';
  import { addRecord, saveRecord, deleteRecord, allRecords } from './store/records';
  import { exportBackup, importBackup } from './store/backup';
  import { requestPersistence, storageUsage } from './store/persist';
  import { recordsToWorkbook, downloadWorkbook } from './export/toXlsx';
  import type { AppRecord, Template } from './types';

  let templates: Template[] = [];
  let activeTemplateId = '';
  let records: AppRecord[] = [];
  let selectedMonth = 'all';
  let showEditor = false;
  // OCR engine: Tesseract (default, light) or PaddleOCR (opt-in, ~20 MB, higher
  // accuracy). Persisted so the choice sticks across sessions.
  let engine: OcrEngine = (localStorage.getItem('ocrEngine') as OcrEngine) || 'tesseract';
  $: localStorage.setItem('ocrEngine', engine);

  let busy = false;
  let progressLabel = '';
  let progress = 0;
  let persisted = false;
  let usageText = '';

  $: activeTemplate = templates.find((t) => t.id === activeTemplateId);
  $: months = [...new Set(records.map((r) => r.month))].sort().reverse();
  $: visibleRecords = records.filter(
    (r) => r.templateId === activeTemplateId && (selectedMonth === 'all' || r.month === selectedMonth),
  );

  onMount(async () => {
    templates = await ensureTemplates();
    activeTemplateId = templates.find((t) => t.id === 'upi')?.id ?? templates[0]?.id ?? '';
    records = await allRecords();
    persisted = await requestPersistence();
    await refreshUsage();
  });

  async function refreshUsage() {
    const { usageBytes, quotaBytes } = await storageUsage();
    if (quotaBytes) {
      usageText = `${(usageBytes / 1e6).toFixed(1)} MB used of ${(quotaBytes / 1e6).toFixed(0)} MB`;
    }
  }

  async function reloadTemplates() {
    templates = await allTemplates();
    if (!templates.some((t) => t.id === activeTemplateId)) {
      activeTemplateId = templates[0]?.id ?? '';
    }
  }

  function monthOf(iso: string): string {
    return iso.slice(0, 7);
  }

  async function handleFiles(e: CustomEvent<File[]>) {
    if (!activeTemplate) return;
    busy = true;
    const files = e.detail;
    try {
      for (let i = 0; i < files.length; i++) {
        progressLabel = `Processing ${i + 1} of ${files.length}…`;
        progress = 0;
        const normalized = await normalizeImage(files[i]);
        const ocr = await recognize(normalized, engine, (p) => (progress = p));
        const parsed = applyTemplate(ocr, activeTemplate);
        const now = new Date().toISOString();
        const record: AppRecord = {
          id: crypto.randomUUID(),
          capturedAt: now,
          month: monthOf(now),
          ...parsed,
        };
        await addRecord(record);
      }
      records = await allRecords();
      await refreshUsage();
    } catch (err) {
      console.error(err);
      alert(`Processing failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      busy = false;
      progressLabel = '';
      progress = 0;
    }
  }

  async function onEdit(e: CustomEvent<AppRecord>) {
    await saveRecord(e.detail);
    records = records.map((r) => (r.id === e.detail.id ? e.detail : r));
  }

  async function onRemove(e: CustomEvent<string>) {
    await deleteRecord(e.detail);
    records = records.filter((r) => r.id !== e.detail);
    await refreshUsage();
  }

  function exportExcel() {
    const wb = recordsToWorkbook(records, templates);
    downloadWorkbook(wb, `image-to-excel-${new Date().toISOString().slice(0, 7)}.xlsx`);
  }

  async function backup() {
    const blob = await exportBackup();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `image-to-excel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restore(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const n = await importBackup(file);
    records = await allRecords();
    input.value = '';
    await refreshUsage();
    alert(`Restored ${n} record(s).`);
  }
</script>

<main>
  <header>
    <h1>Image → Excel</h1>
    <p class="muted">
      Turn UPI payment screenshots (GPay · PhonePe · Paytm · PayZapp) into a spending log.
      On-device OCR — your images never leave this browser.
    </p>
  </header>

  <section class="panel">
    <div class="row spread">
      <div class="row">
        <label>
          Template
          <select bind:value={activeTemplateId} disabled={busy}>
            {#each templates as t (t.id)}<option value={t.id}>{t.name}</option>{/each}
          </select>
        </label>
        <button on:click={() => (showEditor = !showEditor)}>{showEditor ? 'Close editor' : 'Edit templates'}</button>
      </div>
      <span class="muted">{usageText}{persisted ? ' · persisted' : ''}</span>
    </div>
    <div class="row engine">
      <label title="PaddleOCR is far more accurate on payment screenshots but downloads ~20 MB the first time you use it (cached afterwards).">
        <input type="checkbox" checked={engine === 'paddle'} disabled={busy}
          on:change={(e) => (engine = e.currentTarget.checked ? 'paddle' : 'tesseract')} />
        High-accuracy OCR (PaddleOCR)
      </label>
      <span class="muted">
        {engine === 'paddle' ? 'Downloads ~20 MB on first use, then works offline.' : 'Fast, lightweight. Enable high-accuracy for hard-to-read amounts.'}
      </span>
    </div>
    {#if showEditor}
      <div class="editor-wrap">
        <TemplateEditor {templates} on:change={reloadTemplates} />
      </div>
    {/if}
  </section>

  <section class="panel">
    <UploadDropzone on:files={handleFiles} disabled={busy} />
    {#if busy}
      <div class="progress">
        <span>{progressLabel}</span>
        <div class="bar"><div class="fill" style="width:{Math.round(progress * 100)}%"></div></div>
      </div>
    {/if}
  </section>

  <section class="panel">
    <div class="row spread">
      <div class="row">
        <h2>Records <span class="muted">({visibleRecords.length})</span></h2>
        <label>
          Month
          <select bind:value={selectedMonth}>
            <option value="all">All</option>
            {#each months as m}<option value={m}>{m}</option>{/each}
          </select>
        </label>
      </div>
      <div class="row">
        <button on:click={backup} disabled={records.length === 0}>Backup (JSON)</button>
        <label class="restore">
          Restore
          <input type="file" accept="application/json" on:change={restore} />
        </label>
        <button class="primary" on:click={exportExcel} disabled={records.length === 0}>Download Excel</button>
      </div>
    </div>
    {#if activeTemplate}
      <ReviewTable template={activeTemplate} records={visibleRecords} on:edit={onEdit} on:remove={onRemove} />
    {/if}
  </section>
</main>

<style>
  main { max-width: 980px; margin: 0 auto; padding: 1.5rem 1rem 4rem; display: flex; flex-direction: column; gap: 1.25rem; }
  header p { margin: 0; }
  label { display: inline-flex; gap: 0.4rem; align-items: center; }
  .spread { justify-content: space-between; }
  .editor-wrap { margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 1rem; }
  .engine { margin-top: 0.75rem; font-size: 0.9rem; }
  .engine label { gap: 0.45rem; cursor: pointer; }
  .progress { margin-top: 1rem; }
  .bar { height: 8px; background: #0c0e13; border-radius: 999px; overflow: hidden; margin-top: 0.35rem; }
  .fill { height: 100%; background: var(--accent); transition: width 0.2s; }
  .restore { display: inline-block; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.9rem; cursor: pointer; }
  .restore input { display: none; }
</style>
