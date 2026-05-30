# agentflow

A ticket-driven AI coding harness that gives a team **one shared workflow** across Claude Code, Cursor, and GitHub Copilot.

```
prime (once per repo)
init → ticket-audit → plan (Researcher↔Planner↔Critic loop, with Q&A pause) →
  human gate → code (TDD) → verify (build/test/lint, auto-repair) →
  summary → human gate → ship (PR + Jira comment)
retro (after PR merge → learned lessons feed back into future runs)
```

The CLI is the deterministic part (state, Jira/GitHub calls, two human approval gates). The AI tool of your choice does the thinking, via prompts that enforce a structured output schema and a *grounded* critic that verifies claims against the actual code. The harness gets smarter over time: every merged PR is post-mortemed for generalizable lessons, which are then matched against future tickets and injected into the prompts.

## Two ways to drive it

**A. Slash commands inside your AI tool (recommended).** Run `agentflow prime && agentflow install` once per repo. Then, from inside Claude Code / Cursor / Copilot chat, type `/agentflow-start <TICKET>`, `/agentflow-plan`, `/agentflow-code`, `/agentflow-verify`, `/agentflow-ship`, `/agentflow-retro`. The AI agent orchestrates; the CLI is called by the agent only for deterministic plumbing (Jira fetch, branch, PR, lessons). Human approval gates are the boundaries between commands — typing the next command *is* your approval. **See `ONBOARDING.md`.**

**B. Headless CLI pipeline.** Run the phases yourself from the terminal (`agentflow init <TICKET>`, `plan`, `approve`, `code`, …). Best for CI or fully-unattended `ai_tool: claude` runs. This is what the sections below document.

The two modes share the same `.agentflow/` artifacts, config, codemap, and lessons — pick per-developer or per-task.

## Prerequisites

