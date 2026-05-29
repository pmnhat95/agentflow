// Cursor adapter — manual mode with an IDE open helper.
// Cursor's agent (Composer) is interactive; we hand off the prompt and wait
// for the user to save the agent's output to a designated file.
import { makeManualAdapter } from './manual.mjs';

const adapter = makeManualAdapter({
  id: 'cursor',
  openFile: 'cursor',
  ideHint: 'In Cursor: Cmd+I → paste prompt → run Composer → copy result into the output file.',
});

export const { id, headless, check, invoke } = adapter;
