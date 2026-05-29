import { runCapture } from '../../ui.mjs';

export function assertGhAvailable() {
  const r = runCapture('gh', ['--version']);
  if (r.code !== 0) {
    throw new Error("'gh' CLI not found. Install: https://cli.github.com/  (then 'gh auth login')");
  }
}

export function currentBranch() {
  const r = runCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (r.code !== 0) throw new Error(`git: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

export function isClean() {
  const r = runCapture('git', ['status', '--porcelain']);
  return r.code === 0 && r.stdout.trim() === '';
}

export function defaultBranch() {
  // Prefer 'origin/HEAD' → fall back to 'main' → 'master'
  const r = runCapture('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (r.code === 0 && r.stdout.trim()) return r.stdout.trim().replace(/^origin\//, '');
  for (const b of ['main', 'master']) {
    if (runCapture('git', ['rev-parse', '--verify', `origin/${b}`]).code === 0) return b;
  }
  return 'main';
}

export function ensureBranch(name, baseBranch) {
  const exists = runCapture('git', ['rev-parse', '--verify', name]).code === 0;
  if (exists) {
    const cur = currentBranch();
    if (cur !== name) {
      const co = runCapture('git', ['checkout', name]);
      if (co.code !== 0) throw new Error(`checkout failed: ${co.stderr.trim()}`);
    }
    return { created: false };
  }
  const base = baseBranch || defaultBranch();
  // Fetch to ensure base is fresh, then branch
  runCapture('git', ['fetch', 'origin', base]);
  const co = runCapture('git', ['checkout', '-b', name, `origin/${base}`]);
  if (co.code !== 0) {
    // fallback to local base if remote ref absent
    const co2 = runCapture('git', ['checkout', '-b', name, base]);
    if (co2.code !== 0) throw new Error(`branch create failed: ${co2.stderr.trim()}`);
  }
  return { created: true };
}

export function diffAgainstBase(baseBranch) {
  const base = baseBranch || defaultBranch();
  const r = runCapture('git', ['diff', `origin/${base}...HEAD`]);
  if (r.code !== 0) {
    // try local base
    return runCapture('git', ['diff', `${base}...HEAD`]).stdout;
  }
  return r.stdout;
}

export function diffStat(baseBranch) {
  const base = baseBranch || defaultBranch();
  const r = runCapture('git', ['diff', '--stat', `origin/${base}...HEAD`]);
  return r.stdout || runCapture('git', ['diff', '--stat', `${base}...HEAD`]).stdout;
}

export function commit(message, opts = {}) {
  if (opts.all !== false) runCapture('git', ['add', '-A']);
  const r = runCapture('git', ['commit', '-m', message]);
  if (r.code !== 0 && !/nothing to commit/.test(r.stdout + r.stderr)) {
    throw new Error(`commit failed: ${r.stderr.trim() || r.stdout.trim()}`);
  }
  return r;
}

export function pushBranch(branch) {
  const r = runCapture('git', ['push', '-u', 'origin', branch]);
  if (r.code !== 0) throw new Error(`push failed: ${r.stderr.trim()}`);
  return r;
}

export function createPullRequest({ title, body, base }) {
  assertGhAvailable();
  const args = ['pr', 'create', '--title', title, '--body', body];
  if (base) args.push('--base', base);
  const r = runCapture('gh', args);
  if (r.code !== 0) throw new Error(`gh pr create failed: ${r.stderr.trim()}`);
  const url = (r.stdout.match(/https?:\/\/\S+/) || [])[0] || r.stdout.trim();
  return { url };
}

export function repoSlug() {
  const r = runCapture('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  if (r.code !== 0) return null;
  return r.stdout.trim();
}