- Node ≥ 18
- `git`
- [`gh`](https://cli.github.com/) (authenticated: `gh auth login`)
- One of:
  - **Claude Code** CLI installed and on `$PATH` (full headless integration)
  - **Cursor** or **VS Code with Copilot Chat** (manual handoff mode — see below)
- Jira API token: <https://id.atlassian.com/manage-profile/security/api-tokens>

## Install

```bash
cd /Users/nhatphan/agentflow
npm install
npm link               # makes `agentflow` available globally
```

Or use without linking: `node /Users/nhatphan/agentflow/bin/agentflow.mjs <cmd>`

## Configure

In each repo where you'll use the tool:

```bash
cd /path/to/your/repo
agentflow init PROJ-123
```

That creates `.agentflow/config.yaml`. Edit it to set Jira host and verify commands:

```yaml
ai_tool: claude        # or 'cursor' or 'copilot'
ticket_provider: jira
git_host: github
max_loop_rounds: 3
max_repair_rounds: 3
tdd: true
jira:
  base_url: https://yourorg.atlassian.net
verify:
  commands:
    - npm run lint
    - npm test
    - npm run build
```

Environment variables required:

```bash
export JIRA_EMAIL=you@yourorg.com
export JIRA_TOKEN=...
# JIRA_BASE_URL is optional if you set jira.base_url in config.yaml
```

## Workflow

```bash
# Once per repo (or whenever architecture meaningfully changes):
agentflow prime
# Scans languages / test framework / linters / layout / convention docs,
# asks the AI for a short overview, writes .agentflow/codemap.md.
# Use --heuristic-only to skip the AI call.

agentflow init PROJ-123
# Fetches the Jira ticket, then runs a Ticket Auditor (scores 0.0–1.0).
# If score < 0.75 you get the choice to (c)ontinue / (a)sk reporter via Jira
# comment / (q)uit. Then creates branch feature/proj-123-<slug>.

agentflow plan
# runs the Researcher↔Planner↔Critic loop:
#   - Researcher reads the codebase, writes research.md
#   - Planner writes plan.md (structured: scope/files/tests/risks)
#   - Critic verifies plan against actual files; PASS or FAIL
#   - If a role says it's missing info, the loop pauses, writes qa.md,
#     waits for the human to fill qa-answers.md, then continues.

agentflow approve
# 4 options: [a]pprove · [e]dit · [r]eject with reason · [l]oop again

agentflow code
# Coder phase. TDD by default: tests first, then code, until green.
# If the Coder finds it needs to touch a file outside the plan, it writes
# coder-notes.md and the harness routes back to `plan`.

agentflow verify
# Runs your configured commands. On failure, triggers a bounded Repair loop.

agentflow summary
# Generates a structured PR description (follows .github/pull_request_template.md if present).

agentflow approve
# Second human gate.

agentflow ship
# Commits any pending work, pushes the branch, opens the PR via `gh`,
# and comments the PR link on the Jira ticket.

# After the PR is reviewed and merged (run anywhere — passes through gh):
agentflow retro              # uses state.prUrl
agentflow retro 1234         # or pass an explicit PR number/URL
# Pulls the merged diff + review comments, asks the AI to extract
# generalizable lessons. Saves them to .agentflow/lessons/ — commit those!
# Future `plan` / `code` runs will keyword-match these lessons against the
# next ticket and inject the top matches into the prompts.

# Shortcut: `agentflow next` runs whatever the current phase is.
```

## AI tool support

| Tool         | Mode      | Notes                                                                                  |
| ------------ | --------- | -------------------------------------------------------------------------------------- |
| Claude Code  | headless  | Invoked via `claude -p` (stdin prompt, captured stdout). Best UX.                      |
| Cursor       | manual    | CLI writes the prompt to a file and opens it in Cursor; you run Composer and save out. |
| GitHub Copilot | manual  | Same handoff as Cursor, defaults to opening in VS Code.                                |

Copilot has no general-purpose headless CLI for agentic coding, so it always uses manual mode. Cursor's Composer is interactive-only, so it also uses manual mode. Pick `ai_tool: claude` if you want fully unattended runs.

## Artifacts

Everything the harness produces lives in `.agentflow/`:

```
.agentflow/
├── state.json           ← current phase, branch, round counters, runId
├── config.yaml          ← per-repo config                            ← COMMIT
├── codemap.md           ← from `prime`; team-shared baseline         ← COMMIT
├── lessons/             ← from `retro`; team-shared learning         ← COMMIT
│   └── *.md
├── audit/<runId>/       ← full prompt + output + meta per role call
├── ticket.md            ← Jira ticket dump
├── ticket-audit.md      ← score + clarification request
├── research.md
├── plan.md              ← what the human reviews at gate #1
├── critique/r1.md, r2.md, ...
├── qa.md, qa-answers.md ← when a role needs human input
├── coder-log.md
├── diff.patch, diff.stat
├── summary.md           ← what the human reviews at gate #2
└── prompt.*.md          ← latest copy of each prompt sent to the AI
```

**Commit to git:** `config.yaml`, `codemap.md`, `lessons/`. They're the shared knowledge base.
**Add to `.gitignore`:** everything else under `.agentflow/` (per-ticket artifacts and audit log).

## Troubleshooting

- **`gh: command not found`** — install GitHub CLI and `gh auth login`.
- **Critic never PASS** — the plan likely has unverified claims. Edit `.agentflow/plan.md` manually and use the `[a]pprove` gate to override, or add a hint via `[l]oop again`.
- **Manual adapter doesn't open IDE** — the `cursor` or `code` shell command isn't on PATH. Open the prompt file yourself and proceed.
- **Want a deterministic Critic?** — Critic restricts allowed tools to read-only (Read/Glob/Grep), so it can verify but can't modify the plan.

## Model tiering (cost-aware orchestration)

Different roles need different model strength. The harness defaults to a 2-tier setup:

| Role            | Default tier | Why                                          |
| --------------- | ------------ | -------------------------------------------- |
| researcher      | cheap        | Reads + summarizes code; mostly mechanical    |
| planner         | strong       | Designs the change — judgement matters       |
| critic          | cheap        | Grounds claims vs files — pattern matching   |
| coder           | strong       | Writes the production code                   |
| repair          | strong       | Diagnoses + fixes verification failures      |
| summarizer      | cheap        | Restructures plan + diff into PR description |
| ticket-audit    | cheap        | Scores ticket + emits structured output      |
| retro           | strong       | Distills generalizable lessons               |
| codemap-overview| cheap        | 200-word repo summary                        |

`tiers` map names → concrete model IDs and is fully editable in `.agentflow/config.yaml`:

```yaml
models:
  tiers:
    cheap:  haiku           # or 'claude-haiku-4-5-20251001' / 'claude-sonnet-4-6'
    strong: sonnet
  roles:
    critic: strong          # override a single role
    coder:  claude-opus-4-7 # escape hatch: literal model id
```

**Why it matters:** With the default Haiku/Sonnet split, a ticket that previously cost ~$1.50 with everything on Sonnet drops to **~$0.75 (≈50% savings)** — Researcher + Critic + Summarizer are the dominant token consumers and they tier-down safely.

**For manual mode** (Cursor/Copilot): the harness adds a `> Suggested model: X` header on each prompt file so the dev can pick the right model in their IDE.

## Cost tracking

```bash
agentflow cost              # estimate spend for the current run
agentflow cost --all        # aggregate across every run in the audit log
agentflow cost <run-id>     # one specific past run
```

Reads `.agentflow/audit/<runId>/*-meta.json`, estimates tokens at ~3.5 chars/token, applies per-model pricing from `src/models.mjs#PRICING`. Output:

```
run: 2026-05-29T10-15-00-PROJ-123
Phase      Role/label             Model                  In       Out      USD
---------- ---------------------- ---------------------- -------- -------- ----------
plan       researcher             haiku                  8.2K     2.0K     $0.018
plan       planner                sonnet                 9.0K     4.1K     $0.089
plan       critic                 haiku                  9.1K     2.4K     $0.021
...
Total      9 calls                                       198K     54K      $1.42
```

Estimates use a heuristic tokenizer (real billing uses the API tokenizer) — expect ±15% variance.

## Self-learning details

When `retro` runs, the Retro Extractor compares:
- The approved `plan.md` vs. the diff of the merge commit
- Reviewer comments (`gh pr view --json reviews,comments`)
- Existing lessons (so it doesn't duplicate)

It emits *generalizable* lessons only — a rule that applies to other tickets, not a one-off detail. Each lesson is a Markdown file with YAML frontmatter:

```yaml
---
name: use-fastify-error-handlers
topic: error-handling
triggers: [fastify, error, middleware]
ticket: PROJ-123
pr_url: https://github.com/.../pull/45
source: review-feedback   # | plan-deviation | repair-pattern
created: 2026-05-29
---
Wrap async route handlers with the repo's `errorBoundary` helper. Reviewers
consistently flag bare `try/catch` blocks because the project logger needs
the err.cause to be preserved.
```

On the next `plan` / `code`, the harness:
1. Tokenizes the ticket + research + plan
2. Scores each lesson by trigger overlap
3. Injects the top 5 into the prompts via `{{LESSONS}}`

Matching is intentionally keyword-based (no embeddings) — deterministic, fast, no extra deps.

## Roadmap

- Embedding-based lesson matching (replace keyword overlap, ~20% better recall on semantic matches).
- CI feedback loop (`agentflow heal`) — when a merged PR breaks CI, pull the logs and repair.
- Speculative parallel exploration — generate N plans and let the Critic pick.
- Hooks: pre-commit / pre-push fingerprints to detect lesson-violations before they ship.
- Multi-ticket worktrees so the same dev can have several `agentflow` flows open.
- Lesson confidence decay: stale lessons get downweighted if not matched after N runs.
