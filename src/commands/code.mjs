import fs from 'node:fs';
import { requireState, updateState } from '../state.mjs';
import { readConfig } from '../config.mjs';
import { artifactPath } from '../paths.mjs';
import { getAdapter } from '../adapters/ai/index.mjs';
import { loadPrompt } from '../prompts.mjs';
import { invokeWithAudit } from '../audit.mjs';
import { matchLessons, lessonsBlock, buildContextForMatching } from '../lessons.mjs';
import { readCodemap } from '../codemap.mjs';
import { info, ok, step, warn, rule } from '../ui.mjs';

export async function code({ flags }) {
  const state = requireState();
  const config = readConfig();
  const mode = flags.codeFirst ? 'code-first' : (config.tdd === false ? 'code-first' : 'tdd');
  const aiTool = flags.ai || state.aiTool;

  if (state.phase !== 'code') warn(`State phase is '${state.phase}', expected 'code'. Continuing anyway.`);

  const adapter = getAdapter(aiTool);
  adapter.check();

  step(`Running Coder (${mode})...`);
  const lessons = matchLessons(buildContextForMatching(), { limit: 5 });
  const prompt = loadPrompt('coder', {
    PLAN_FILE: artifactPath('plan.md'),
    TICKET_FILE: artifactPath('ticket.md'),
    RESEARCH_FILE: artifactPath('research.md'),
    MODE: mode,
    NOTES_FILE: artifactPath('coder-notes.md'),
    TICKET_KEY: state.ticket,
    OUTPUT_FILE: artifactPath('coder-log.md'),
    LESSONS: lessonsBlock(lessons),
    CODEMAP: readCodemap() || '_(no codemap yet — run `agentflow prime`)_',
  });
  fs.writeFileSync(artifactPath('prompt.coder.md'), prompt);
  const log = await invokeWithAudit(adapter, { prompt, label: 'coder', role: 'coder' }, { state, phase: 'code' });
  if (!adapter.headless || !fs.existsSync(artifactPath('coder-log.md'))) {
    fs.writeFileSync(artifactPath('coder-log.md'), log);
  }

  const notesPath = artifactPath('coder-notes.md');
  if (fs.existsSync(notesPath) && fs.readFileSync(notesPath, 'utf8').trim()) {
    rule('Coder reported plan deviation');
    info(`See ${notesPath}. Run 'agentflow plan' to revise the plan, or edit and re-run code.`);
    updateState({ phase: 'plan' });
    return;
  }

  ok('Coder finished.');
  updateState({ phase: 'verify' });
  info('Next: agentflow verify');
}
