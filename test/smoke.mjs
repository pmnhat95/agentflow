// Smoke test: parse CLI, dispatch help, exercise state/config without network.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, '..', 'bin', 'agentflow.mjs');

function runCli(args, opts = {}) {
  return execFileSync('node', [BIN, ...args], { encoding: 'utf8', ...opts });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-smoke-'));
process.chdir(tmp);
execFileSync('git', ['init', '-q', '-b', 'main']);
fs.writeFileSync('README.md', '# tmp repo\n');
execFileSync('git', ['add', '.']);
execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'init']);

// 1. --help works
const help = runCli(['--help']);
assert.match(help, /agentflow — ticket-driven/);
console.log('ok  --help renders');

// 2. status with no state
const noState = runCli(['status']);
assert.match(noState, /no state/);
console.log('ok  status reports no-state cleanly');

// 3. unknown command errors
try {
  runCli(['zzznope']);
  assert.fail('expected throw');
} catch (e) {
  assert.match(String(e.stderr || e.stdout || e.message), /unknown command/);
  console.log('ok  unknown command errors');
}

// 4. Config defaults: instantiate then read back
const { ensureConfig, readConfig } = await import(path.resolve(__dirname, '..', 'src', 'config.mjs'));
ensureConfig();
const cfg = readConfig();
assert.strictEqual(cfg.ai_tool, 'claude');
assert.strictEqual(cfg.max_loop_rounds, 3);
console.log('ok  config defaults wired');

// 5. State round-trip
const { writeState, readState, nextPhase } = await import(path.resolve(__dirname, '..', 'src', 'state.mjs'));
writeState({ ticket: 'TEST-1', branch: 'feature/test-1', phase: 'plan', aiTool: 'claude' });
const s = readState();
assert.strictEqual(s.ticket, 'TEST-1');
assert.strictEqual(nextPhase('plan'), 'approve-plan');
assert.strictEqual(nextPhase('done'), null);
console.log('ok  state round-trip');

// 6. Prompt loader substitutes vars and Critic verdict parser works
const { loadPrompt, extractCriticVerdict, extractQuestions } = await import(path.resolve(__dirname, '..', 'src', 'prompts.mjs'));
const filled = loadPrompt('researcher', { TICKET_KEY: 'TEST-1', OUTPUT_FILE: 'x.md' });
assert.match(filled, /TEST-1/);
assert.ok(!/\{\{TICKET_KEY\}\}/.test(filled));
console.log('ok  prompt template substitution');

assert.strictEqual(extractCriticVerdict('## Verdict\n\nPASS\n'), 'PASS');
assert.strictEqual(extractCriticVerdict('## Verdict\n\n<FAIL>\n'), 'FAIL');
assert.strictEqual(extractCriticVerdict('## Verdict\n\nblah'), null);
console.log('ok  critic verdict parser');

const qs = extractQuestions(`## Open questions\n- Where does auth live?\n- What about logs?\n## Other`);
assert.deepStrictEqual(qs, ['- Where does auth live?', '- What about logs?']);
console.log('ok  open-questions extractor');

// 7. Codemap heuristics: detect node/jest from a synthetic package.json
fs.writeFileSync('package.json', JSON.stringify({
  name: 'tmp', version: '0.0.0',
  scripts: { lint: 'eslint .', test: 'jest' },
  devDependencies: { jest: '^29.0.0', eslint: '^8.0.0' },
}));
fs.writeFileSync('tsconfig.json', '{}');
const { detectLanguages, detectTestFramework, detectLinters, buildHeuristicCodemap, formatCodemap } =
  await import(path.resolve(__dirname, '..', 'src', 'codemap.mjs'));
const langs = detectLanguages();
assert.ok(langs.includes('typescript'), `expected typescript, got ${langs}`);
assert.strictEqual(detectTestFramework(), 'jest');
assert.ok(detectLinters().includes('eslint'));
const cmData = buildHeuristicCodemap();
const cmMd = formatCodemap(cmData, { overview: 'A tiny tmp repo for testing.' });
assert.match(cmMd, /Codemap/);
assert.match(cmMd, /jest/);
console.log('ok  codemap heuristics + formatting');

// 8. Lessons: save → list → match by triggers
const { saveLesson, listLessons, matchLessons, lessonsBlock } =
  await import(path.resolve(__dirname, '..', 'src', 'lessons.mjs'));
saveLesson({
  name: 'use-fastify-error-handlers',
  topic: 'error-handling',
  triggers: ['fastify', 'error', 'middleware'],
  source: 'review-feedback',
  ticket: 'TEST-1',
  body: 'Wrap async route handlers with the project errorBoundary helper.',
});
saveLesson({
  name: 'snake-case-db-columns',
  topic: 'naming',
  triggers: ['database', 'column', 'migration'],
  body: 'DB columns use snake_case; the ORM mapper translates to camelCase in JS.',
});
const all = listLessons();
assert.strictEqual(all.length, 2);
const matched = matchLessons('We are adding a new fastify route that needs error handling', { limit: 3 });
assert.ok(matched.length >= 1, 'expected at least one match for fastify ticket');
assert.strictEqual(matched[0].name, 'use-fastify-error-handlers');
const block = lessonsBlock(matched);
assert.match(block, /fastify/);
console.log('ok  lessons save + match');

