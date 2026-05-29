import { requireState } from '../state.mjs';
import { plan } from './plan.mjs';
import { approve } from './approve.mjs';
import { code } from './code.mjs';
import { verify } from './verify.mjs';
import { summary } from './summary.mjs';
import { ship } from './ship.mjs';
import { info } from '../ui.mjs';

export async function next(ctx) {
  const s = requireState();
  switch (s.phase) {
    case 'plan':            return plan(ctx);
    case 'approve-plan':    return approve(ctx);
    case 'code':            return code(ctx);
    case 'verify':          return verify(ctx);
    case 'summary':         return summary(ctx);
    case 'approve-summary': return approve(ctx);
    case 'ship':            return ship(ctx);
    case 'done':            info('Already done.'); return;
    default: throw new Error(`unknown phase '${s.phase}'`);
  }
}
