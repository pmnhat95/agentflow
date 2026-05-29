import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PACKAGE_ROOT = path.resolve(__dirname, '..');

export function repoRoot() {
  return process.cwd();
}

export function agentflowDir() {
  return path.join(repoRoot(), '.agentflow');
}

export function statePath() {
  return path.join(agentflowDir(), 'state.json');
}

export function configPath() {
  return path.join(agentflowDir(), 'config.yaml');
}

export function artifactPath(name) {
  return path.join(agentflowDir(), name);
}

export function promptTemplatePath(name) {
  return path.join(PACKAGE_ROOT, 'prompts', `${name}.md`);
}

export function ensureAgentflowDir() {
  const dir = agentflowDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
