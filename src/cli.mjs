import { commands } from './commands/index.mjs';

const USAGE = `agentflow — ticket-driven AI coding harness

▶ RECOMMENDED: drive everything from inside your AI tool's chat window.
  1. One-time per repo:   agentflow prime  &&  agentflow install
  2. Then in Claude Code / Cursor / Copilot chat, type:
       /agentflow-start <TICKET>   → fetch ticket + branch + summary
       /agentflow-plan             → research + reviewable plan (stops for your review)
       /agentflow-code             → implement the approved plan (TDD)
       /agentflow-verify           → run lint/test/build, fix failures
       /agentflow-ship             → write PR desc, confirm, open PR + comment Jira
       /agentflow-retro            → after merge: capture lessons

Setup commands:
  agentflow prime              One-time repo scan → .agentflow/codemap.md
  agentflow install [tool]     Write slash commands (claude|cursor|copilot|all; auto-detects)

Helpers (called by the in-editor agent; you rarely run these by hand):
  agentflow ticket <TICKET>    Fetch ticket + create branch + init state (no AI)
  agentflow context            Print repo codemap + lessons relevant to the ticket
  agentflow pr --from <file>   Commit, push, open PR, comment link on Jira
  agentflow lesson-save ...    Persist a lesson to .agentflow/lessons/

Headless pipeline (for CI or fully-automated 'ai_tool: claude'):
  agentflow init <TICKET> | plan | approve | code | verify | summary | ship | next

Utilities:
  agentflow retro [<PR>]       Extract generalizable lessons after merge
  agentflow cost [<run-id>]    Estimate $ spend (--all for every run)
  agentflow status             Show current phase + artifacts

Flags:
  --ai <claude|cursor|copilot>   Override configured AI tool for this run
  --from <file>                  In 'pr': read PR title/body from this file
  --max-rounds <N>               Override planner loop max rounds (default 3)
  --code-first                   In 'code' phase, write code before tests (default: TDD)
  --heuristic-only               In 'prime' phase, skip the AI overview pass
  --all                          In 'cost'/'install': all runs / all tools
  --yes                          Skip interactive approval (CI-friendly)
  --help, -h                     Show this help

Configuration: .agentflow/config.yaml
State:         .agentflow/state.json
`;

export async function run(argv) {
  const { cmd, args, flags } = parse(argv);

  if (flags.help || !cmd) {
    process.stdout.write(USAGE);
    return;
  }

  const handler = commands[cmd];
  if (!handler) {
    throw new Error(`unknown command '${cmd}'. Run 'agentflow --help' for usage.`);
  }

  await handler({ args, flags });
}

function parse(argv) {
  const args = [];
  const flags = {};
  let cmd = null;

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--help' || tok === '-h') {
      flags.help = true;
    } else if (tok === '--yes' || tok === '-y') {
      flags.yes = true;
    } else if (tok === '--code-first') {
      flags.codeFirst = true;
    } else if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[camel(key)] = next;
        i++;
      } else {
        flags[camel(key)] = true;
      }
    } else if (!cmd) {
      cmd = tok;
    } else {
      args.push(tok);
    }
  }

  return { cmd, args, flags };
}

function camel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
