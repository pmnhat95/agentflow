import { requireState, updateState } from '../state.mjs';
import { readConfig } from '../config.mjs';
import { runVerify } from '../loop/repair-loop.mjs';
import { ok, info, warn } from '../ui.mjs';

export async function verify({ flags }) {
  const state = requireState();
  const config = readConfig();
  if (flags.maxRounds) config.max_repair_rounds = Number(flags.maxRounds);

  const result = await runVerify({ state, config });
  if (result.ok) {
    updateState({ phase: 'summary' });
    info('Next: agentflow summary');
  } else if (result.skipped) {
    info('Skipped. Configure verify.commands then re-run.');
  } else {
    warn('Verification not green. Fix manually, then run `agentflow verify` again or move on with `agentflow summary` at your own risk.');
  }
}