// 9. Retro lesson parser
const { parseLessons } = await import(path.resolve(__dirname, '..', 'src', 'commands', 'retro.mjs'));
const sample = `Intro line\n---LESSON---\nname: avoid-double-logging\ntopic: logging\ntriggers: [logger, double]\nsource: review-feedback\ntitle: do not log+rethrow\nbody: |\n  Pick one — log OR rethrow, never both.\n  The repo's logger middleware logs uncaught errors already.\n---LESSON---\nname: prefer-vitest\ntopic: testing\ntriggers: [vitest, jest]\nsource: plan-deviation\ntitle: use vitest\nbody: |\n  This repo migrated to vitest in 2025.\n`;
const parsed = parseLessons(sample);
assert.strictEqual(parsed.length, 2);
assert.strictEqual(parsed[0].name, 'avoid-double-logging');
assert.deepStrictEqual(parsed[0].triggers, ['logger', 'double']);
assert.match(parsed[0].body, /Pick one/);
assert.strictEqual(parseLessons('NO_LESSONS\n').length, 0);
console.log('ok  retro lesson parser');

// 10. Audit wrapper writes prompt+output to a timestamped audit dir
const { invokeWithAudit, auditDir } = await import(path.resolve(__dirname, '..', 'src', 'audit.mjs'));
let capturedModel = null;
const fakeAdapter = {
  id: 'fake', headless: true,
  check() {},
  async invoke({ prompt, label, model }) { capturedModel = model; return `FAKE_OUT(${label}):${prompt.length}`; },
};
const fakeState = { ticket: 'TEST-1', createdAt: new Date().toISOString() };
const out = await invokeWithAudit(fakeAdapter, { prompt: 'hello', label: 'researcher-r1', role: 'researcher' }, { state: fakeState, phase: 'plan' });
assert.match(out, /FAKE_OUT/);
const dir = auditDir(fakeState);
const files = fs.readdirSync(dir);
assert.ok(files.some((f) => f.endsWith('-researcher-r1-prompt.md')), `expected prompt file, got ${files}`);
assert.ok(files.some((f) => f.endsWith('-researcher-r1-output.md')));
assert.ok(files.some((f) => f.endsWith('-researcher-r1-meta.json')));
console.log('ok  audit wrapper persists prompt + output + meta');

// 11. Model tiering: role → tier → model id; adapter receives `model`
const { resolveModel, estimateCost, priceFor } = await import(path.resolve(__dirname, '..', 'src', 'models.mjs'));
assert.strictEqual(resolveModel('researcher', {}), 'haiku', 'researcher default tier → haiku');
assert.strictEqual(resolveModel('planner', {}), 'sonnet', 'planner default tier → sonnet');
assert.strictEqual(resolveModel('coder', {}), 'sonnet');
assert.strictEqual(resolveModel('critic', {}), 'haiku');
// Override a role to a different tier
assert.strictEqual(resolveModel('critic', { models: { roles: { critic: 'strong' } } }), 'sonnet');
// Override tier mapping itself
assert.strictEqual(resolveModel('researcher', { models: { tiers: { cheap: 'opus' } } }), 'opus');
// Literal model id escape hatch
assert.strictEqual(resolveModel('coder', { models: { roles: { coder: 'claude-opus-4-7' } } }), 'claude-opus-4-7');
console.log('ok  resolveModel: defaults + tier override + role override + escape hatch');

assert.strictEqual(capturedModel, 'haiku', `expected adapter to receive 'haiku' for researcher role, got ${capturedModel}`);
console.log('ok  invokeWithAudit threads resolved model to adapter');

// 12. Cost estimation: known model returns USD; unknown model flagged
const sonnetCost = estimateCost({ inputText: 'a'.repeat(7000), outputText: 'b'.repeat(3500), model: 'sonnet' });
assert.ok(sonnetCost.inTokens > 0 && sonnetCost.outTokens > 0);
assert.ok(sonnetCost.totalUsd > 0);
assert.strictEqual(sonnetCost.unknownModel, false);

const unkCost = estimateCost({ inputText: 'x', outputText: 'y', model: 'nope-9001' });
assert.strictEqual(unkCost.unknownModel, true);
assert.strictEqual(unkCost.totalUsd, 0);

// Haiku should be strictly cheaper than Sonnet for the same payload
const haikuCost = estimateCost({ inputText: 'a'.repeat(7000), outputText: 'b'.repeat(3500), model: 'haiku' });
assert.ok(haikuCost.totalUsd < sonnetCost.totalUsd, `expected haiku < sonnet, got ${haikuCost.totalUsd} vs ${sonnetCost.totalUsd}`);
console.log('ok  cost estimation: known/unknown models + tier ordering');

