import type { GitHubIdentity } from './integration-types.js';

export interface AICommitMetadata {
  message: string;
  author?: Partial<GitHubIdentity> | string;
  committer?: Partial<GitHubIdentity>;
  authorIdentity?: Partial<GitHubIdentity>;
  committerIdentity?: Partial<GitHubIdentity>;
}
export interface AICommitEvidence {
  source: 'author' | 'committer' | 'coauthor' | 'trailer' | 'message';
  value: string;
  tool?: string;
}
export interface AICommitDetection { flagged: boolean; tools: string[]; evidence: AICommitEvidence[] }

const toolNames: [string, RegExp][] = [
  ['Claude', /^claude(?:\s+(?:code|opus|sonnet|haiku))?(?:\s+v?\d+(?:\.\d+)*)?$/i],
  ['GitHub Copilot', /^(?:github\s+)?copilot(?:\s+(?:coding|swe)\s+agent)?$/i],
  ['Cursor', /^cursor(?:\s+agent)?$/i],
  ['OpenAI Codex', /^(?:openai\s+)?codex(?:\s+(?:cli|agent))?$/i],
  ['Gemini', /^(?:google\s+)?gemini(?:\s+cli)?$/i],
  ['Aider', /^aider$/i], ['OpenHands', /^openhands$/i], ['Devin', /^devin$/i],
  ['Windsurf', /^windsurf(?:\s+cascade)?$/i], ['Cline', /^cline$/i], ['Roo Code', /^roo\s+code$/i],
];
const agentAccounts = new Map([
  ['copilot', 'GitHub Copilot'], ['copilot[bot]', 'GitHub Copilot'], ['copilot-swe-agent[bot]', 'GitHub Copilot'],
  ['cursoragent', 'Cursor'], ['cursor[bot]', 'Cursor'], ['cursor-agent[bot]', 'Cursor'],
  ['codex[bot]', 'OpenAI Codex'], ['openai-codex[bot]', 'OpenAI Codex'],
  ['devin-ai-integration[bot]', 'Devin'], ['openhands[bot]', 'OpenHands'],
]);
const markerKeys = new Set(['ai-assisted', 'ai-generated', 'ai-authored']);
const positive = /^(?:true|yes|1)$/i;
const negative = /^(?:false|no|0|none)$/i;

function knownTool(value: string) {
  const name = value.trim().replace(/\.$/, '').replace(/^\[([^\]]+)\]\(https?:\/\/[^)]+\)$/, '$1');
  return toolNames.find(([, pattern]) => pattern.test(name))?.[0];
}
function identityTool(identity: Partial<GitHubIdentity>) {
  const login = identity.login?.trim().toLowerCase() || '';
  if (agentAccounts.has(login)) return agentAccounts.get(login);
  const email = identity.email?.trim().toLowerCase() || '';
  const name = identity.name?.trim() || '';
  const tool = knownTool(name.replace(/\s*\[bot\]$/i, ''));
  if (tool && /\[bot\]$/i.test(name)) return tool;
  if (tool === 'Claude' && email === 'noreply@anthropic.com') return tool;
  if (tool === 'Cursor' && email === 'cursoragent@cursor.com') return tool;
  if (tool === 'OpenAI Codex' && email === 'codex@openai.com') return tool;
  if (tool === 'GitHub Copilot' && email === 'copilot@github.com') return tool;
  const account = email.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/)?.[1];
  return account ? agentAccounts.get(account) : undefined;
}
function readTrailers(paragraph: string) {
  const trailers: { key: string; value: string }[] = [];
  for (const line of paragraph.split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9-]*):[ \t]*(.*)$/);
    if (match) trailers.push({ key: match[1], value: match[2].trim() });
    else if (/^[ \t]+\S/.test(line) && trailers.length) trailers[trailers.length - 1].value += ` ${line.trim()}`;
    else return [];
  }
  return trailers;
}
function outsideCode(message: string) {
  let fence: { character: string; size: number } | undefined;
  return message.split('\n').map(line => {
    const token = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (token && token[1][0] === fence.character && token[1].length >= fence.size && !token[2].trim()) fence = undefined;
      return '\uFFFC';
    }
    if (token) { fence = { character: token[1][0], size: token[1].length }; return '\uFFFC'; }
    return line;
  }).join('\n');
}

// Flags report explicit provenance, never guesses based on code style or a
// commit mentioning AI. A missing marker does not establish human authorship.
export function detectCommitAI(commit: AICommitMetadata): AICommitDetection {
  const evidence: AICommitEvidence[] = [];
  const seen = new Set<string>();
  const add = (source: AICommitEvidence['source'], value: string, tool?: string) => {
    const key = `${source}:${value.toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); evidence.push({ source, value, ...(tool ? { tool } : {}) }); }
  };
  const author = commit.authorIdentity || (typeof commit.author === 'string' ? { name: commit.author } : commit.author);
  for (const [source, identity] of [['author', author], ['committer', commit.committerIdentity || commit.committer]] as const) {
    if (!identity) continue;
    const tool = identityTool(identity);
    if (tool) add(source, [identity.name, identity.login && `@${identity.login}`, identity.email && `<${identity.email}>`].filter(Boolean).join(' '), tool);
  }
  const paragraphs = outsideCode(commit.message.replace(/\r\n?/g, '\n')).trim().split(/\n[ \t]*\n/);
  const trailers = readTrailers(paragraphs.at(-1) || '');
  const confirmed = trailers.some(item => markerKeys.has(item.key.toLowerCase()) && positive.test(item.value));
  const denied = trailers.some(item => markerKeys.has(item.key.toLowerCase()) && negative.test(item.value));
  for (const item of trailers) {
    const key = item.key.toLowerCase(); const value = `${item.key}: ${item.value}`;
    if (key === 'co-authored-by') {
      const identity = item.value.match(/^(.+?)\s*<([^<>\s]+)>$/);
      const tool = identity && identityTool({ name: identity[1], email: identity[2] });
      if (tool) add('coauthor', value, tool);
    } else if (markerKeys.has(key) && positive.test(item.value)) add('trailer', value);
    else if (key === 'ai-tool' && item.value && !negative.test(item.value) && (!denied || confirmed)) add('trailer', value, knownTool(item.value) || item.value.slice(0, 120));
    else if (key === 'generated-by') { const tool = knownTool(item.value); if (tool) add('trailer', value, tool); }
  }
  // Only a standalone footer declaration is eligible; quoted documentation
  // and fenced examples elsewhere in the commit body are not provenance.
  const footer = trailers.length ? paragraphs.at(-2) : paragraphs.at(-1);
  const generated = footer?.trim().match(/^(?:🤖\s*)?(?:generated|written|authored|created|implemented)\s+(?:with|by|using)\s+([^\n]+)$/i);
  const tool = generated && knownTool(generated[1]);
  if (tool) add('message', footer!.trim(), tool);
  return { flagged: evidence.length > 0, tools: [...new Set(evidence.flatMap(item => item.tool ? [item.tool] : []))], evidence };
}
