// Audit log: every prompt+response gets persisted under .agentflow/audit/<run-id>/
// with a timestamp prefix, so a run is fully reproducible/reviewable.
import fs from 'node:fs';
import path from 'node:path';
import { artifactPath } from './paths.mjs';
import { readConfig } from './config.mjs';
import { resolveModel } from './models.mjs';

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function runIdFor(state) {
  if (state?.runId) return state.runId;
  const base = state?.createdAt ? state.createdAt.replace(/[:.]/g, '-') : ts();
  return `${base}-${state?.ticket || 'unknown'}`;
}

export function auditDir(state) {
  const dir = artifactPath(path.join('audit', runIdFor(state)));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Wrap an adapter.invoke call so prompt + output get written to the audit dir.
// The adapter contract is unchanged from the caller's perspective.
// Pass `role` so the audit/cost command can attribute spend by role and so
// the adapter receives the correct per-role model.
export async function invokeWithAudit(adapter, { prompt, label, allowedTools, role }, { state, phase }) {
  const dir = auditDir(state);
  const stamp = ts();
  const config = readConfig();
  const model = role ? resolveModel(role, config) : undefined;

  fs.writeFileSync(path.join(dir, `${stamp}-${label}-prompt.md`), prompt);
  const meta = {
    ts: stamp, label, phase, role: role || null,
    ai_tool: adapter.id, headless: adapter.headless,
    model: model || null,
  };
  fs.writeFileSync(path.join(dir, `${stamp}-${label}-meta.json`), JSON.stringify(meta, null, 2));
  let out = '';
  try {
    out = await adapter.invoke({ prompt, label, allowedTools, model });
  } finally {
    fs.writeFileSync(path.join(dir, `${stamp}-${label}-output.md`), out || '(adapter returned empty; check artifact file)');
  }
  return out;
}
