import fs from 'node:fs';
import path from 'node:path';
import { requireState, updateState } from '../state.mjs';
import { readConfig } from '../config.mjs';
import { artifactPath, repoRoot } from '../paths.mjs';
import { getAdapter } from '../adapters/ai/index.mjs';
import { loadPrompt } from '../prompts.mjs';
import { invokeWithAudit } from '../audit.mjs';
import { diffAgainstBase, diffStat } from '../adapters/git/github.mjs';
import { fetchTicket } from '../adapters/ticket/jira.mjs';
import { info, ok, step, warn, rule } from '../ui.mjs';

export async function summary({ flags }) {
  const state = requireState();
  const config = readConfig();
  const aiTool = flags.ai || state.aiTool;

  if (state.phase !== 'summary' && state.phase !== 'approve-summary') {
    warn(`State phase is '${state.phase}', expected 'summary'. Continuing.`);
  }

  step('Collecting diff...');
  const diff = diffAgainstBase();
  const dstat = diffStat();
  fs.writeFileSync(artifactPath('diff.patch'), diff);
  fs.writeFileSync(artifactPath('diff.stat'), dstat);

  const prTemplatePath = findPrTemplate();
  const prTemplate = prTemplatePath ? fs.readFileSync(prTemplatePath, 'utf8') : '';
  if (prTemplate) fs.writeFileSync(artifactPath('pr-template.md'), prTemplate);

  let ticketUrl = '';
  try {
    const t = await fetchTicket(config, state.ticket);
    ticketUrl = t.url;
  } catch { /* offline ok */ }

  const adapter = getAdapter(aiTool);
  adapter.check();

  step('Running Summarizer...');
  const prompt = loadPrompt('summarizer', {
    TICKET_FILE: artifactPath('ticket.md'),
    PLAN_FILE: artifactPath('plan.md'),
    CODER_LOG_FILE: artifactPath('coder-log.md'),
    DIFFSTAT_FILE: artifactPath('diff.stat'),
    DIFF_FILE: artifactPath('diff.patch'),
    PR_TEMPLATE_FILE: prTemplate ? artifactPath('pr-template.md') : '',
    TICKET_URL: ticketUrl,
    TICKET_KEY: state.ticket,
    OUTPUT_FILE: artifactPath('summary.md'),
  });
  fs.writeFileSync(artifactPath('prompt.summary.md'), prompt);
  const out = await invokeWithAudit(adapter, { prompt, label: 'summary', role: 'summarizer' }, { state, phase: 'summary' });
  if (!adapter.headless || !fs.existsSync(artifactPath('summary.md'))) {
    fs.writeFileSync(artifactPath('summary.md'), out);
  }

  updateState({ phase: 'approve-summary' });
  ok('Summary drafted.');
  rule('summary ready');
  info('Review .agentflow/summary.md, then run: agentflow approve');
}

function findPrTemplate() {
  const candidates = [
    '.github/pull_request_template.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'docs/pull_request_template.md',
  ];
  for (const c of candidates) {
    const p = path.join(repoRoot(), c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
