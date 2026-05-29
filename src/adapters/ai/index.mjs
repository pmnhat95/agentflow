import * as claude from './claude.mjs';
import * as cursor from './cursor.mjs';
import * as copilot from './copilot.mjs';

const REGISTRY = { claude, cursor, copilot };

export function getAdapter(id) {
  const a = REGISTRY[id];
  if (!a) throw new Error(`unknown AI tool '${id}'. Supported: ${Object.keys(REGISTRY).join(', ')}`);
  return a;
}
