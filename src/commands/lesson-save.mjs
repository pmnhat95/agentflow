// CLI wrapper so the in-editor agent can persist a lesson it extracted during
// /agentflow-retro:  agentflow lesson-save --name <slug> --topic <t> \
//                      --triggers "a,b,c" --source review-feedback --body-file <f>
import fs from 'node:fs';
import path from 'node:path';
import { readState } from '../state.mjs';
import { saveLesson, lessonsDir } from '../lessons.mjs';
import { ok, info } from '../ui.mjs';

export async function lessonSave({ flags }) {
  if (!flags.name) throw new Error('lesson-save requires --name <slug>');
  let body = '';
  if (flags.bodyFile) body = fs.readFileSync(flags.bodyFile, 'utf8');
  else if (flags.body) body = String(flags.body);
  else throw new Error('lesson-save requires --body-file <path> or --body "<text>"');

  const triggers = flags.triggers
    ? String(flags.triggers).split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const state = readState();
  const file = saveLesson({
    name: flags.name,
    topic: flags.topic || '',
    triggers,
    source: flags.source || 'manual',
    ticket: state?.ticket || flags.ticket || '',
    pr_url: flags.prUrl || state?.prUrl || '',
    body,
  });
  ok(`Saved lesson → ${path.relative(process.cwd(), file)}`);
  info(`Commit ${path.relative(process.cwd(), lessonsDir())} to share with the team.`);
}
