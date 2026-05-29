import fs from 'node:fs';
import path from 'node:path';
import { ensureAgentflowDir, artifactPath, repoRoot } from '../paths.mjs';
import { readConfig, ensureConfig } from '../config.mjs';
import { buildHeuristicCodemap, formatCodemap, codemapPath, conventionFiles } from '../codemap.mjs';
import { getAdapter } from '../adapters/ai/index.mjs';
import { loadPrompt } from '../prompts.mjs';
import { invokeWithAudit } from '../audit.mjs';
import { readState } from '../state.mjs';
import { info, ok, step, warn, confirm } from '../ui.mjs';

export async function prime({ flags }) {
  ensureAgentflowDir();
  ensureConfig();
  const config = readConfig();

  step('Scanning repository (heuristics)...');
  const data = buildHeuristicCodemap();
  ok(`Detected: ${data.languages.join(', ') || 'unknown lang'} / ${data.testFramework || 'no test framework'} / ${data.linters.join(', ') || 'no linter'}`);

  let overview = '';
  const useAI = !flags.heuristicOnly;
  if (useAI) {
    if (!flags.yes) {
      const yes = await confirm('Ask AI to write a 200-word architecture overview? (one extra prompt)', true);
      if (!yes) info('Skipping AI overview.');
    }
  }
  if (useAI && (flags.yes || true)) {
    try {
      overview = await askAiOverview({ data, config, state: readState() });
    } catch (e) {
      warn(`AI overview skipped: ${e.message}`);
    }
  }

  const md = formatCodemap(data, { overview });
  fs.writeFileSync(codemapPath(), md);
  ok(`Wrote ${path.relative(process.cwd(), codemapPath())}`);
  if (data.conventions.length) {
    info(`Existing convention docs found — Researcher/Coder prompts will reference them via the codemap.`);
  } else {
    info('No CONTRIBUTING / CLAUDE / AGENTS / cursor rules detected; consider adding one for stronger guidance.');
  }
}

async function askAiOverview({ data, config, state }) {
  const aiTool = config.ai_tool;
  const adapter = getAdapter(aiTool);
  adapter.check();

  fs.writeFileSync(artifactPath('codemap-facts.json'), JSON.stringify(data, null, 2));
  const layoutLines = data.layout.map((e) => e.kind === 'dir' ? `- ${e.name}/ (${e.fileCount} files)` : `- ${e.name}`).join('\n');
  fs.writeFileSync(artifactPath('codemap-layout.txt'), layoutLines);
  const conv = conventionFiles().map((c) => {
    const full = path.join(repoRoot(), c.path);
    if (c.kind === 'file' && fs.existsSync(full)) {
      const body = fs.readFileSync(full, 'utf8').slice(0, 4000);
      return `## ${c.path}\n\n${body}`;
    }
    return `## ${c.path}\n(directory)`;
  }).join('\n\n');
  fs.writeFileSync(artifactPath('codemap-conventions.md'), conv);

  const prompt = loadPrompt('codemap-overview', {
    FACTS_FILE: artifactPath('codemap-facts.json'),
    LAYOUT_FILE: artifactPath('codemap-layout.txt'),
    CONVENTIONS_FILE: artifactPath('codemap-conventions.md'),
    OUTPUT_FILE: artifactPath('codemap-overview.md'),
  });
  fs.writeFileSync(artifactPath('prompt.codemap-overview.md'), prompt);
  const out = await invokeWithAudit(adapter, { prompt, label: 'codemap-overview', role: 'codemap-overview' }, { state: state || { ticket: 'prime', createdAt: new Date().toISOString() }, phase: 'prime' });
  return out.trim();
}
