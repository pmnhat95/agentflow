import fs from 'node:fs';
import { statePath, ensureAgentflowDir } from './paths.mjs';

export const PHASES = [
  'init',
  'plan',
  'approve-plan',
  'code',
  'verify',
  'summary',
  'approve-summary',
  'ship',
  'done',
];

const DEFAULT = {
  ticket: null,
  branch: null,
  phase: 'init',
  aiTool: 'claude',
  planLoop: { round: 0, lastVerdict: null },
  repairLoop: { round: 0 },
  createdAt: null,
  updatedAt: null,
  prHash: null,
};

export function readState() {
  const p = statePath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function requireState() {
  const s = readState();
  if (!s) throw new Error("no state found. Run 'agentflow init <TICKET>' first.");
  return s;
}

export function writeState(next) {
  ensureAgentflowDir();
  const merged = { ...DEFAULT, ...next, updatedAt: new Date().toISOString() };
  fs.writeFileSync(statePath(), JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

export function updateState(patch) {
  const cur = requireState();
  return writeState({ ...cur, ...patch });
}

export function nextPhase(current) {
  const i = PHASES.indexOf(current);
  if (i < 0 || i === PHASES.length - 1) return null;
  return PHASES[i + 1];
}
