<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AppRecord, Template } from '../types';

  export let template: Template;
  export let records: AppRecord[];

  const dispatch = createEventDispatcher<{ edit: AppRecord; remove: string }>();

  const LOW_CONFIDENCE = 0.6;

  function onFieldInput(record: AppRecord, key: string, value: string, type: string) {
    const next: AppRecord = {
      ...record,
      fields: { ...record.fields, [key]: type === 'number' && value ? Number(value) : value },
      meta: {
        ...record.meta,
        edited: true,
        // A manual edit is trusted: mark this field fully confident.
        fieldConfidence: { ...record.meta.fieldConfidence, [key]: 1 },
      },
    };
    dispatch('edit', next);
  }
</script>

{#if records.length === 0}
  <p class="muted">No records yet for “{template.name}”. Upload an image to get started.</p>
{:else}
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          {#each template.fields as f (f.key)}<th>{f.label}</th>{/each}
          <th>Confidence</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each records as r (r.id)}
          <tr>
            <td class="muted">{r.capturedAt.slice(0, 10)}</td>
            {#each template.fields as f (f.key)}
              <td class:low={(r.meta.fieldConfidence[f.key] ?? 0) < LOW_CONFIDENCE}>
                <input
                  value={r.fields[f.key] ?? ''}
                  type={f.type === 'number' ? 'number' : 'text'}
                  on:change={(e) => onFieldInput(r, f.key, e.currentTarget.value, f.type)}
                />
              </td>
            {/each}
            <td class="muted">{Math.round(r.meta.confidence * 100)}%{r.meta.edited ? ' ✎' : ''}</td>
            <td><button class="del" on:click={() => dispatch('remove', r.id)}>✕</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="muted hint">Highlighted cells have low OCR confidence — please review them. Edits save automatically.</p>
{/if}

<style>
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
  th { color: var(--muted); font-weight: 500; font-size: 0.85rem; }
  td.low { background: rgba(255, 206, 79, 0.12); }
  td.low input { border-color: var(--warn); }
  input { width: 100%; min-width: 7rem; }
  .del { padding: 0.2rem 0.5rem; border-color: transparent; color: var(--danger); }
  .hint { font-size: 0.8rem; }
</style>
