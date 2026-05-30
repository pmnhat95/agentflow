// Credential loading that works even when the editor's integrated terminal
// doesn't source ~/.zshrc (common with GUI-launched Cursor / VS Code).
//
// Resolution order for JIRA_EMAIL / JIRA_TOKEN / JIRA_BASE_URL etc.:
//   1. Real process env (a real `export` always wins — never overridden).
//   2. <repo>/.agentflow/.env        (per-repo; keep it git-ignored)
//   3. ~/.agentflow/.env             (global, recommended for secrets)
//
// File format: simple KEY=VALUE lines. `#` comments and blank lines ignored.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function loadEnvFiles(cwd = process.cwd()) {
  const candidates = [
    path.join(cwd, '.agentflow', '.env'),
    path.join(os.homedir(), '.agentflow', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      // Real exports take precedence; only fill what's missing.
      if (process.env[k] === undefined || process.env[k] === '') {
        process.env[k] = v;
      }
    }
  }
}

function parseEnv(text) {
  const out = {};
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice('export '.length).trim();
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}
