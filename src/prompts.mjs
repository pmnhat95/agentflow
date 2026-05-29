import fs from 'node:fs';
import { promptTemplatePath } from './paths.mjs';

export function loadPrompt(name, vars = {}) {
  const tmpl = fs.readFileSync(promptTemplatePath(name), 'utf8');
  return tmpl.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => {
    return vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : '';
  });
}

// Detect QA questions in a Researcher or Planner output.
// Researcher signals via "## Open questions" with non-empty bullets.
// Planner signals via "## Need from Researcher".
export function extractQuestions(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      current = { title: m[1].trim(), body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  }
  const want = (t) => /open questions|need from researcher/i.test(t);
  const matched = sections.filter((s) => want(s.title));
  if (!matched.length) return [];
  const bullets = matched
    .flatMap((s) => s.body)
    .map((l) => l.trim())
    .filter((l) => /^[-*\d.]/.test(l) && l.replace(/^[-*\d.]\s*/, '').trim().length > 0);
  return bullets;
}

export function extractCriticVerdict(markdown) {
  const m = markdown.match(/##\s+Verdict\s*\n+\s*<?(PASS|FAIL)>?/i);
  return m ? m[1].toUpperCase() : null;
}

export function extractPrTitle(summaryMarkdown) {
  const m = summaryMarkdown.match(/^TITLE:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

export function stripPrTitleLine(md) {
  return md.replace(/^TITLE:.*$\n?/m, '').trim();
}
