import fs from 'node:fs';
import path from 'node:path';
import { readState } from '../state.mjs';
import { readConfig } from '../config.mjs';
import { artifactPath } from '../paths.mjs';
import { runCapture } from '../ui.mjs';
import { getAdapter } from '../adapters/ai/index.mjs';
import { loadPrompt } from '../prompts.mjs';
import { invokeWithAudit } from '../audit.mjs';
import { listLessons, saveLesson, lessonsDir } from '../lessons.mjs';
import { info, ok, step, warn, rule } from '../ui.mjs';

// Usage: agentflow retro [<PR-URL or number>]
// - If omitted, uses state.prUrl from the most recent ship.
// - Compares approved plan vs the *merged* diff and PR reviews; extracts lessons.
export async function retro({ args }) {
  const config = readConfig();
  const state = readState();
  const pr = args[0] || state?.prUrl;
  if (!pr) throw new Error("retro requires a PR (arg or state.prUrl). Usage: 'agentflow retro <PR>'");

  const planPath = artifactPath('plan.md');
  const ticketPath = artifactPath('ticket.md');
  if (!fs.existsSync(planPath)) throw new Error('plan.md missing — retro needs the approved plan to compare against.');

  step('Fetching merged PR info via gh...');
  const prInfo = ghJson(['pr', 'view', pr, '--json', 'state,mergeCommit,baseRefName,headRefName,number,url,title,body']);
  if (!prInfo) throw new Error(`gh pr view failed for '${pr}'.`);
  if (prInfo.state !== 'MERGED') warn(`PR state is '${prInfo.state}' — running retro anyway on current diff.`);

  const reviews = ghJson(['pr', 'view', pr, '--json', 'reviews,comments']) || { reviews: [], comments: [] };

  const mergeSha = prInfo.mergeCommit?.oid;
  let diff = '';
  if (mergeSha) {
    const r = runCapture('git', ['fetch', 'origin', prInfo.baseRefName]);
    const parent = runCapture('git', ['rev-parse', `${mergeSha}^1`]).stdout.trim();
    if (parent) diff = runCapture('git', ['diff', `${parent}..${mergeSha}`]).stdout;
  }
  if (!diff) {
    // fallback: gh pr diff
    const d = runCapture('gh', ['pr', 'diff', String(pr)]);
    diff = d.stdout;
  }

  const mergedDiffFile = artifactPath('merged.diff');
  const reviewsFile = artifactPath('pr-reviews.json');
  const existingLessonsFile = artifactPath('existing-lessons.txt');
  fs.writeFileSync(mergedDiffFile, diff || '(empty diff)');
  fs.writeFileSync(reviewsFile, JSON.stringify(reviews, null, 2));
  fs.writeFileSync(existingLessonsFile, listLessons().map((l) => `${l.name}: ${l.topic} [${(l.triggers || []).join(', ')}]`).join('\n'));

  const adapter = getAdapter(config.ai_tool);
  adapter.check();

  step('Asking AI to extract generalizable lessons...');
  const prompt = loadPrompt('retro-extractor', {
    PLAN_FILE: planPath,
    TICKET_FILE: ticketPath,
    MERGED_DIFF_FILE: mergedDiffFile,
    REVIEWS_FILE: reviewsFile,
    EXISTING_LESSONS_FILE: existingLessonsFile,
    OUTPUT_FILE: artifactPath('retro-output.md'),
    PR_URL: prInfo.url,
    TICKET_KEY: state?.ticket || '',
  });
  fs.writeFileSync(artifactPath('prompt.retro.md'), prompt);
  const out = await invokeWithAudit(adapter, { prompt, label: 'retro', role: 'retro' }, { state: state || { ticket: 'retro' }, phase: 'retro' });
  fs.writeFileSync(artifactPath('retro-output.md'), out);

  const lessons = parseLessons(out);
  if (!lessons.length) { rule('retro done'); info('No generalizable lessons emitted (AI returned NO_LESSONS or empty). Nothing saved.'); return; }

  for (const l of lessons) {
    l.ticket = state?.ticket || '';
    l.pr_url = prInfo.url;
    const file = saveLesson(l);
    ok(`Saved lesson → ${path.relative(process.cwd(), file)}`);
  }
  info(`\nLessons live in ${path.relative(process.cwd(), lessonsDir())}. Commit them so the team shares the knowledge.`);
}

function ghJson(args) {
  const r = runCapture('gh', args);
  if (r.code !== 0) return null;
  try { return JSON.parse(r.stdout); } catch { return null; }
}

// Parse the AI's lesson blocks. Format: each lesson starts with `---LESSON---`.
export function parseLessons(text) {
  if (!text || /^\s*NO_LESSONS\s*$/m.test(text.split('\n')[0])) return [];
  const blocks = text.split(/^---LESSON---\s*$/m).slice(1);
  const out = [];
  for (const b of blocks) {
    const lines = b.split('\n');
    const obj = { triggers: [], body: '' };
    let inBody = false;
    let bodyLines = [];
    for (const line of lines) {
      if (inBody) { bodyLines.push(line); continue; }
      const m = line.match(/^([a-z_]+)\s*:\s*(.*)$/);
      if (!m) { if (line.trim() === '') continue; continue; }
      const k = m[1], v = m[2].trim();
      if (k === 'body') {
        // 'body: |' starts a literal block — capture remainder of block
        inBody = true;
        continue;
      }
      if (k === 'triggers') {
        obj.triggers = v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        obj[k] = v;
      }
    }
    obj.body = bodyLines.join('\n').replace(/^\s*\n/, '').trimEnd();
    if (!obj.body && obj.title) obj.body = obj.title;
    if (obj.name || obj.title) out.push(obj);
  }
  return out;
}
