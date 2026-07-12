import React from 'react';

export const AGENT_COLORS = {
  claude: 'var(--agent-claude)',
  codex: 'var(--agent-codex)',
  gemini: 'var(--agent-gemini)',
  opencode: 'var(--agent-opencode)',
  cursor: 'var(--agent-cursor)',
  route: 'var(--agent-route)',
  generic: 'var(--agent-generic)',
  free: 'var(--agent-free)',
};

const TONES = { ok: 'var(--ok)', warn: 'var(--warn)', error: 'var(--error)', info: 'var(--info)', memory: 'var(--memory)', accent: 'var(--accent)' };

// Badge de agente o de tono semantico: punto de color + label.
export function Badge({ agent, tone, label, solid = false, disabled = false, style }) {
  const color = disabled ? 'var(--text-3)' : agent ? AGENT_COLORS[agent] : tone ? TONES[tone] : 'var(--text-2)';
  const text = label != null ? label : agent || tone || '';
  if (solid) {
    return (
      <span style={Object.assign({ background: color, color: 'var(--bg-void)', fontWeight: 700, whiteSpace: 'pre' }, style)}>
        {' ' + text + ' '}
      </span>
    );
  }
  return (
    <span style={Object.assign({ color: color, whiteSpace: 'pre' }, style)}>
      {'\u25CF ' + text}
    </span>
  );
}
