// Manual adapter — used for Cursor and GitHub Copilot since neither has a
// reliable headless mode for agentic coding. CLI writes the prompt to a file,
// opens the user's IDE, and waits for them to save the AI output to a known
// path. Reproducible and tool-agnostic, at the cost of being interactive.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { artifactPath, agentflowDir } from '../../paths.mjs';
import { info, warn, prompt as ask, rule } from '../../ui.mjs';

function writePrompt(label, prompt) {
  const promptFile = path.join(agentflowDir(), `prompt.${label}.md`);
  const outputFile = path.join(agentflowDir(), `output.${label}.md`);
  fs.writeFileSync(promptFile, prompt);
  // Pre-create output file so user can see where to save
  if (!fs.existsSync(outputFile)) fs.writeFileSync(outputFile, '');
  return { promptFile, outputFile };
}

async function waitForOutput(label, outputFile, ideHint) {
  rule(`manual step: ${label}`);
  info(`Prompt:  ${path.relative(process.cwd(), outputFile.replace('output.', 'prompt.'))}`);
  info(`Output:  ${path.relative(process.cwd(), outputFile)}`);
  if (ideHint) info(`Hint:    ${ideHint}`);
  info('Open your AI tool, feed it the prompt above, and save the response to the output file.');
  while (true) {
    await ask('Press Enter when the output file is saved (or type "skip" to abort)');
    const content = fs.readFileSync(outputFile, 'utf8').trim();
    if (content.length > 0) return content;
    warn('Output file is empty. Save the AI response and try again.');
  }
}

export function makeManualAdapter({ id, openFile, ideHint }) {
  return {
    id,
    headless: false,
    check() { /* manual adapters always available */ },
    async invoke({ prompt, label, model }) {
      const header = model
        ? `> [agentflow] Suggested model for this step: **${model}**\n> If your IDE lets you pick a model, choose that one (or stronger) for cost-tier alignment.\n\n`
        : '';
      const { promptFile, outputFile } = writePrompt(label, header + prompt);
      if (openFile) {
        try { spawnSync(openFile, [promptFile], { stdio: 'ignore' }); } catch { /* ignore */ }
      }
      return await waitForOutput(label, outputFile, ideHint);
    },
  };
}
