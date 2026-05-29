import { commands } from './commands/index.mjs';

const USAGE = `agentflow — ticket-driven AI coding harness

Usage:
  agentflow prime              One-time repo scan → .agentflow/codemap.md
  agentflow init <TICKET>      Fetch ticket, audit it, create branch, init state
  agentflow plan               Run Researcher↔Planner↔Critic loop (+ QA pause)
  agentflow approve            Human gate (works for plan or summary phase)
  agentflow code               Coder phase (TDD: test-first by default)
  agentflow verify             Run build/test/lint; auto-repair on failure
  agentflow summary            Generate structured summary of changes
  agentflow ship               Create PR, comment PR link on ticket
  agentflow retro [<PR>]       After merge: extract generalizable lessons → .agentflow/lessons/
  agentflow cost [<run-id>]    Estimate $ spend per role from the audit log (--all for every run)
  agentflow status             Show current phase + artifacts
  agentflow next               Advance to next phase based on current state

Flags:
  --ai <claude|cursor|copilot>   Override configured AI tool for this run
  --max-rounds <N>               Override planner loop max rounds (default 3)
  --code-first                   In 'code' phase, write code before tests (default: TDD)
  --heuristic-only               In 'prime' phase, skip the AI overview pass
  --all                          In 'cost' phase, aggregate across all runs
  --yes                          Skip interactive approval (CI-friendly)
  --help, -h                     Show this help

Configuration: .agentflow/config.yaml (created by 'init')
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
