// Prints the shared context an in-editor agent should load before planning or
// coding: the repo codemap + the lessons most relevant to the active ticket.
// The agent runs `agentflow context` and reads stdout.
import fs from 'node:fs';
import { artifactPath } from '../paths.mjs';
import { readCodemap, codemapPath } from '../codemap.mjs';
import { matchLessons, lessonsBlock, buildContextForMatching, listLessons } from '../lessons.mjs';

export async function context({ flags }) {
  const limit = flags.limit ? Number(flags.limit) : 5;

  const codemap = readCodemap();
  const out = [];
  out.push('===== agentflow context =====\n');

  out.push('## Repo codemap');
  if (codemap) out.push(codemap.trim());
  else out.push(`_(no codemap — run \`agentflow prime\` once for this repo)_`);
  out.push('');

  const all = listLessons();
  out.push(`## Lessons from past PRs (${all.length} total in repo)`);
  if (!all.length) {
    out.push('_(no lessons yet — they accumulate via `/agentflow-retro` after merges)_');
  } else {
    const matched = matchLessons(buildContextForMatching(), { limit });
    if (matched.length) {
      out.push(`Most relevant to the active ticket:\n`);
      out.push(lessonsBlock(matched));
    } else {
      out.push('_(none matched this ticket by keyword; showing none to avoid noise)_');
    }
  }
  out.push('\n===== end context =====');
  process.stdout.write(out.join('\n') + '\n');
}
