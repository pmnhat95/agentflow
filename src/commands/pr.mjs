// Deterministic PR creation — called by the in-editor agent at /agentflow-ship
// after the human confirms the summary. Commits, pushes, opens the PR via gh,
// and comments the PR link on the Jira ticket. No AI here.
import fs from 'node:fs';
import { readState, updateState } from '../state.mjs';
import { readConfig } from '../config.mjs';
import { artifactPath } from '../paths.mjs';
import { extractPrTitle, stripPrTitleLine } from '../prompts.mjs';
import { currentBranch, commit, pushBranch, createPullRequest, defaultBranch } from '../adapters/git/github.mjs';
import { postComment } from '../adapters/ticket/jira.mjs';
import { ok, info, step, warn } from '../ui.mjs';

export async function pr({ flags }) {
  const config = readConfig();
  const state = readState();

  const fromFile = flags.from || artifactPath('summary.md');
  if (!fs.existsSync(fromFile)) {
    throw new Error(`summary file not found: ${fromFile}. Write the PR description there first (or pass --from <file>).`);
  }
  const raw = fs.readFileSync(fromFile, 'utf8');
  const ticketKey = state?.ticket || flags.ticket || '';
  const title = flags.title || extractPrTitle(raw) || (ticketKey ? `${ticketKey}: update` : 'update');
  const body = stripPrTitleLine(raw);

  step('Committing pending changes...');
  commit(title.slice(0, 72));

  const branch = currentBranch();
  step(`Pushing ${branch}...`);
  pushBranch(branch);

  step(`Creating PR against ${defaultBranch()}...`);
  const { url } = createPullRequest({ title, body });
  ok(`PR opened: ${url}`);

  if (ticketKey && !flags.noComment) {
    step(`Commenting PR link on ${ticketKey}...`);
    try {
      await postComment(config, ticketKey, `PR opened: ${url}`);
      ok(`Comment posted to ${ticketKey}`);
    } catch (e) {
      warn(`Failed to comment on ticket: ${e.message}`);
      info(`Add manually on ${ticketKey}: PR opened: ${url}`);
    }
  }

  if (state) updateState({ phase: 'done', prUrl: url });
  info(`\nPR: ${url}`);
}
