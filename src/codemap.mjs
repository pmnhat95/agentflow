// Repo priming: scan once per repo to detect language, test framework, lint config,
// top-level layout, and existing convention docs. Result is injected into
// Researcher / Coder prompts as {{CODEMAP}} so the AI doesn't have to rediscover
// these basics on every run.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, artifactPath } from './paths.mjs';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.turbo', '.cache',
  'coverage', 'venv', '.venv', '__pycache__', 'target', 'vendor', '.idea', '.vscode',
]);

export function detectLanguages(root = repoRoot()) {
  const langs = new Set();
  const markers = [
    ['package.json',    'javascript/typescript'],
    ['tsconfig.json',   'typescript'],
    ['pyproject.toml',  'python'],
    ['requirements.txt','python'],
    ['Pipfile',         'python'],
    ['go.mod',          'go'],
    ['Cargo.toml',      'rust'],
    ['pom.xml',         'java'],
    ['build.gradle',    'java/kotlin'],
    ['build.gradle.kts','kotlin'],
    ['Gemfile',         'ruby'],
    ['composer.json',   'php'],
    ['mix.exs',         'elixir'],
  ];
  for (const [file, lang] of markers) {
    if (fs.existsSync(path.join(root, file))) langs.add(lang);
  }
  return [...langs];
}

export function detectTestFramework(root = repoRoot()) {
  const pkg = readJsonSafe(path.join(root, 'package.json'));
  if (pkg) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const f of ['vitest', 'jest', 'mocha', 'ava', '@playwright/test', 'cypress', 'tap']) {
      if (deps?.[f]) return f;
    }
  }
  if (fs.existsSync(path.join(root, 'pytest.ini')) || fs.existsSync(path.join(root, 'pyproject.toml'))) {
    if (readFileSafe(path.join(root, 'pyproject.toml')).includes('pytest')) return 'pytest';
  }
  if (fs.existsSync(path.join(root, 'go.mod'))) return 'go test';
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'cargo test';
  return null;
}

export function detectLinters(root = repoRoot()) {
  const found = [];
  const pkg = readJsonSafe(path.join(root, 'package.json'));
  const deps = pkg ? { ...pkg.dependencies, ...pkg.devDependencies } : {};
  const checks = [
    ['eslint',         ['.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yaml', 'eslint.config.js', 'eslint.config.mjs']],
    ['prettier',       ['.prettierrc', '.prettierrc.json', '.prettierrc.js', 'prettier.config.js']],
    ['ruff',           ['ruff.toml', 'pyproject.toml']],
    ['black',          ['pyproject.toml']],
    ['mypy',           ['mypy.ini', 'pyproject.toml']],
    ['golangci-lint',  ['.golangci.yml', '.golangci.yaml']],
    ['rustfmt',        ['rustfmt.toml']],
    ['clippy',         ['.cargo/config.toml']],
  ];
  for (const [name, files] of checks) {
    if (deps?.[name]) { found.push(name); continue; }
    if (files.some((f) => {
      const p = path.join(root, f);
      if (!fs.existsSync(p)) return false;
      if (f === 'pyproject.toml') return readFileSafe(p).includes(name);
      return true;
    })) found.push(name);
  }
  return [...new Set(found)];
}

export function detectScripts(root = repoRoot()) {
  const pkg = readJsonSafe(path.join(root, 'package.json'));
  if (pkg?.scripts) return pkg.scripts;
  if (fs.existsSync(path.join(root, 'Makefile'))) return { makefile: readFileSafe(path.join(root, 'Makefile')).slice(0, 800) };
  return {};
}

export function topLevelLayout(root = repoRoot()) {
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.') && !IGNORE_DIRS.has(e.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const out = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      const childCount = safeCount(path.join(root, e.name));
      out.push({ kind: 'dir', name: e.name, fileCount: childCount });
    } else {
      out.push({ kind: 'file', name: e.name });
    }
  }
  return out;
}

function safeCount(dir, max = 2000) {
  let n = 0;
  const stack = [dir];
  while (stack.length && n < max) {
    const cur = stack.pop();
    let ents;
    try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) stack.push(path.join(cur, e.name));
      } else {
        n++;
        if (n >= max) break;
      }
    }
  }
  return n;
}

export function conventionFiles(root = repoRoot()) {
  const found = [];
  const candidates = [
    'CONTRIBUTING.md',
    'CONTRIBUTING',
    'CLAUDE.md',
    'AGENTS.md',
    '.cursor/rules',
    '.cursorrules',
    '.github/copilot-instructions.md',
    'docs/conventions.md',
    'docs/architecture.md',
  ];
  for (const c of candidates) {
    const p = path.join(root, c);
    if (fs.existsSync(p)) {
      const s = fs.statSync(p);
      found.push({ path: c, kind: s.isDirectory() ? 'dir' : 'file' });
    }
  }
  return found;
}

export function buildHeuristicCodemap(root = repoRoot()) {
  const data = {
    root,
    languages: detectLanguages(root),
    testFramework: detectTestFramework(root),
    linters: detectLinters(root),
    scripts: detectScripts(root),
    layout: topLevelLayout(root),
    conventions: conventionFiles(root),
  };
  return data;
}

export function formatCodemap(data, { overview = '' } = {}) {
  const lines = [];
  lines.push(`# Codemap`);
  lines.push('');
  lines.push(`_Heuristic snapshot of the repo, refreshed by \`agentflow prime\`._`);
  lines.push('');
  if (overview) { lines.push('## Overview'); lines.push(''); lines.push(overview.trim()); lines.push(''); }
  lines.push('## Stack');
  lines.push(`- **Languages:** ${data.languages.join(', ') || 'unknown'}`);
  lines.push(`- **Test framework:** ${data.testFramework || 'unknown'}`);
  lines.push(`- **Linters/formatters:** ${data.linters.join(', ') || 'none detected'}`);
  lines.push('');
  if (Object.keys(data.scripts).length) {
    lines.push('## Scripts');
    for (const [k, v] of Object.entries(data.scripts).slice(0, 20)) {
      lines.push(`- \`${k}\`: ${typeof v === 'string' ? v.replace(/\n/g, ' ').slice(0, 120) : ''}`);
    }
    lines.push('');
  }
  lines.push('## Top-level layout');
  for (const e of data.layout) {
    if (e.kind === 'dir') lines.push(`- \`${e.name}/\`  (${e.fileCount} files)`);
    else lines.push(`- \`${e.name}\``);
  }
  lines.push('');
  if (data.conventions.length) {
    lines.push('## Existing convention docs (read these first when planning)');
    for (const c of data.conventions) lines.push(`- \`${c.path}\``);
    lines.push('');
  }
  return lines.join('\n');
}

export function codemapPath() { return artifactPath('codemap.md'); }
export function readCodemap() {
  const p = codemapPath();
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
