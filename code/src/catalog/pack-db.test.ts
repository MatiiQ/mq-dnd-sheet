import { expect, it } from 'vitest';
import { deletePack, getPack, putPack } from './pack-db';

// The test runner has no IndexedDB, like a browser that blocks it: the app then runs on SRD data only.
it('reads no pack and refuses to store one where IndexedDB is missing', async () => {
  expect(globalThis.indexedDB).toBeUndefined();
  await expect(getPack()).resolves.toBeNull();
  await expect(putPack([])).rejects.toThrow(/storage/i);
  await expect(deletePack()).rejects.toThrow(/storage/i);
});
