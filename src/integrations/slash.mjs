// Slash-command definitions shared across Claude Code, Cursor, and Copilot.
// The in-editor AI agent is the orchestrator; the `agentflow` CLI is called by
// the agent (via its terminal tool) only for deterministic plumbing
// (Jira fetch, branch, PR, lesson persistence).
//
// Human approval gates are implicit: each phase ends by stopping and waiting
// for the human to run the next slash command. Typing /agentflow-code IS the
// approval of the plan.

const PLAN = `You are running the **agentflow PLAN phase**. Produce a grounded, reviewable implementation plan. Do **not** write production code in this phase.

## Steps
1. **Ticket.** If I gave a ticket ID with this command, run in the terminal: \`agentflow ticket <ID>\` (fetches the Jira ticket, creates the branch, writes \`.agentflow/ticket.md\`). If no ID, read the existing \`.agentflow/ticket.md\`.
2. **Shared context.** Run \`agentflow context\` and read its output — the repo codemap and lessons learned from past PRs. Honor those conventions and lessons.
3. **Research.** Explore the codebase with your file tools. For every file, function, or type you intend to reference, actually open it and confirm it exists. Never guess paths.
4. **Plan.** Write \`.agentflow/plan.md\` with exactly these sections:
   - **Scope** — what this change does and does not do.
   - **Acceptance criteria coverage** — a table mapping each AC → the code change + test that covers it.
   - **Files to modify** — each path, what changes, why.
   - **New files** — each path, purpose, why it can't live in an existing file.
   - **Test plan (TDD)** — each test file + test name + what it asserts + which AC it covers.
   - **Risks & edge cases.**
   - **Out of scope** — explicitly not touched.
   - **Implementation order** — numbered steps for the code phase.
5. **Self-critique (grounded).** Re-open every file your plan references and verify the claim is real: the function exists, the signature matches your assumption, the test framework is the one the repo actually uses. Fix every gap. Repeat until the plan contains no unverified claim.
6. **Missing info.** If something genuinely cannot be inferred from the code or the ticket, **STOP and ask me** the specific question — do not invent an answer.
7. **Finish.** Print a 5-line summary and tell me to review \`.agentflow/plan.md\`. When I'm satisfied I will run \`/agentflow-code\` (that is my approval of the plan).`;

const CODE = `You are running the **agentflow CODE phase**. The plan at \`.agentflow/plan.md\` is approved and is your single source of truth.

## Steps
1. Read \`.agentflow/plan.md\` and \`.agentflow/ticket.md\`. Run \`agentflow context\` for repo conventions + lessons.
2. Follow the plan's **Implementation order**. Default to **TDD**: write the failing tests first, run them to confirm they fail for the right reason, then implement until green.
3. Stay **strictly inside** the file list in the plan. If you discover you must touch a file not in the plan, STOP, tell me what's missing, and suggest re-running \`/agentflow-plan\`.
4. Match the repo's existing style and the lessons from \`agentflow context\`. Do not add dependencies unless the plan calls for them. Do not write comments that merely restate code.
5. Run the project's tests as you go. When everything passes, summarize what changed (files + tests) and tell me to run \`/agentflow-verify\`.`;

const VERIFY = `You are running the **agentflow VERIFY phase**.

## Steps
1. Determine the verification commands: read \`.agentflow/config.yaml\` → \`verify.commands\`. If empty, infer the repo's lint / test / build commands and tell me what you ran.
2. Run them. If anything fails, diagnose the **root cause** and fix it — never skip a test, silence a lint rule, or hand-edit a lockfile to go green. Re-run until clean.
3. If the failure is **pre-existing breakage unrelated to this change**, stop and tell me rather than papering over it.
4. Report what passed and tell me to run \`/agentflow-ship\` when ready.`;

const SHIP = `You are running the **agentflow SHIP phase**.

## Steps
1. Read \`.agentflow/plan.md\` and the diff against the base branch (\`git diff\`).
2. Write a PR description to \`.agentflow/summary.md\`. If \`.github/pull_request_template.md\` exists, follow it; otherwise use: **What / Why / How / How tested / Breaking changes / Out of scope**. Make the very first line \`TITLE: <TICKET-ID>: <short imperative summary>\`. "How tested" must reference the real tests added.
3. **Show me the summary and ask me to confirm before creating the PR.**
4. After I confirm, run in the terminal: \`agentflow pr --from .agentflow/summary.md\` — this commits, pushes, opens the PR via \`gh\`, and comments the PR link on the Jira ticket.
5. Report the PR URL.`;

