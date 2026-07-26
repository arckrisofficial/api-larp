'use client';

import { useState, useEffect } from 'react';
import { useWidgetSDK } from '@nitrostack/widgets';

type Assessment = {
  id: string;
  version: number;
  analysisStatus: string;
  decisionStatus: string;
  overallSeverity: 'HIGH' | 'MEDIUM' | 'LOW';
  sourceMode: string;
  classifierMode: string;
  durationMs: number;
  createdAt: string;
  changes: Array<{ id: string; code: string; breaking: boolean; operation: string; jsonPath?: string; rationale: string }>;
  evidence: Array<{ id: string; repository: string; filePath: string; lineStart: number; classification: string; confidence: string; reasoning: string; commitSha: string }>;
  limitations: string[];
  decision?: { reason?: string; actorDisplayName: string; decidedAt: string };
};

const PREVIEW_DATA: Assessment = {
  id: 'asm_preview',
  version: 1,
  analysisStatus: 'COMPLETE',
  decisionStatus: 'PENDING',
  overallSeverity: 'HIGH',
  sourceMode: 'snapshot',
  classifierMode: 'deterministic-fallback',
  durationMs: 2,
  createdAt: new Date().toISOString(),
  changes: [
    { id: 'chg_preview_1', code: 'PROPERTY_TYPE_CHANGED', breaking: true, operation: 'GET /api/user', jsonPath: '$response.id', rationale: 'Schema type changed from integer to string.' },
    { id: 'chg_preview_2', code: 'REQUIRED_PROPERTY_REMOVED', breaking: true, operation: 'GET /api/user', jsonPath: '$response.name', rationale: 'Required property name was removed.' },
    { id: 'chg_preview_3', code: 'ENUM_WIDENED', breaking: true, operation: 'GET /api/user', jsonPath: '$response.status', rationale: 'New enum value "suspended" may break exhaustive handling.' },
    { id: 'chg_preview_4', code: 'OPTIONAL_PROPERTY_ADDED', breaking: false, operation: 'GET /api/user', jsonPath: '$response.fullName', rationale: 'Optional property added — backward compatible.' },
  ],
  evidence: [
    { id: 'ev-react-name', repository: 'arckrisofficial/apiguard-react-consumer', filePath: 'src/consumer.js', lineStart: 1, classification: 'CONFIRMED_IMPACT', confidence: 'MEDIUM', reasoning: 'Production consumer reads the removed response.name field.', commitSha: 'a704e5aecb2f' },
    { id: 'ev-python-id', repository: 'arckrisofficial/apiguard-python-consumer', filePath: 'src/consumer.py', lineStart: 2, classification: 'CONFIRMED_IMPACT', confidence: 'MEDIUM', reasoning: 'Type annotation int will fail when id becomes a string.', commitSha: '7c67a54f2a82' },
    { id: 'ev-go-status', repository: 'arckrisofficial/apiguard-go-consumer', filePath: 'src/consumer.go', lineStart: 1, classification: 'CONFIRMED_IMPACT', confidence: 'MEDIUM', reasoning: 'Exhaustive switch will panic on new enum value "suspended".', commitSha: '1cb53e40d43e' },
  ],
  limitations: [
    'Preview mode — run_impact_assessment via Studio for live data.',
  ],
};

function unwrapToolResult(value: unknown): Assessment | null {
  if (!value) return null;
  const candidate = value as { structuredContent?: unknown; data?: unknown };
  return (candidate?.structuredContent ?? candidate?.data ?? value) as Assessment;
}

const C = {
  bg: '#0c0e14',
  surface: '#12151e',
  surfaceHover: '#181c28',
  border: '#1e2333',
  borderBright: '#2a3050',
  text: '#c8cdd8',
  textDim: '#6b7280',
  textBright: '#e8ecf4',
  green: '#34d399',
  greenDim: '#065f46',
  amber: '#fbbf24',
  amberDim: '#78350f',
  red: '#f87171',
  redDim: '#7f1d1d',
  cyan: '#22d3ee',
  cyanDim: '#164e63',
  purple: '#a78bfa',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
} as const;

