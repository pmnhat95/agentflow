import fs from 'node:fs';
import { readState } from '../state.mjs';
import { agentflowDir, artifactPath } from '../paths.mjs';
import { info, rule } from '../ui.mjs';

export async function status() {
  const s = readState();
  if (!s) { info("no state — run 'agentflow init <TICKET>'"); return; }
  rule(`status: ${s.ticket}`);
  info(`Phase:       ${s.phase}`);
  info(`Branch:      ${s.branch}`);
  info(`AI tool:     ${s.aiTool}`);
  info(`Plan loop:   round ${s.planLoop?.round || 0}, last verdict ${s.planLoop?.lastVerdict || '—'}`);
  info(`Repair loop: round ${s.repairLoop?.round || 0}`);
  if (s.prUrl) info(`PR:          ${s.prUrl}`);
  rule('artifacts');
  const dir = agentflowDir();
  for (const f of fs.readdirSync(dir)) {
    const p = artifactPath(f);
    const st = fs.statSync(p);
    if (st.isFile()) info(`${f}\t${st.size} bytes`);
    else info(`${f}/`);
  }
}