const START = `You are starting an **agentflow** flow for a Jira ticket.

## Steps
1. Take the ticket ID from my message. Run in the terminal: \`agentflow ticket <ID>\`.
2. Read \`.agentflow/ticket.md\` and give me a 3–5 line plain-language summary of what the ticket asks for, plus anything that looks ambiguous.
3. Tell me to run \`/agentflow-plan\` when I'm ready to plan.`;

const RETRO = `You are running the **agentflow RETRO phase** after the PR has merged.

## Steps
1. Gather: read \`.agentflow/plan.md\`, the **merged** diff, and the PR review comments (use \`gh pr view <PR> --json reviews,comments\` and \`gh pr diff <PR>\`).
2. Compare plan vs. what actually shipped + what reviewers pushed back on.
3. Extract only **generalizable** lessons — rules that will apply to *future* tickets in this repo, not one-off details. If there are none, say so and stop.
4. For each lesson, persist it by running:
   \`agentflow lesson-save --name <kebab-slug> --topic <topic> --triggers "kw1,kw2,kw3" --source review-feedback --body-file <tmpfile>\`
   (write the lesson body to a temp file first; triggers are words a future ticket about this area is likely to contain).
5. Remind me to commit \`.agentflow/lessons/\` so the team shares the knowledge.`;

export const COMMANDS = [
  { name: 'agentflow-start',  phase: 'start',  description: 'Start a ticket: fetch from Jira, create branch, summarize', body: START,  argHint: '<TICKET-ID>' },
  { name: 'agentflow-plan',   phase: 'plan',   description: 'Research + produce a grounded, reviewable implementation plan', body: PLAN, argHint: '[TICKET-ID]' },
  { name: 'agentflow-code',   phase: 'code',   description: 'Implement the approved plan (TDD)', body: CODE,  argHint: '' },
  { name: 'agentflow-verify', phase: 'verify', description: 'Run lint/test/build and fix failures at the root', body: VERIFY, argHint: '' },
  { name: 'agentflow-ship',   phase: 'ship',   description: 'Write PR description, confirm, open PR + comment Jira', body: SHIP, argHint: '' },
  { name: 'agentflow-retro',  phase: 'retro',  description: 'After merge: extract generalizable lessons', body: RETRO, argHint: '[PR]' },
];

// ---- Per-tool rendering -------------------------------------------------

// Claude Code: .claude/commands/<name>.md  with frontmatter; $ARGUMENTS supported.
export function renderClaude(cmd) {
  const fm = [
    '---',
    `description: ${cmd.description}`,
    'allowed-tools: Bash, Read, Grep, Glob, Edit, Write',
    cmd.argHint ? `argument-hint: ${cmd.argHint}` : null,
    '---',
    '',
  ].filter((l) => l !== null).join('\n');
  const argLine = cmd.argHint ? `\nTicket / argument from my message: $ARGUMENTS\n` : '';
  return fm + cmd.body + argLine + '\n';
}

// Cursor: .cursor/commands/<name>.md  — plain markdown; the text I type after
// the command is included in the chat, so no variable substitution needed.
export function renderCursor(cmd) {
  return `# ${cmd.name}\n\n> ${cmd.description}\n\n${cmd.body}\n`;
}

// Copilot: .github/prompts/<name>.prompt.md  with mode: agent frontmatter.
export function renderCopilot(cmd) {
  const fm = [
    '---',
    'mode: agent',
    `description: ${cmd.description}`,
    '---',
    '',
  ].join('\n');
  return fm + cmd.body + '\n';
}

export const TARGETS = {
  claude:  { dir: '.claude/commands',  ext: '.md',          render: renderClaude,  label: 'Claude Code' },
  cursor:  { dir: '.cursor/commands',  ext: '.md',          render: renderCursor,  label: 'Cursor' },
  copilot: { dir: '.github/prompts',   ext: '.prompt.md',   render: renderCopilot, label: 'GitHub Copilot' },
};
