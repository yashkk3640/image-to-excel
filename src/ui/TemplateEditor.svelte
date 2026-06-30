<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Template, FieldType } from '../types';
  import { saveTemplate, deleteTemplate } from '../store/templates';

  export let templates: Template[];

  const dispatch = createEventDispatcher<{ change: void }>();

  let draft: Template | null = null;
  let error = '';

  const FIELD_TYPES: FieldType[] = ['string', 'number', 'date'];

  function edit(t: Template) {
    // Deep copy so edits aren't applied until Save.
    draft = { ...t, fields: t.fields.map((f) => ({ ...f })) };
    error = '';
  }

  function create() {
    draft = {
      id: crypto.randomUUID(),
      name: 'New template',
      fields: [{ key: 'field1', label: 'Field 1', type: 'string', regex: '' }],
    };
    error = '';
  }

  function addField() {
    if (!draft) return;
    const n = draft.fields.length + 1;
    draft.fields = [...draft.fields, { key: `field${n}`, label: `Field ${n}`, type: 'string', regex: '' }];
  }

  function removeField(i: number) {
    if (!draft) return;
    draft.fields = draft.fields.filter((_, idx) => idx !== i);
  }

  function validate(t: Template): string {
    if (!t.name.trim()) return 'Template name is required.';
    if (t.fields.length === 0) return 'Add at least one field.';
    const keys = new Set<string>();
    for (const f of t.fields) {
      if (!f.key.trim()) return 'Every field needs a key.';
      if (keys.has(f.key)) return `Duplicate field key: ${f.key}`;
      keys.add(f.key);
      if (f.regex) {
        try {
          new RegExp(f.regex, f.flags ?? 'i');
        } catch {
          return `Invalid regex for "${f.label}".`;
        }
      }
    }
    return '';
  }

  async function save() {
    if (!draft) return;
    const msg = validate(draft);
    if (msg) {
      error = msg;
      return;
    }
    await saveTemplate(draft);
    draft = null;
    dispatch('change');
  }

  async function remove() {
    if (!draft) return;
    if (!confirm(`Delete template "${draft.name}"? Existing records are kept but lose their column mapping.`)) return;
    await deleteTemplate(draft.id);
    draft = null;
    dispatch('change');
  }
</script>

<div class="editor">
  {#if !draft}
    <div class="row spread">
      <ul class="list">
        {#each templates as t (t.id)}
          <li><button class="link" on:click={() => edit(t)}>{t.name}</button> <span class="muted">({t.fields.length} fields)</span></li>
        {/each}
      </ul>
      <button on:click={create}>+ New template</button>
    </div>
  {:else}
    <div class="form">
      <label class="block">
        Name
        <input bind:value={draft.name} />
      </label>

      <table>
        <thead>
          <tr><th>Label</th><th>Key</th><th>Type</th><th>Regex (capture group 1)</th><th>Flags</th><th></th></tr>
        </thead>
        <tbody>
          {#each draft.fields as f, i (i)}
            <tr>
              <td><input bind:value={f.label} /></td>
              <td><input bind:value={f.key} /></td>
              <td>
                <select bind:value={f.type}>
                  {#each FIELD_TYPES as ft}<option value={ft}>{ft}</option>{/each}
                </select>
              </td>
              <td><input class="mono" bind:value={f.regex} placeholder="e.g. total[^0-9]*([0-9.]+)" /></td>
              <td><input class="flags" bind:value={f.flags} placeholder="i" /></td>
              <td><button class="del" on:click={() => removeField(i)}>✕</button></td>
            </tr>
          {/each}
        </tbody>
      </table>

      <div class="row">
        <button on:click={addField}>+ Add field</button>
      </div>

      {#if error}<p class="error">{error}</p>{/if}

      <div class="row spread actions">
        <button class="del" on:click={remove}>Delete template</button>
        <div class="row">
          <button on:click={() => (draft = null)}>Cancel</button>
          <button class="primary" on:click={save}>Save template</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
  .link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; }
  .spread { justify-content: space-between; align-items: flex-start; }
  .block { display: flex; flex-direction: column; gap: 0.3rem; max-width: 22rem; }
  .form { display: flex; flex-direction: column; gap: 0.9rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.3rem 0.4rem; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
  input { width: 100%; }
  .mono { font-family: ui-monospace, monospace; font-size: 0.85rem; }
  .flags { width: 4rem; }
  .del { color: var(--danger); border-color: transparent; }
  .error { color: var(--danger); margin: 0; }
  .actions { align-items: center; }
</style>
