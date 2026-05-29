import fs from 'node:fs';
import { artifactPath } from '../paths.mjs';
import { loadPrompt } from '../prompts.mjs';
import { updateState } from '../state.mjs';
import { getAdapter } from '../adapters/ai/index.mjs';
import { invokeWithAudit } from '../audit.mjs';
import { runCapture, info, ok, warn, step, rule } from '../ui.mjs';

export async function runVerify({ state, config }) {
  const cmds = config.verify?.commands || [];
  if (!cmds.length) {
    warn('verify.commands is empty in .agentflow/config.yaml — nothing to run.');
    info("Edit the file and add e.g. ['npm run lint', 'npm test'] then re-run 'agentflow verify'.");
    return { ok: false, skipped: true };
  }

  const adapter = getAdapter(state.aiTool);
  adapter.check();

  const maxRounds = Number(config.max_repair_rounds) || 3;

  for (let round = state.repairLoop.round; round <= maxRounds; round++) {
    rule(`verify pass (after ${round} repair${round === 1 ? '' : 's'})`);
    const result = runAllCommands(cmds);
    if (result.ok) {
      ok('All verification commands passed.');
      updateState({ repairLoop: { round } });
      return { ok: true, round };
    }

    fs.writeFileSync(artifactPath('verify-output.log'), result.log);

    if (round >= maxRounds) {
      warn(`Verification still failing after ${maxRounds} repair attempts. Human intervention required.`);
      return { ok: false, round, exhausted: true };
    }

    step(`Verification failed. Triggering repair round ${round + 1}/${maxRounds}.`);
    const prompt = loadPrompt('repair', {
      PLAN_FILE: artifactPath('plan.md'),
      CODER_LOG_FILE: artifactPath('coder-log.md'),
      VERIFY_OUTPUT_FILE: artifactPath('verify-output.log'),
      ROUND: String(round + 1),
      MAX_ROUNDS: String(maxRounds),
      TICKET_KEY: state.ticket,
      OUTPUT_FILE: artifactPath(`repair-r${round + 1}.md`),
    });
    fs.writeFileSync(artifactPath(`prompt.repair-r${round + 1}.md`), prompt);
    await invokeWithAudit(adapter, { prompt, label: `repair-r${round + 1}`, role: 'repair' }, { state, phase: 'verify' });
    updateState({ repairLoop: { round: round + 1 } });
  }
  return { ok: false, exhausted: true };
}

function runAllCommands(cmds) {
  let log = '';
  for (const cmd of cmds) {
    info(`$ ${cmd}`);
    const r = runCapture('sh', ['-c', cmd]);
    log += `\n$ ${cmd}\n${r.stdout}\n${r.stderr}\n(exit ${r.code})\n`;
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    if (r.code !== 0) {
      return { ok: false, log, failedCmd: cmd };
    }
  }
  return { ok: true, log };
}
