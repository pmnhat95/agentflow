import fs from 'node:fs';
import path from 'node:path';
import { artifactPath } from '../paths.mjs';
import { loadPrompt, extractQuestions, extractCriticVerdict } from '../prompts.mjs';
import { updateState } from '../state.mjs';
import { getAdapter } from '../adapters/ai/index.mjs';
import { invokeWithAudit } from '../audit.mjs';
import { matchLessons, lessonsBlock, buildContextForMatching } from '../lessons.mjs';
import { readCodemap } from '../codemap.mjs';
import { info, ok, warn, step, prompt as ask, rule } from '../ui.mjs';

const FILES = {
  ticket: 'ticket.md',
  research: 'research.md',
  plan: 'plan.md',
  qa: 'qa.md',
  qaAnswers: 'qa-answers.md',
};

function critiqueFile(round) { return path.join('critique', `r${round}.md`); }

async function runRole(adapter, { promptName, vars, label, allowedTools, state, phase, role }) {
  step(`Running ${label}...`);
  const filledPrompt = loadPrompt(promptName, vars);
  const promptFile = artifactPath(`prompt.${label}.md`);
  fs.writeFileSync(promptFile, filledPrompt);
  return await invokeWithAudit(adapter, { prompt: filledPrompt, label, allowedTools, role }, { state, phase });
}

function buildLessonAndCodemapVars() {
  const ctx = buildContextForMatching();
  const lessons = matchLessons(ctx, { limit: 5 });
  return {
    LESSONS: lessonsBlock(lessons),
    CODEMAP: readCodemap() || '_(no codemap yet — run `agentflow prime`)_',
  };
}

