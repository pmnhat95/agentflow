import fs from 'node:fs';
import { requireState, updateState } from '../state.mjs';
import { readConfig } from '../config.mjs';
import { artifactPath } from '../paths.mjs';
import { extractPrTitle, stripPrTitleLine } from '../prompts.mjs';
import { currentBranch, commit, pushBranch, createPullRequest, defaultBranch } from '../adapters/git/github.mjs';
import { postComment, fetchTicket } from '../adapters/ticket/jira.mjs';
import { ok, info, step, warn, confirm } from '../ui.mjs';

export async function ship({ flags }) {
  const state = requireState();
  const config = readConfig();

  if (state.phase !== 'ship') warn(`State phase is '${state.phase}', expected 'ship'. Continuing.`);

  const summaryPath = artifactPath('summary.md');
  if (!fs.existsSync(summaryPath)) throw new Error('summary.md missing — run `agentflow summary` first.');
  const raw = fs.readFileSync(summaryPath, 'utf8');
  const title = extractPrTitle(raw) || `${state.ticket}: ${state.branch.replace(/^.*?\//, '')}`;
  const body = stripPrTitleLine(raw);

  step('Committing any uncommitted changes...');
  commit(`${state.ticket}: ${title.replace(`${state.ticket}: `, '').slice(0, 60)}`);

  const branch = currentBranch();
  step(`Pushing ${branch}...`);
  pushBranch(branch);

  if (!flags.yes) {
    const yes = await confirm(`Open PR '${title}' against ${defaultBranch()}?`, true);
    if (!yes) { warn('Aborted before PR creation.'); return; }
  }

  step('Creating PR via gh...');
  const { url } = createPullRequest({ title, body });
  ok(`PR opened: ${url}`);

  step('Commenting PR link on Jira ticket...');
  try {
    await postComment(config, state.ticket, `PR opened: ${url}`);
    ok(`Comment posted to ${state.ticket}`);
  } catch (e) {
    warn(`Failed to comment on ticket: ${e.message}`);
    info(`Add manually: PR opened: ${url}`);
  }

  updateState({ phase: 'done', prUrl: url });
  info('\nDone. Phase → done.');
}
