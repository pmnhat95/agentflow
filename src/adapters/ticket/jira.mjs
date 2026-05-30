// Jira REST v3 adapter — no external deps.
// Required env vars (or configured via .agentflow/config.yaml):
//   JIRA_BASE_URL  e.g. https://yourorg.atlassian.net
//   JIRA_EMAIL     account email
//   JIRA_TOKEN     API token (https://id.atlassian.com/manage-profile/security/api-tokens)

function requireEnv(cfg) {
  const baseUrl = cfg.jira?.base_url || process.env.JIRA_BASE_URL;
  const email   = process.env[cfg.jira?.email_env || 'JIRA_EMAIL'];
  const token   = process.env[cfg.jira?.token_env || 'JIRA_TOKEN'];
  const hint = "Set it via `export` in your shell, or (works in any terminal) put it in ~/.agentflow/.env or <repo>/.agentflow/.env as KEY=VALUE.";
  if (!baseUrl) throw new Error(`JIRA_BASE_URL not set (or config.jira.base_url). ${hint}`);
  if (!email)   throw new Error(`JIRA_EMAIL not set. ${hint}`);
  if (!token)   throw new Error(`JIRA_TOKEN not set. ${hint}`);
  return { baseUrl: baseUrl.replace(/\/$/, ''), email, token };
}

function authHeader({ email, token }) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

async function jiraFetch(cfg, path, init = {}) {
  const env = requireEnv(cfg);
  const res = await fetch(`${env.baseUrl}${path}`, {
    ...init,
    headers: {
      'Authorization': authHeader(env),
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jira ${init.method || 'GET'} ${path} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function fetchTicket(cfg, key) {
  const data = await jiraFetch(cfg, `/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,issuetype,priority,status,labels,assignee,reporter,components`);
  const f = data.fields || {};
  return {
    key: data.key,
    summary: f.summary || '',
    description: adfToMarkdown(f.description),
    type: f.issuetype?.name || '',
    priority: f.priority?.name || '',
    status: f.status?.name || '',
    labels: f.labels || [],
    assignee: f.assignee?.displayName || '',
    reporter: f.reporter?.displayName || '',
    components: (f.components || []).map((c) => c.name),
    url: `${requireEnv(cfg).baseUrl}/browse/${data.key}`,
  };
}

export async function postComment(cfg, key, markdown) {
  const body = {
    body: {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: markdown }] },
      ],
    },
  };
  return jiraFetch(cfg, `/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Minimal ADF (Atlassian Document Format) → markdown for ticket descriptions.
// Handles common blocks; falls back to text. Goal: feed the model readable context.
function adfToMarkdown(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  return renderNode(node).trim();
}

function renderNode(n) {
  if (!n) return '';
  if (Array.isArray(n)) return n.map(renderNode).join('');
  switch (n.type) {
    case 'doc':       return (n.content || []).map(renderNode).join('\n\n');
    case 'paragraph': return renderInline(n.content);
    case 'heading':   return `${'#'.repeat(n.attrs?.level || 2)} ${renderInline(n.content)}`;
    case 'bulletList':
    case 'orderedList': {
      const ordered = n.type === 'orderedList';
      return (n.content || []).map((li, i) => `${ordered ? `${i + 1}.` : '-'} ${renderNode(li).trim()}`).join('\n');
    }
    case 'listItem':  return (n.content || []).map(renderNode).join(' ');
    case 'codeBlock': return '```\n' + renderInline(n.content) + '\n```';
    case 'blockquote': return '> ' + (n.content || []).map(renderNode).join('\n> ');
    case 'rule':      return '---';
    case 'hardBreak': return '\n';
    case 'text':      return applyMarks(n.text || '', n.marks || []);
    case 'mention':   return `@${n.attrs?.text || n.attrs?.displayName || ''}`;
    case 'inlineCard':
    case 'card':      return n.attrs?.url || '';
    default:          return (n.content ? (n.content || []).map(renderNode).join('') : (n.text || ''));
  }
}

function renderInline(content) {
  return (content || []).map(renderNode).join('');
}

function applyMarks(text, marks) {
  let out = text;
  for (const m of marks) {
    if (m.type === 'strong') out = `**${out}**`;
    else if (m.type === 'em') out = `*${out}*`;
    else if (m.type === 'code') out = `\`${out}\``;
    else if (m.type === 'link' && m.attrs?.href) out = `[${out}](${m.attrs.href})`;
  }
  return out;
}

export function formatTicketMarkdown(t) {
  return [
    `# ${t.key} — ${t.summary}`,
    '',
    `- **Type:** ${t.type}`,
    `- **Status:** ${t.status}`,
    `- **Priority:** ${t.priority}`,
    `- **Assignee:** ${t.assignee || 'unassigned'}`,
    `- **Reporter:** ${t.reporter}`,
    `- **Components:** ${t.components.join(', ') || '—'}`,
    `- **Labels:** ${t.labels.join(', ') || '—'}`,
    `- **URL:** ${t.url}`,
    '',
    '## Description',
    '',
    t.description || '_(no description)_',
    '',
  ].join('\n');
}