function read(name) {
  const p = artifactPath(name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function write(name, content) {
  const p = artifactPath(name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

export async function runPlannerLoop({ state, config }) {
  const adapter = getAdapter(state.aiTool);
  adapter.check();

  const maxRounds = Number(config.max_loop_rounds) || 3;
  fs.mkdirSync(artifactPath('critique'), { recursive: true });

  for (let round = state.planLoop.round + 1; round <= maxRounds; round++) {
    rule(`loop round ${round}/${maxRounds}`);
    updateState({ planLoop: { round, lastVerdict: null } });

    const ticketFile = artifactPath(FILES.ticket);
    const researchFile = artifactPath(FILES.research);
    const planFile = artifactPath(FILES.plan);
    const lastCritiqueFile = round > 1 ? artifactPath(critiqueFile(round - 1)) : '';
    const lcVars = buildLessonAndCodemapVars();

    // --- Researcher ---
    const researcherOut = await runRole(adapter, {
      promptName: 'researcher',
      label: `researcher-r${round}`,
      role: 'researcher',
      state, phase: 'plan',
      vars: {
        TICKET_FILE: ticketFile,
        RESEARCH_FILE: researchFile,
        CRITIQUE_FILE: lastCritiqueFile,
        TICKET_KEY: state.ticket,
        OUTPUT_FILE: researchFile,
        ...lcVars,
      },
    });
    if (!adapter.headless) {
      // manual adapter already saved output to outputFile; mirror to research.md
      write(FILES.research, researcherOut);
    } else if (!fs.existsSync(researchFile) || fs.readFileSync(researchFile, 'utf8').trim() === '') {
      // headless adapter didn't write directly; persist the captured stdout
      write(FILES.research, researcherOut);
    }

    const rQuestions = extractQuestions(read(FILES.research));
    if (rQuestions.length) {
      const ans = await qaPause('Researcher', round, rQuestions, state);
      // Append answers so the next iteration can use them
      fs.appendFileSync(researchFile, `\n\n## Human answers (round ${round})\n${ans}\n`);
    }

    // --- Planner ---
    const plannerOut = await runRole(adapter, {
      promptName: 'planner',
      label: `planner-r${round}`,
      role: 'planner',
      state, phase: 'plan',
      vars: {
        TICKET_FILE: ticketFile,
        RESEARCH_FILE: researchFile,
        CRITIQUE_FILE: lastCritiqueFile,
        PLAN_FILE: planFile,
        TICKET_KEY: state.ticket,
        OUTPUT_FILE: planFile,
        ...lcVars,
      },
    });
    if (!adapter.headless || !fs.existsSync(planFile) || read(FILES.plan).trim() === '') {
      write(FILES.plan, plannerOut);
    }

    const pQuestions = extractQuestions(read(FILES.plan));
    if (pQuestions.length) {
      const ans = await qaPause('Planner', round, pQuestions, state);
      fs.appendFileSync(researchFile, `\n\n## Human answers from Planner Q&A (round ${round})\n${ans}\n`);
      // Re-run Planner with the new answers
      const re = await runRole(adapter, {
        promptName: 'planner',
        label: `planner-r${round}-postqa`,
        role: 'planner',
        state, phase: 'plan',
        vars: {
          TICKET_FILE: ticketFile,
          RESEARCH_FILE: researchFile,
          CRITIQUE_FILE: lastCritiqueFile,
          PLAN_FILE: planFile,
          TICKET_KEY: state.ticket,
          OUTPUT_FILE: planFile,
          ...lcVars,
        },
      });
      if (!adapter.headless || read(FILES.plan).trim() === '') write(FILES.plan, re);
    }

    // --- Critic ---
    const critOut = await runRole(adapter, {
      promptName: 'critic',
      label: `critic-r${round}`,
      role: 'critic',
      state, phase: 'plan',
      allowedTools: ['Read', 'Glob', 'Grep', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(grep:*)', 'Bash(rg:*)'],
      vars: {
        TICKET_FILE: ticketFile,
        RESEARCH_FILE: researchFile,
        PLAN_FILE: planFile,
        ROUND: String(round),
        MAX_ROUNDS: String(maxRounds),
        TICKET_KEY: state.ticket,
        OUTPUT_FILE: artifactPath(critiqueFile(round)),
      },
    });
    const critPath = artifactPath(critiqueFile(round));
    if (!adapter.headless || !fs.existsSync(critPath) || fs.readFileSync(critPath, 'utf8').trim() === '') {
      write(critiqueFile(round), critOut);
    }

    const verdict = extractCriticVerdict(fs.readFileSync(critPath, 'utf8')) || 'FAIL';
    updateState({ planLoop: { round, lastVerdict: verdict } });
    info(`Round ${round} verdict: ${verdict}`);

    if (verdict === 'PASS') {
      ok(`Plan accepted by Critic after ${round} round(s).`);
      return { verdict, round };
    }
  }

  warn(`Reached max rounds (${maxRounds}) without Critic PASS. Human review required.`);
  return { verdict: 'FAIL', round: maxRounds, exhausted: true };
}

async function qaPause(role, round, questions, state) {
  const qaFile = artifactPath(FILES.qa);
  const ansFile = artifactPath(FILES.qaAnswers);
  const body = [
    `# Q&A — ${state.ticket} (round ${round})`,
    ``,
    `Asked by: ${role}`,
    ``,
    ...questions.map((q, i) => `${i + 1}. ${q.replace(/^[-*\d.]\s*/, '')}`),
    ``,
  ].join('\n');
  fs.writeFileSync(qaFile, body);
  fs.writeFileSync(ansFile, '');

  rule(`Q&A pause — ${role} (round ${round})`);
  info(`${role} needs human input. Questions written to ${qaFile}.`);
  info(`Answer them in ${ansFile} (one block per question, in order).`);
  await ask('Press Enter when answers are saved');

  const content = fs.readFileSync(ansFile, 'utf8').trim();
  if (!content) {
    warn('No answers provided. Continuing — the loop may stall again.');
    return '(no answers provided)';
  }
  return content;
}