const s = {
  root: {
    background: C.bg,
    color: C.text,
    fontFamily: C.mono,
    fontSize: 12,
    lineHeight: 1.6,
    padding: 0,
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    overflow: 'hidden',
  } as React.CSSProperties,

  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: `1px solid ${C.border}`,
    background: C.surface,
  } as React.CSSProperties,

  topbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as React.CSSProperties,

  dot: (color: string) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    boxShadow: `0 0 6px ${color}40`,
  }) as React.CSSProperties,

  topbarTitle: {
    color: C.textDim,
    fontSize: 11,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  topbarSeverity: (sev: string) => ({
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 4,
    background: sev === 'HIGH' ? C.redDim : sev === 'MEDIUM' ? C.amberDim : C.greenDim,
    color: sev === 'HIGH' ? C.red : sev === 'MEDIUM' ? C.amber : C.green,
    letterSpacing: '0.04em',
  }) as React.CSSProperties,

  content: {
    padding: '16px 16px 0',
  } as React.CSSProperties,

  banner: {
    marginBottom: 14,
    padding: '8px 12px',
    borderRadius: 4,
    background: C.amberDim,
    border: `1px solid ${C.amber}30`,
    color: C.amber,
    fontSize: 11,
  } as React.CSSProperties,

  promptLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 2,
  } as React.CSSProperties,

  prompt: {
    color: C.green,
    fontWeight: 700,
  } as React.CSSProperties,

  headerTitle: {
    margin: '0 0 4px',
    fontSize: 14,
    fontWeight: 600,
    color: C.textBright,
    fontFamily: C.mono,
  } as React.CSSProperties,

  meta: {
    display: 'flex',
    gap: 16,
    color: C.textDim,
    fontSize: 11,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: `1px solid ${C.border}`,
  } as React.CSSProperties,

  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  } as React.CSSProperties,

  metaDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: C.borderBright,
  } as React.CSSProperties,

  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
    color: C.textDim,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
  } as React.CSSProperties,

  sectionLine: {
    flex: 1,
    height: 1,
    background: C.border,
  } as React.CSSProperties,

  changeRow: (breaking: boolean) => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '8px 10px',
    marginBottom: 2,
    borderRadius: 4,
    background: breaking ? `${C.red}08` : `${C.green}08`,
    borderLeft: `2px solid ${breaking ? C.red : C.green}`,
    transition: 'background 100ms ease-out',
  }) as React.CSSProperties,

  changeIcon: (breaking: boolean) => ({
    flexShrink: 0,
    width: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    background: breaking ? C.redDim : C.greenDim,
    color: breaking ? C.red : C.green,
    fontSize: 10,
    fontWeight: 700,
    marginTop: 1,
  }) as React.CSSProperties,

  changeBody: {
    flex: 1,
    minWidth: 0,
  } as React.CSSProperties,

  changeCode: {
    color: C.textBright,
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 2,
  } as React.CSSProperties,

  changeOp: {
    color: C.textDim,
    fontSize: 11,
    marginBottom: 2,
  } as React.CSSProperties,

  changeRationale: {
    margin: 0,
    color: C.text,
    fontSize: 11,
    lineHeight: 1.5,
  } as React.CSSProperties,

  evidenceRow: {
    padding: '8px 10px',
    marginBottom: 2,
    borderRadius: 4,
    background: C.surface,
    border: `1px solid ${C.border}`,
  } as React.CSSProperties,

  evidenceTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  } as React.CSSProperties,

  evidenceRepo: {
    color: C.cyan,
    fontSize: 12,
    fontWeight: 600,
  } as React.CSSProperties,

  evidenceBadge: (impact: boolean) => ({
    fontSize: 9,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 3,
    background: impact ? C.redDim : C.greenDim,
    color: impact ? C.red : C.green,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
  }) as React.CSSProperties,

  evidencePath: {
    color: C.textDim,
    fontSize: 10,
    marginBottom: 4,
  } as React.CSSProperties,

  evidenceReason: {
    margin: 0,
    color: C.text,
    fontSize: 11,
    lineHeight: 1.5,
  } as React.CSSProperties,

  limitations: {
    padding: '8px 12px',
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    margin: 0,
    paddingLeft: 20,
    fontSize: 11,
    color: C.textDim,
  } as React.CSSProperties,

  actionsBar: {
    marginTop: 16,
    padding: '14px 16px',
    borderTop: `1px solid ${C.border}`,
    background: C.surface,
  } as React.CSSProperties,

  textarea: {
    width: '100%',
    minHeight: 56,
    padding: '8px 10px',
    borderRadius: 4,
    border: `1px solid ${C.borderBright}`,
    background: C.bg,
    color: C.text,
    fontSize: 11,
    fontFamily: C.mono,
    lineHeight: 1.5,
    resize: 'vertical' as const,
    outline: 'none',
    boxSizing: 'border-box' as const,
    marginBottom: 10,
  } as React.CSSProperties,

  buttonRow: {
    display: 'flex',
    gap: 8,
  } as React.CSSProperties,

  btn: (variant: 'green' | 'red' | 'ghost', disabled: boolean) => ({
    padding: '6px 12px',
    border: variant === 'ghost' ? `1px solid ${C.borderBright}` : 'none',
    borderRadius: 4,
    background: disabled
      ? C.border
      : variant === 'green'
        ? C.greenDim
        : variant === 'red'
          ? C.redDim
          : 'transparent',
    color: disabled
      ? C.textDim
      : variant === 'green'
        ? C.green
        : variant === 'red'
          ? C.red
          : C.text,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: C.mono,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'opacity 100ms ease-out',
    letterSpacing: '0.02em',
  }) as React.CSSProperties,

  hint: {
    marginTop: 6,
    color: C.textDim,
    fontSize: 10,
  } as React.CSSProperties,

  errorBox: {
    marginTop: 10,
    padding: '8px 10px',
    borderRadius: 4,
    background: C.redDim,
    border: `1px solid ${C.red}30`,
    color: C.red,
    fontSize: 11,
  } as React.CSSProperties,

  errorBtn: {
    marginTop: 6,
    padding: '4px 8px',
    border: `1px solid ${C.borderBright}`,
    borderRadius: 3,
    background: 'transparent',
    color: C.text,
    fontSize: 10,
    fontFamily: C.mono,
    cursor: 'pointer',
  } as React.CSSProperties,

  decisionBox: {
    marginTop: 16,
    padding: '10px 12px',
    borderRadius: 4,
    background: C.greenDim,
    border: `1px solid ${C.green}30`,
  } as React.CSSProperties,

  decisionLabel: {
    color: C.green,
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4,
  } as React.CSSProperties,

  decisionReason: {
    margin: 0,
    color: C.text,
    fontSize: 11,
    lineHeight: 1.5,
  } as React.CSSProperties,

  loading: {
    padding: 20,
    color: C.textDim,
    fontSize: 11,
  } as React.CSSProperties,
};

