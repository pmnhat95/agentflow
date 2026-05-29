import fs from 'node:fs';
import { ensureAgentflowDir, artifactPath } from '../paths.mjs';
import { writeState } from '../state.mjs';
import { ensureConfig } from '../config.mjs';
import { fetchTicket, formatTicketMarkdown, postComment } from '../adapters/ticket/jira.mjs';
import { ensureBranch, isClean, assertGhAvailable } from '../adapters/git/github.mjs';
import { getAdapter } from '../adapters/ai/index.mjs';
import { loadPrompt } from '../prompts.mjs';
import { invokeWithAudit } from '../audit.mjs';
import { codemapPath } from '../codemap.mjs';
import { ok, info, warn, step, confirm, prompt as ask, rule } from '../ui.mjs';

export async function init({ args, flags }) {
  const ticket = args[0];
  if (!ticket) throw new Error('usage: agentflow init <TICKET-KEY>');

  ensureAgentflowDir();
  const config = ensureConfig();
  const aiTool = flags.ai || config.ai_tool;

  step(`Initializing agentflow for ${ticket} (ai_tool=${aiTool})`);

  if (!isClean()) {
    const proceed = await confirm('Working tree is dirty. Continue anyway?', false);
    if (!proceed) throw new Error('aborted: clean working tree first.');
  }

  step('Fetching ticket from Jira...');
  const t = await fetchTicket(config, ticket);
  fs.writeFileSync(artifactPath('ticket.md'), formatTicketMarkdown(t));
  ok(`Ticket: ${t.key} — ${t.summary}`);

  const createdAt = new Date().toISOString();
  const branchName = makeBranchName(ticket, t.summary);

  // Ticket sanity check (skip with --no-audit)
  if (!flags.noAudit) {
    const auditAction = await runTicketAudit({ ticket: t, aiTool, config, createdAt });
    if (auditAction === 'abort') { warn('Aborted — no state written.'); return; }
    if (auditAction === 'asked') {
      info('Posted clarification request on Jira. Re-run `agentflow init` after the reporter responds.');
      return;
    }
    // 'continue' falls through
  }

  if (!fs.existsSync(codemapPath())) {
    warn(`No ${codemapPath()} yet. Strongly consider running 'agentflow prime' once per repo for better Researcher/Coder context.`);
  }

  step(`Ensuring branch '${branchName}'...`);
  const { created } = ensureBranch(branchName);
  ok(`${created ? 'Created' : 'Checked out'} ${branchName}`);

  try { assertGhAvailable(); } catch (e) { warn(e.message); }

  writeState({
    ticket: t.key,
    branch: branchName,
    phase: 'plan',
    aiTool,
    planLoop: { round: 0, lastVerdict: null },
    repairLoop: { round: 0 },
    createdAt,
    runId: `${createdAt.replace(/[:.]/g, '-')}-${t.key}`,
  });

  info('\nNext: agentflow plan');
}

async function runTicketAudit({ ticket, aiTool, config, createdAt }) {
  const adapter = getAdapter(aiTool);
  try { adapter.check(); } catch (e) { warn(`Skipping ticket audit: ${e.message}`); return 'continue'; }

  step('Auditing ticket quality...');
  const outPath = artifactPath('ticket-audit.md');
  const prompt = loadPrompt('ticket-auditor', {
    TICKET_FILE: artifactPath('ticket.md'),
    OUTPUT_FILE: outPath,
    TICKET_KEY: ticket.key,
  });
  fs.writeFileSync(artifactPath('prompt.ticket-audit.md'), prompt);
  const out = await invokeWithAudit(adapter, { prompt, label: 'ticket-audit', role: 'ticket-audit' }, { state: { ticket: ticket.key, createdAt }, phase: 'ticket-audit' });
  if (!fs.existsSync(outPath) || fs.readFileSync(outPath, 'utf8').trim() === '') {
    fs.writeFileSync(outPath, out);
  }
  const audit = fs.readFileSync(outPath, 'utf8');
  const m = audit.match(/##\s*Score\s*\n+\s*([0-9.]+)/i);
  const score = m ? parseFloat(m[1]) : NaN;
  ok(`Ticket audit score: ${Number.isFinite(score) ? score.toFixed(2) : 'n/a'} (see ${outPath})`);

  if (!Number.isFinite(score) || score >= 0.75) return 'continue';

  rule('ticket needs clarification');
  info(audit.split('## Issues')[1]?.split('## Clarification')[0]?.trim() || '');
  info(`Choose: [c]ontinue anyway · [a]sk reporter (post comment on Jira) · [q]uit`);
  const ans = (await ask('Action', { defaultValue: 'c' })).toLowerCase();
  if (ans === 'q') return 'abort';
  if (ans === 'a') {
    const req = (audit.split('## Clarification request')[1] || '').trim();
    if (!req) { warn('No clarification text generated; falling through.'); return 'continue'; }
    try {
      await postComment(config, ticket.key, req);
      ok('Posted clarification on Jira.');
      return 'asked';
    } catch (e) {
      warn(`Failed to post comment: ${e.message}`);
      return 'continue';
    }
  }
  return 'continue';
}

function makeBranchName(key, summary) {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `feature/${key.toLowerCase()}${slug ? `-${slug}` : ''}`;
}
