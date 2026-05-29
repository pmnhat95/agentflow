// Claude Code headless adapter: runs `claude -p <prompt>` and captures stdout.
// Each invocation is an isolated session — good for the Researcher/Planner/Critic
// loop where roles must not contaminate each other's context.
import { spawn } from 'node:child_process';
import { runCapture } from '../../ui.mjs';

export const id = 'claude';
export const headless = true;

export function check() {
  const r = runCapture('claude', ['--version']);
  if (r.code !== 0) {
    throw new Error("Claude Code CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code");
  }
}

// Invoke Claude Code in headless print mode. The prompt is passed via stdin
// to avoid argv length limits and shell escaping issues.
export async function invoke({ prompt, label, allowedTools, model }) {
  check();
  const args = ['-p'];
  if (model) args.push('--model', model);
  // Allow restricting tools for deterministic roles (e.g., Critic shouldn't Write)
  if (allowedTools && allowedTools.length) {
    args.push('--allowedTools', allowedTools.join(','));
  }
  return await runStream('claude', args, prompt, label);
}

function runStream(cmd, args, input, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      out += s;
      // Mirror live to stderr so user sees progress without polluting captured stdout
      process.stderr.write(s);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`${label || cmd} exited ${code}`));
      else resolve(out);
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}
