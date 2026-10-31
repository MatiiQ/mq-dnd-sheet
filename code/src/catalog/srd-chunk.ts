// The SRD data as its own chunk, imported on first use. A module of its own so tests can stand in for the import.
import type { Entry } from './schema';

export const importSrd = (): Promise<Entry[]> => import('../data/srd/index').then((m) => m.default);
