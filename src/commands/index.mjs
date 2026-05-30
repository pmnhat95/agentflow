import { init } from './init.mjs';
import { plan } from './plan.mjs';
import { approve } from './approve.mjs';
import { code } from './code.mjs';
import { verify } from './verify.mjs';
import { summary } from './summary.mjs';
import { ship } from './ship.mjs';
import { status } from './status.mjs';
import { next } from './next.mjs';
import { prime } from './prime.mjs';
import { retro } from './retro.mjs';
import { cost } from './cost.mjs';
import { install } from './install.mjs';
import { ticket } from './ticket.mjs';
import { context } from './context.mjs';
import { pr } from './pr.mjs';
import { lessonSave } from './lesson-save.mjs';

export const commands = {
  // In-editor (slash-command) flow: install once, then drive from your AI tool.
  install,
  // Deterministic helpers the in-editor agent calls:
  ticket, context, pr, 'lesson-save': lessonSave,
  // Headless / CLI pipeline (still supported, e.g. for CI or `ai_tool: claude`):
  init, plan, approve, code, verify, summary, ship, next, prime, retro,
  // Utilities:
  status, cost,
};