// 13. Slash command rendering: one body, three tool formats
const { COMMANDS, renderClaude, renderCursor, renderCopilot, TARGETS } =
  await import(path.resolve(__dirname, '..', 'src', 'integrations', 'slash.mjs'));
assert.ok(COMMANDS.length >= 6, `expected >=6 slash commands, got ${COMMANDS.length}`);
const planCmd = COMMANDS.find((c) => c.name === 'agentflow-plan');
assert.ok(planCmd, 'agentflow-plan command must exist');

// Orchestrator: /agentflow-start auto-chains with exactly two hard gates
const startCmd = COMMANDS.find((c) => c.name === 'agentflow-start');
assert.ok(startCmd, 'agentflow-start orchestrator must exist');
assert.match(startCmd.body, /GATE 1/, 'orchestrator defines gate 1');
assert.match(startCmd.body, /GATE 2/, 'orchestrator defines gate 2');
assert.match(startCmd.body, /Waiting for approval/, 'orchestrator has explicit stop text');
assert.match(startCmd.body, /agentflow pr --from/, 'orchestrator creates PR after gate 2');
assert.match(startCmd.body, /agentflow status/, 'orchestrator resumes from state if interrupted');
assert.ok(COMMANDS.find((c) => c.name === 'agentflow-continue'), 'agentflow-continue must exist');
console.log('ok  orchestrator: auto-chain with two hard approval gates + resume');

const claudeOut = renderClaude(planCmd);
assert.match(claudeOut, /^---\n/, 'claude render has frontmatter');
assert.match(claudeOut, /allowed-tools:/);
assert.match(claudeOut, /\$ARGUMENTS/, 'claude render substitutes $ARGUMENTS for arg commands');

const cursorOut = renderCursor(planCmd);
assert.match(cursorOut, /# agentflow-plan/);
assert.ok(!cursorOut.includes('allowed-tools'), 'cursor render is plain markdown');

const copilotOut = renderCopilot(planCmd);
assert.match(copilotOut, /mode: agent/, 'copilot render uses agent mode');
console.log('ok  slash command rendering: claude/cursor/copilot formats');

// 14. install writes slash files for all three tools
runCli(['install', 'all']);
for (const [tool, t] of Object.entries(TARGETS)) {
  const f = path.join(tmp, t.dir, `agentflow-plan${t.ext}`);
  assert.ok(fs.existsSync(f), `expected ${tool} command file at ${f}`);
}
// Copilot uses the .prompt.md double extension
assert.ok(fs.existsSync(path.join(tmp, '.github', 'prompts', 'agentflow-ship.prompt.md')));
console.log('ok  install writes slash commands for claude/cursor/copilot');

// 15. lesson-save CLI persists a lesson the in-editor agent extracted
fs.writeFileSync(path.join(tmp, 'lesson-body.txt'), 'Prefer the shared retry helper for outbound HTTP.');
runCli(['lesson-save', '--name', 'shared-retry-helper', '--topic', 'networking',
        '--triggers', 'retry,http,webhook', '--source', 'review-feedback',
        '--body-file', path.join(tmp, 'lesson-body.txt')]);
const lessonFile = path.join(tmp, '.agentflow', 'lessons', 'shared-retry-helper.md');
assert.ok(fs.existsSync(lessonFile), 'lesson file written');
const lessonText = fs.readFileSync(lessonFile, 'utf8');
assert.match(lessonText, /triggers: \[retry, http, webhook\]/);
assert.match(lessonText, /retry helper/);
console.log('ok  lesson-save persists a lesson via CLI');

// 16. .env loader fills missing vars but never overrides a real export
const { loadEnvFiles } = await import(path.resolve(__dirname, '..', 'src', 'env.mjs'));
fs.mkdirSync(path.join(tmp, '.agentflow'), { recursive: true });
fs.writeFileSync(path.join(tmp, '.agentflow', '.env'),
  '# creds\nJIRA_EMAIL=from.file@opswat.com\nexport JIRA_TOKEN="tok-123"\nJIRA_BASE_URL=https://x.atlassian.net\n');
delete process.env.JIRA_EMAIL;
delete process.env.JIRA_TOKEN;
process.env.JIRA_BASE_URL = 'https://real-export.atlassian.net'; // real export must win
loadEnvFiles(tmp);
assert.strictEqual(process.env.JIRA_EMAIL, 'from.file@opswat.com', 'fills missing var from .env');
assert.strictEqual(process.env.JIRA_TOKEN, 'tok-123', 'strips quotes + handles export prefix');
assert.strictEqual(process.env.JIRA_BASE_URL, 'https://real-export.atlassian.net', 'real export not overridden');
console.log('ok  .env loader fills missing creds, never overrides real exports');

console.log('\nall smoke checks passed');
