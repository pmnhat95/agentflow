import fs from 'node:fs';
import YAML from 'yaml';
import { configPath, ensureAgentflowDir } from './paths.mjs';

export const DEFAULT_CONFIG = {
  ai_tool: 'claude', // claude | cursor | copilot
  ticket_provider: 'jira', // jira (only for MVP)
  git_host: 'github',
  max_loop_rounds: 3,
  max_repair_rounds: 3,
  tdd: true,
  jira: {
    // base_url: 'https://yourorg.atlassian.net',
    // email_env: 'JIRA_EMAIL',
    // token_env: 'JIRA_TOKEN',
  },
  verify: {
    // commands run in order; first failure triggers repair loop
    // edit per repo, e.g.: ['npm run lint', 'npm test', 'npm run build']
    commands: [],
  },
  models: {
    // Two-level mapping: role → tier → model_id.
    // Change a tier once to swap costs across all roles in that tier,
    // or override a single role to bypass.
    tiers: {
      cheap:  'haiku',
      strong: 'sonnet',
    },
    roles: {
      // Defaults live in src/models.mjs#ROLE_DEFAULTS; override here per repo.
      // researcher: 'cheap',
      // planner:    'strong',
      // critic:     'cheap',
      // coder:      'strong',
    },
  },
};

export function readConfig() {
  const p = configPath();
  if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG };
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = YAML.parse(raw) || {};
  return deepMerge(DEFAULT_CONFIG, parsed);
}

export function writeConfig(cfg) {
  ensureAgentflowDir();
  fs.writeFileSync(configPath(), YAML.stringify(cfg));
}

export function ensureConfig() {
  if (!fs.existsSync(configPath())) writeConfig(DEFAULT_CONFIG);
  return readConfig();
}

function deepMerge(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return b ?? a;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return b ?? a;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
  return out;
}
