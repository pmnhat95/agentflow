// GitHub Copilot adapter — manual mode.
// Copilot has no general-purpose headless CLI for agentic coding (the `gh copilot`
// extension only suggests shell commands). We treat Copilot like Cursor: write the
// prompt to a file, open the user's IDE, wait for the saved output.
import { makeManualAdapter } from './manual.mjs';

const adapter = makeManualAdapter({
  id: 'copilot',
  openFile: 'code', // VS Code; if user uses a different IDE the open step is best-effort
  ideHint: 'In VS Code: open Copilot Chat → paste prompt → save Copilot reply into the output file.',
});

export const { id, headless, check, invoke } = adapter;
