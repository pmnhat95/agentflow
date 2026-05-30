// Deterministic ticket fetch — no AI. Called by the in-editor agent at the
// start of /agentflow-start or /agentflow-plan. Fetches the Jira ticket,
// creates the working branch, and initializes state.
import fs from 'node:fs';
import { ensureAgentflowDir, artifactPath } from '../paths.mjs';
import { writeState, readState } from '../state.mjs';
import { ensureConfig, readConfig } from '../config.mjs';
import { fetchTicket, formatTicketMarkdown } from '../adapters/ticket/jira.mjs';
import { ensureBranch, isClean } from '../adapters/git/github.mjs';
import { ok, info, warn, step } from '../ui.mjs';

export async function ticket({ args, flags }) {
  const key = args[0];
  if (!key) throw new Error('usage: agentflow ticket <TICKET-KEY>');

  ensureAgentflowDir();
  const config = ensureConfig();

  if (!isClean() && !flags.force) {
    warn('Working tree is dirty. Commit/stash first, or pass --force.');
  }

  step(`Fetching ${key} from Jira...`);
  const t = await fetchTicket(config, key);
  fs.writeFileSync(artifactPath('ticket.md'), formatTicketMarkdown(t));
  ok(`Ticket: ${t.key} — ${t.summary}`);

  const branchName = makeBranchName(t.key, t.summary);
  step(`Ensuring branch '${branchName}'...`);
  const { created } = ensureBranch(branchName);
  ok(`${created ? 'Created' : 'Checked out'} ${branchName}`);

  const createdAt = new Date().toISOString();
  const prev = readState();
  writeState({
    ...(prev || {}),
    ticket: t.key,
    branch: branchName,
    phase: 'plan',
    aiTool: prev?.aiTool || config.ai_tool,
    planLoop: { round: 0, lastVerdict: null },
    repairLoop: { round: 0 },
    createdAt,
    runId: `${createdAt.replace(/[:.]/g, '-')}-${t.key}`,
    prUrl: null,
  });

  info(`\nTicket saved to .agentflow/ticket.md. Branch ready.`);
}

function makeBranchName(key, summary) {
  const slug = (summary || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `feature/${key.toLowerCase()}${slug ? `-${slug}` : ''}`;
}
