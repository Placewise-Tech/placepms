import { ChevronDown, Sparkles } from 'lucide-react';
import type { AICommitDetection } from '../../lib/github-ai';

const sources = { author: 'Commit author', committer: 'Commit committer', coauthor: 'Co-author trailer', trailer: 'Commit trailer', message: 'Commit message footer' };

export default function GitHubAIFlag({ detection }: { detection?: AICommitDetection }) {
  if (!detection?.flagged) return null;
  return <details className="github-ai-evidence">
    <summary className="github-ai-badge"><Sparkles size={12} aria-hidden="true" /><strong>AI-assisted</strong>{detection.tools.length > 0 && <span>· {detection.tools.join(', ')}</span>}<ChevronDown className="github-ai-disclosure" size={12} aria-hidden="true" /></summary>
    <div><p>Flagged from explicit declarations in this commit.</p><ul>{detection.evidence.map(item => <li key={`${item.source}:${item.value}`}><strong>{sources[item.source]}</strong><code>{item.value}</code></li>)}</ul></div>
  </details>;
}
