// Lessons / self-learning: tiny per-repo knowledge base, populated by
// `agentflow retro` after each PR merges. On future runs, we keyword-match
// the current ticket against stored lessons and inject the top matches into
// Researcher / Planner / Coder prompts.
//
// File format: one Markdown file per lesson with YAML frontmatter:
//
//   ---
//   name: error-handling-fastify
//   topic: error-handling
//   triggers: [fastify, error, middleware]
//   ticket: PROJ-456
//   pr_url: https://github.com/.../pull/123
//   source: review-feedback  # | plan-deviation | repair-pattern
//   created: 2026-05-29
//   ---
//   # Title
//   Body...
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, artifactPath } from './paths.mjs';

export function lessonsDir() {
  // Stored INSIDE the team repo so lessons are shared via git.
  return path.join(repoRoot(), '.agentflow', 'lessons');
}

export function ensureLessonsDir() {
  const dir = lessonsDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listLessons() {
  const dir = lessonsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const parsed = parseLesson(raw, f);
      return { ...parsed, file: f };
    });
}

function parseLesson(raw, filename) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { name: filename.replace(/\.md$/, ''), triggers: [], topic: '', body: raw };
  const fm = parseFrontmatter(m[1]);
  return {
    name: fm.name || filename.replace(/\.md$/, ''),
    topic: fm.topic || '',
    triggers: Array.isArray(fm.triggers) ? fm.triggers : parseTriggerList(fm.triggers),
    ticket: fm.ticket || '',
    pr_url: fm.pr_url || '',
    source: fm.source || '',
    created: fm.created || '',
    body: m[2].trim(),
  };
}

// Minimal YAML-ish reader: supports `key: value` and `key: [a, b, c]`.
// Avoids pulling YAML for performance; lessons files are written by us.
function parseFrontmatter(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
    } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parseTriggerList(v) {
  if (!v) return [];
  if (typeof v === 'string') return v.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

// Score lessons by keyword overlap with current ticket context.
// Cheap and deterministic — no embeddings. Good enough for a small lesson set.
export function matchLessons(contextText, { limit = 5 } = {}) {
  const lessons = listLessons();
  if (!lessons.length) return [];
  const haystack = tokenize(contextText);
  const scored = lessons.map((l) => {
    const keys = new Set([...(l.triggers || []), l.topic, ...tokenize(l.name)].map(normalize).filter(Boolean));
    let score = 0;
    for (const k of keys) if (haystack.has(k)) score += 1;
    return { lesson: l, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.lesson);
}

function tokenize(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter((t) => t && t.length > 2)
      .map(normalize)
  );
}

function normalize(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''); }

// Format matched lessons as a Markdown block to drop into a prompt.
export function lessonsBlock(matches) {
  if (!matches || !matches.length) return '_(no relevant lessons yet)_';
  return matches.map((l) => {
    const tags = (l.triggers || []).join(', ');
    return [
      `### ${l.name}  (topic: ${l.topic || '—'}; triggers: ${tags})`,
      l.pr_url ? `Source: ${l.pr_url}` : '',
      '',
      l.body,
    ].filter(Boolean).join('\n');
  }).join('\n\n---\n\n');
}

// Build the context string we'll match against — combine ticket, research, plan if present.
export function buildContextForMatching() {
  const parts = [];
  for (const f of ['ticket.md', 'research.md', 'plan.md']) {
    const p = artifactPath(f);
    if (fs.existsSync(p)) parts.push(fs.readFileSync(p, 'utf8'));
  }
  return parts.join('\n\n');
}

export function saveLesson(lesson) {
  ensureLessonsDir();
  const slug = (lesson.name || 'lesson').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const file = path.join(lessonsDir(), `${slug}.md`);
  const triggers = (lesson.triggers || []).join(', ');
  const frontmatter = [
    '---',
    `name: ${slug}`,
    `topic: ${lesson.topic || ''}`,
    `triggers: [${triggers}]`,
    `ticket: ${lesson.ticket || ''}`,
    `pr_url: ${lesson.pr_url || ''}`,
    `source: ${lesson.source || ''}`,
    `created: ${new Date().toISOString().slice(0, 10)}`,
    '---',
    '',
  ].join('\n');
  fs.writeFileSync(file, frontmatter + (lesson.body || '').trim() + '\n');
  return file;
}
