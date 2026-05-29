// Model tiering: roles map to tiers, tiers map to concrete model IDs.
// The split lets a team change "cheap"/"strong" once (e.g. swap haiku → opus
// during a deep cleanup sprint) without editing every role.
//
// All roles default to a sensible tier. Users can override either:
//   - models.tiers.cheap   = 'haiku-4-5'        # change what 'cheap' resolves to
//   - models.roles.critic  = 'strong'           # promote a role to a different tier
//   - models.roles.critic  = 'claude-opus-4-7'  # escape hatch: literal model id

export const ROLE_DEFAULTS = {
  researcher:        'cheap',   // reads code + summarizes — cheap is enough
  planner:           'strong',  // designs the change — quality matters
  critic:            'cheap',   // verifies vs files — mostly mechanical
  coder:             'strong',  // writes the code — quality matters most
  repair:            'strong',  // diagnoses + fixes failures
  summarizer:        'cheap',   // structured rewrite of plan + diff
  'ticket-audit':    'cheap',   // scoring + structured output
  retro:             'strong',  // distilling lessons — needs judgement
  'codemap-overview':'cheap',   // 200-word summary
};

// Per-MTok prices in USD. Update when the published pricing changes.
// Keys are tier names + common model shortnames + full IDs so audit/cost
// can recognize either form recorded in meta.json.
export const PRICING = {
  // Shortnames used by Claude Code CLI (--model haiku|sonnet|opus)
  haiku:  { in: 1.00, out: 5.00 },
  sonnet: { in: 3.00, out: 15.00 },
  opus:   { in: 15.00, out: 75.00 },

  // Full Claude 4.x model IDs
  'claude-haiku-4-5-20251001':  { in: 1.00, out: 5.00 },
  'claude-sonnet-4-6':          { in: 3.00, out: 15.00 },
  'claude-sonnet-4-6[1m]':      { in: 6.00, out: 22.50 }, // 1M context tier
  'claude-opus-4-7':            { in: 15.00, out: 75.00 },
  'claude-opus-4-7[1m]':        { in: 30.00, out: 112.50 },
};

const DEFAULT_TIERS = { cheap: 'haiku', strong: 'sonnet' };

export function resolveModel(role, config = {}) {
  const tiers = { ...DEFAULT_TIERS, ...(config.models?.tiers || {}) };
  const roles = { ...ROLE_DEFAULTS, ...(config.models?.roles || {}) };
  const tierOrId = roles[role] || 'strong';
  // If the role value matches a tier name, resolve through tiers.
  // Otherwise treat it as a literal model id (escape hatch).
  return tiers[tierOrId] || tierOrId;
}

export function priceFor(model) {
  if (!model) return null;
  if (PRICING[model]) return PRICING[model];
  // Fall back by prefix
  for (const k of Object.keys(PRICING)) {
    if (model.startsWith(k)) return PRICING[k];
  }
  return null;
}

// Cheap token estimator: ~3.5 chars/token covers a mix of prose + code well
// enough for budgeting. Real billing uses the API's tokenizer.
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 3.5);
}

export function estimateCost({ inputText, outputText, model }) {
  const p = priceFor(model);
  if (!p) return { inTokens: estimateTokens(inputText), outTokens: estimateTokens(outputText), inUsd: 0, outUsd: 0, totalUsd: 0, unknownModel: true };
  const inTokens = estimateTokens(inputText);
  const outTokens = estimateTokens(outputText);
  const inUsd = (inTokens / 1e6) * p.in;
  const outUsd = (outTokens / 1e6) * p.out;
  return { inTokens, outTokens, inUsd, outUsd, totalUsd: inUsd + outUsd, unknownModel: false };
}
