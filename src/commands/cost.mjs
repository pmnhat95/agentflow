import fs from 'node:fs';
import path from 'node:path';
import { agentflowDir } from '../paths.mjs';
import { estimateCost, priceFor } from '../models.mjs';
import { readState } from '../state.mjs';
import { info, warn, rule } from '../ui.mjs';

// `agentflow cost`             → current run only
// `agentflow cost --all`       → all runs in the audit log
// `agentflow cost <run-id>`    → a specific past run
export async function cost({ args, flags }) {
  const auditRoot = path.join(agentflowDir(), 'audit');
  if (!fs.existsSync(auditRoot)) { info('No audit log yet — nothing to estimate.'); return; }

  let runs;
  if (args[0]) {
    runs = [args[0]];
  } else if (flags.all) {
    runs = fs.readdirSync(auditRoot).filter((d) => fs.statSync(path.join(auditRoot, d)).isDirectory()).sort();
  } else {
    const s = readState();
    if (!s) { info("No active run; use --all or pass a run-id."); return; }
    runs = [s.runId || derivedRunId(s)];
  }

  let grand = { in: 0, out: 0, usd: 0, calls: 0, unknown: 0 };
  for (const r of runs) {
    const dir = path.join(auditRoot, r);
    if (!fs.existsSync(dir)) { warn(`Skip ${r}: not found.`); continue; }
    const sub = summarizeRun(dir, r);
    if (!sub) continue;
    grand.in += sub.in; grand.out += sub.out; grand.usd += sub.usd; grand.calls += sub.calls; grand.unknown += sub.unknown;
  }

  if (runs.length > 1) {
    rule('grand total');
    info(`Runs:           ${runs.length}`);
    info(`Calls:          ${grand.calls}`);
    info(`Input tokens:   ${fmtTok(grand.in)}`);
    info(`Output tokens:  ${fmtTok(grand.out)}`);
    info(`Estimated USD:  ${fmtUsd(grand.usd)}${grand.unknown ? `  (${grand.unknown} calls with unknown model — not priced)` : ''}`);
  }
}

function summarizeRun(dir, runId) {
  const files = fs.readdirSync(dir);
  const metas = files.filter((f) => f.endsWith('-meta.json')).sort();
  if (!metas.length) { warn(`Run ${runId} has no meta.json files.`); return null; }

  rule(`run: ${runId}`);
  printRow(['Phase', 'Role/label', 'Model', 'In', 'Out', 'USD'], true);

  let inTok = 0, outTok = 0, usd = 0, unknown = 0;
  for (const m of metas) {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, m), 'utf8'));
    const stem = m.replace(/-meta\.json$/, '');
    const promptFile = path.join(dir, `${stem}-prompt.md`);
    const outputFile = path.join(dir, `${stem}-output.md`);
    const inputText = fs.existsSync(promptFile) ? fs.readFileSync(promptFile, 'utf8') : '';
    const outputText = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : '';
    const est = estimateCost({ inputText, outputText, model: meta.model });

    inTok += est.inTokens; outTok += est.outTokens; usd += est.totalUsd;
    if (est.unknownModel) unknown++;

    printRow([
      meta.phase || '—',
      meta.role || meta.label || '—',
      meta.model || '(unknown)',
      fmtTok(est.inTokens),
      fmtTok(est.outTokens),
      est.unknownModel ? '—' : fmtUsd(est.totalUsd),
    ]);
  }
  printRow(['Total', `${metas.length} calls`, '', fmtTok(inTok), fmtTok(outTok), fmtUsd(usd)], true);
  if (unknown) info(`(${unknown} call(s) had no known pricing — see src/models.mjs#PRICING to add.)`);
  return { in: inTok, out: outTok, usd, calls: metas.length, unknown };
}

function fmtTok(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
function fmtUsd(n) { return `$${n.toFixed(3)}`; }

function printRow(cells, divider = false) {
  const widths = [10, 22, 22, 8, 8, 10];
  const padded = cells.map((c, i) => String(c).padEnd(widths[i]).slice(0, widths[i]));
  console.log(padded.join(' '));
  if (divider) console.log(widths.map((w) => '-'.repeat(w)).join(' '));
}

function derivedRunId(s) {
  return `${(s.createdAt || '').replace(/[:.]/g, '-')}-${s.ticket}`;
}
