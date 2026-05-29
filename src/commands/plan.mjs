import { requireState, updateState } from '../state.mjs';
import { readConfig } from '../config.mjs';
import { runPlannerLoop } from '../loop/planner-loop.mjs';
import { ok, info, warn, rule } from '../ui.mjs';

export async function plan({ flags }) {
  const state = requireState();
  const config = readConfig();
  if (flags.maxRounds) config.max_loop_rounds = Number(flags.maxRounds);
  if (flags.ai) state.aiTool = flags.ai;

  if (state.phase !== 'plan' && state.phase !== 'approve-plan') {
    warn(`State phase is '${state.phase}', expected 'plan'. Continuing anyway.`);
  }

  const result = await runPlannerLoop({ state, config });

  if (result.verdict === 'PASS') {
    updateState({ phase: 'approve-plan' });
    rule('plan ready');
    info('Review .agentflow/plan.md, then run: agentflow approve');
  } else {
    updateState({ phase: 'approve-plan' }); // still gate to human even if FAIL
    rule('plan loop exhausted');
    info('Critic did not PASS. Review .agentflow/plan.md and the latest critique,');
    info('then either run `agentflow approve` (override) or `agentflow plan` again.');
  }
}
