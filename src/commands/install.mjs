// `agentflow install [claude|cursor|copilot|all]`
// Writes the slash-command files into the current repo so the team can drive
// the whole flow from inside their AI tool's chat window.
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../paths.mjs';
import { COMMANDS, TARGETS } from '../integrations/slash.mjs';
import { ensureConfig } from '../config.mjs';
import { ok, info, step, warn, rule } from '../ui.mjs';

export async function install({ args, flags }) {
  ensureConfig(); // make sure .agentflow/config.yaml exists too

  let targets = args.filter((a) => TARGETS[a]);
  if (args.includes('all') || targets.length === 0) {
    targets = autodetect(flags);
  }

  rule('agentflow install');
  for (const t of targets) {
    const target = TARGETS[t];
    const dir = path.join(repoRoot(), target.dir);
    fs.mkdirSync(dir, { recursive: true });
    step(`${target.label} → ${target.dir}/`);
    for (const cmd of COMMANDS) {
      const file = path.join(dir, `${cmd.name}${target.ext}`);
      fs.writeFileSync(file, target.render(cmd));
      info(`  ${cmd.name}${target.ext}`);
    }
    ok(`${COMMANDS.length} commands installed for ${target.label}`);
  }

  rule('next steps');
  info('In your AI tool, the slash commands are now available:');
  info('  /agentflow-start <TICKET>   /agentflow-plan   /agentflow-code');
  info('  /agentflow-verify   /agentflow-ship   /agentflow-retro');
  info('');
  info('Tip: commit the generated command files so the whole team shares them.');
  if (!hasPrime()) warn("Run `agentflow prime` once to generate .agentflow/codemap.md for richer context.");
}

function autodetect(flags) {
  if (flags.all) return Object.keys(TARGETS);
  const found = [];
  if (fs.existsSync(path.join(repoRoot(), '.claude')) || fs.existsSync(path.join(repoRoot(), 'CLAUDE.md'))) found.push('claude');
  if (fs.existsSync(path.join(repoRoot(), '.cursor')) || fs.existsSync(path.join(repoRoot(), '.cursorrules'))) found.push('cursor');
  if (fs.existsSync(path.join(repoRoot(), '.github'))) found.push('copilot');
  // If nothing detected, install all three so the dev can pick.
  return found.length ? found : Object.keys(TARGETS);
}

function hasPrime() {
  return fs.existsSync(path.join(repoRoot(), '.agentflow', 'codemap.md'));
}