export default function ApiImpactSummary() {
  const { isReady, getToolOutput, callTool, sendFollowUpMessage } = useWidgetSDK();

  const sdkOutput = isReady ? unwrapToolResult(getToolOutput()) : null;
  const [data, setData] = useState<Assessment | null>(sdkOutput ?? PREVIEW_DATA);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPreviewMode = !isReady;

  useEffect(() => {
    if (isReady) {
      const live = unwrapToolResult(getToolOutput());
      if (live) setData(live);
    }
  }, [isReady]);

  async function callDecision(decision: 'APPROVE' | 'BLOCK') {
    if (!data || isPreviewMode) return;
    setBusy(true);
    setError('');
    try {
      const result = await callTool('record_release_decision', {
        assessmentId: data.id,
        expectedVersion: data.version,
        decision,
        reason: decision === 'BLOCK' ? reason : undefined,
        idempotencyKey: `${data.id}:${decision.toLowerCase()}:v${data.version}`
      });
      const updated = unwrapToolResult(result);
      if (updated) setData(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function sendFallback() {
    if (!data) return;
    try {
      await sendFollowUpMessage(`Block assessment ${data.id} because ${reason}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  if (!data) return <div style={s.loading}>{'>'} loading assessment...</div>;

  const breakingCount = data.changes.filter(c => c.breaking).length;
  const compatibleCount = data.changes.filter(c => !c.breaking).length;

  return (
    <div style={s.root}>
      <div style={s.topbar}>
        <div style={s.topbarLeft}>
          <div style={s.dot(C.red)} />
          <div style={s.dot(C.amber)} />
          <div style={s.dot(C.green)} />
          <span style={s.topbarTitle}>APIGuard</span>
        </div>
        <span style={s.topbarSeverity(data.overallSeverity)}>
          {data.overallSeverity}
        </span>
      </div>

      <div style={s.content}>
        {isPreviewMode && (
          <div style={s.banner}>
            {'!'} PREVIEW — open via NitroStack Studio for live data
          </div>
        )}

        <div style={s.promptLine}>
          <span style={s.prompt}>{'>'}</span>
          <span style={{ color: C.textBright, fontWeight: 600 }}>impact-assessment</span>
        </div>
        <h1 style={s.headerTitle}>{data.id}</h1>

        <div style={s.meta}>
          <span style={s.metaItem}>
            <span style={s.metaDot} />
            {data.sourceMode}
          </span>
          <span style={s.metaItem}>
            <span style={s.metaDot} />
            {data.classifierMode}
          </span>
          <span style={s.metaItem}>
            <span style={s.metaDot} />
            {data.durationMs}ms
          </span>
          <span style={s.metaItem}>
            <span style={s.metaDot} />
            {data.decisionStatus}
          </span>
        </div>

        <div style={s.sectionHeader}>
          <span>CHANGES</span>
          <span style={{ color: C.red, fontSize: 10 }}>{breakingCount} breaking</span>
          <span style={{ color: C.green, fontSize: 10 }}>{compatibleCount} compatible</span>
          <div style={s.sectionLine} />
        </div>
        {data.changes.map(change => (
          <div key={change.id} style={s.changeRow(change.breaking)}>
            <div style={s.changeIcon(change.breaking)}>
              {change.breaking ? '!' : '~'}
            </div>
            <div style={s.changeBody}>
              <div style={s.changeCode}>{change.code}</div>
              <div style={s.changeOp}>{change.operation}{change.jsonPath ? ` \u00b7 ${change.jsonPath}` : ''}</div>
              <p style={s.changeRationale}>{change.rationale}</p>
            </div>
          </div>
        ))}

        <div style={s.sectionHeader}>
          <span>EVIDENCE</span>
          <div style={s.sectionLine} />
        </div>
        {data.evidence.map(ev => (
          <div key={ev.id} style={s.evidenceRow}>
            <div style={s.evidenceTop}>
              <span style={s.evidenceRepo}>{ev.repository}</span>
              <span style={s.evidenceBadge(ev.classification.includes('IMPACT'))}>
                {ev.classification}
              </span>
            </div>
            <div style={s.evidencePath}>{ev.filePath}:{ev.lineStart} @ {ev.commitSha.slice(0, 8)}</div>
            <p style={s.evidenceReason}>{ev.reasoning}</p>
          </div>
        ))}

        {data.limitations.length > 0 && (
          <>
            <div style={s.sectionHeader}>
              <span>LIMITATIONS</span>
              <div style={s.sectionLine} />
            </div>
            <ul style={s.limitations}>
              {data.limitations.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </>
        )}
      </div>

      {data.decisionStatus === 'PENDING' ? (
        <div style={s.actionsBar}>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder="block reason..."
            style={s.textarea}
          />
          <div style={s.buttonRow}>
            <button
              disabled={busy || isPreviewMode}
              onClick={() => callDecision('APPROVE')}
              style={s.btn('green', busy || isPreviewMode)}
            >
              [ approve ]
            </button>
            <button
              disabled={busy || isPreviewMode}
              onClick={() => callDecision('BLOCK')}
              style={s.btn('red', busy || isPreviewMode)}
            >
              [ block ]
            </button>
          </div>
          {isPreviewMode && <div style={s.hint}>disabled in preview — open via Studio</div>}
          {error && (
            <div style={s.errorBox}>
              {error}
              <br />
              <button onClick={sendFallback} style={s.errorBtn}>fallback: send-chat</button>
            </div>
          )}
        </div>
      ) : (
        <div style={s.actionsBar}>
          <div style={s.decisionBox}>
            <div style={s.decisionLabel}>{'>>'} {data.decisionStatus}</div>
            {data.decision?.reason && <p style={s.decisionReason}>{data.decision.reason}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
