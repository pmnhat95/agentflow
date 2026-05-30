import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

export function info(msg) { console.log(msg); }
export function warn(msg) { console.warn(`! ${msg}`); }
export function ok(msg)   { console.log(`✓ ${msg}`); }
export function step(msg) { console.log(`\n— ${msg}`); }

export function rule(title = '') {
  const w = (process.stdout.columns || 60) - 2;
  const pad = title ? ` ${title} ` : '';
  const left = Math.floor((w - pad.length) / 2);
  const right = w - pad.length - left;
  console.log(`${'─'.repeat(Math.max(0, left))}${pad}${'─'.repeat(Math.max(0, right))}`);
}

export async function prompt(question, { defaultValue = '' } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => {
      const suffix = defaultValue ? ` [${defaultValue}]` : '';
      rl.question(`${question}${suffix} `, (ans) => resolve(ans.trim() || defaultValue));
    });
  } finally { rl.close(); }
}

export async function confirm(question, def = true) {
  const ans = await prompt(`${question} (${def ? 'Y/n' : 'y/N'})`);
  if (!ans) return def;
  return /^y(es)?$/i.test(ans);
}

// 4-option approval gate
export async function approvalGate({ artifactPath, label }) {
  rule(`approval: ${label}`);
  info(`Artifact: ${artifactPath}`);
  info(`Choose: [a]pprove  [e]dit  [r]eject with reason  [l]oop again`);
  const ans = await prompt('Action');
  const c = (ans || '').toLowerCase();
  if (c === 'a' || c === '') return { action: 'approve' };
  if (c === 'e') {
    openInEditor(artifactPath);
    const ok2 = await confirm('Approve after edit?', true);
    return { action: ok2 ? 'approve' : 'reject', reason: 'edited' };
  }
  if (c === 'r') {
    const reason = await prompt('Reason (fed back into the loop)');
    return { action: 'reject', reason };
  }
  if (c === 'l') {
    const hint = await prompt('Hint for next loop iteration (optional)');
    return { action: 'loop', reason: hint };
  }
  warn(`unknown choice '${ans}', treating as reject`);
  return { action: 'reject', reason: 'unknown choice' };
}

export function openInEditor(filePath) {
  const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
  const res = spawnSync(editor, [filePath], { stdio: 'inherit' });
  if (res.status !== 0) warn(`editor exited with status ${res.status}`);
}

export function runCapture(cmd, args, { cwd, input } = {}) {
  const res = spawnSync(cmd, args, { cwd, input, encoding: 'utf8' });
  return { code: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}
