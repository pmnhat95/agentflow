import fs from 'node:fs';
import { requireState, updateState } from '../state.mjs';
import { artifactPath } from '../paths.mjs';
import { approvalGate, ok, info, warn, rule } from '../ui.mjs';

const GATES = {
  'approve-plan': {
    artifact: 'plan.md',
    label: 'plan',
    nextPhase: 'code',
    onLoop: 'plan', // re-run planner loop
  },
  'approve-summary': {
    artifact: 'summary.md',
    label: 'summary',
    nextPhase: 'ship',
    onLoop: 'summary',
  },
};

export async function approve({ flags }) {
  const state = requireState();
  const gate = GATES[state.phase];
  if (!gate) throw new Error(`nothing to approve in phase '${state.phase}'`);
  const artifact = artifactPath(gate.artifact);
  if (!fs.existsSync(artifact)) throw new Error(`expected artifact missing: ${artifact}`);

  if (flags.yes) {
    updateState({ phase: gate.nextPhase });
    ok(`Auto-approved (--yes). Phase → ${gate.nextPhase}`);
    return;
  }

  const result = await approvalGate({ artifactPath: artifact, label: gate.label });
  if (result.action === 'approve') {
    updateState({ phase: gate.nextPhase });
    ok(`Approved. Phase → ${gate.nextPhase}`);
  } else if (result.action === 'loop') {
    if (result.reason) fs.appendFileSync(artifact, `\n\n<!-- human hint for next loop: ${result.reason} -->\n`);
    updateState({ phase: gate.onLoop });
    info(`Looping back to '${gate.onLoop}'. Run: agentflow ${gate.onLoop}`);
  } else {
    if (result.reason) fs.appendFileSync(artifact, `\n\n<!-- rejection reason: ${result.reason} -->\n`);
    warn(`Rejected. State unchanged. Edit ${artifact} or run 'agentflow ${gate.onLoop}' to retry.`);
  }
}
