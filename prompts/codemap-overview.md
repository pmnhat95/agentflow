You are summarizing this repository for a coding agent. The goal is a tight architectural overview that a future agent can read before planning a change — not a tutorial, not a marketing description.

## Inputs

- Heuristic facts (already gathered by the harness): `{{FACTS_FILE}}`
- Top-level files actually present: `{{LAYOUT_FILE}}`
- Existing convention docs (if any): `{{CONVENTIONS_FILE}}`

## Your task

Write a 150–250 word overview answering:

1. What does this codebase *do*? (one sentence)
2. What's the high-level architecture / main components? (2–4 bullets, naming actual dirs)
3. Where do tests live and how are they organized?
4. Any non-obvious conventions a contributor should know? (drawn from convention docs)
5. Any visible deploy / release setup worth knowing?

## Output — write to `{{OUTPUT_FILE}}`

Plain Markdown, no headings level higher than h3. Be specific. If you can't determine something, say so — do not invent.

Do NOT restate the heuristic facts already in `{{FACTS_FILE}}` verbatim — the harness will display those separately. Your job is the *interpretation* on top of them.
