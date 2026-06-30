// Browser storage is best-effort and can be evicted under disk pressure.
// Requesting persistence makes the browser keep the data until the user
// explicitly clears it. Always pair this with JSON backup (see backup.ts).

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export interface StorageUsage {
  usageBytes: number;
  quotaBytes: number;
}

export async function storageUsage(): Promise<StorageUsage> {
  if (!navigator.storage?.estimate) return { usageBytes: 0, quotaBytes: 0 };
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usageBytes: usage, quotaBytes: quota };
}
