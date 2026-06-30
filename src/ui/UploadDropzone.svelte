<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let disabled = false;
  const dispatch = createEventDispatcher<{ files: File[] }>();
  let dragging = false;

  function emit(list: FileList | null) {
    if (!list) return;
    const files = Array.from(list).filter((f) => f.type.startsWith('image/'));
    if (files.length) dispatch('files', files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (!disabled) emit(e.dataTransfer?.files ?? null);
  }

  function onPaste(e: ClipboardEvent) {
    if (!disabled) emit(e.clipboardData?.files ?? null);
  }
</script>

<svelte:window on:paste={onPaste} />

<div
  class="dropzone"
  class:dragging
  class:disabled
  role="button"
  tabindex="0"
  on:dragover|preventDefault={() => (dragging = true)}
  on:dragleave={() => (dragging = false)}
  on:drop={onDrop}
>
  <p>Drag &amp; drop images here, paste from clipboard, or</p>
  <label class="pick">
    Choose images
    <input
      type="file"
      accept="image/*"
      multiple
      {disabled}
      on:change={(e) => { emit(e.currentTarget.files); e.currentTarget.value = ''; }}
    />
  </label>
  <p class="muted">Images are processed entirely on your device. Nothing is uploaded.</p>
</div>

<style>
  .dropzone {
    border: 2px dashed var(--border);
    border-radius: 12px;
    padding: 2rem;
    text-align: center;
    transition: border-color 0.15s, background 0.15s;
  }
  .dropzone.dragging { border-color: var(--accent); background: #11151f; }
  .dropzone.disabled { opacity: 0.6; }
  .pick {
    display: inline-block;
    background: var(--accent);
    color: #fff;
    border-radius: 8px;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
  }
  .pick input { display: none; }
</style>
