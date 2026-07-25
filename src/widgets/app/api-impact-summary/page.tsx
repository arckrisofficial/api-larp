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
  evidenceSnapshotId?: string;
  repositoryCommits?: Record<string, string>;
  repositoriesExpected?: string[];
  repositoriesChecked?: string[];
  coverageRatio?: number;
  durationMs: number;
  createdAt: string;
  changes: Array<{ id: string; code: string; breaking: boolean; operation: string; jsonPath?: string; rationale: string }>;
  evidence: Array<{ id: string; capturedAt?: string; repository: string; filePath: string; lineStart: number; classification: string; confidence: string; reasoning: string; commitSha: string }>;
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
  evidenceSnapshotId: 'snap_fixture_risky',
  repositoryCommits: {
    'bundled-fixtures/react-consumer': 'b71d00401b3a',
    'bundled-fixtures/python-consumer': '3b1be8e5a705',
    'bundled-fixtures/go-consumer': 'a87772a3a9f0'
  },
  repositoriesExpected: ['bundled-fixtures/react-consumer', 'bundled-fixtures/python-consumer', 'bundled-fixtures/go-consumer'],
  repositoriesChecked: ['bundled-fixtures/react-consumer', 'bundled-fixtures/python-consumer', 'bundled-fixtures/go-consumer'],
  coverageRatio: 1,
  durationMs: 2,
  createdAt: new Date().toISOString(),
  changes: [
    { id: 'chg_preview_1', code: 'PROPERTY_TYPE_CHANGED', breaking: true, operation: 'GET /api/user', jsonPath: '$response.id', rationale: 'The consumer-visible schema type changed from integer to string.' },
    { id: 'chg_preview_2', code: 'REQUIRED_PROPERTY_REMOVED', breaking: true, operation: 'GET /api/user', jsonPath: '$response.name', rationale: 'Required property name was removed.' },
    { id: 'chg_preview_3', code: 'ENUM_WIDENED', breaking: true, operation: 'GET /api/user', jsonPath: '$response.status', rationale: 'New response enum values may break exhaustive consumer handling: suspended.' },
    { id: 'chg_preview_4', code: 'OPTIONAL_PROPERTY_ADDED', breaking: false, operation: 'GET /api/user', jsonPath: '$response.fullName', rationale: 'Optional property fullName was added and is backward compatible.' },
  ],
  evidence: [
    { id: 'ev-react-name', repository: 'react-consumer', filePath: 'src/api/userProfile.ts', lineStart: 4, classification: 'CONFIRMED_IMPACT', confidence: 'MEDIUM', reasoning: 'Production consumer reads the removed response.name field.', commitSha: 'b71d00401b3a' },
    { id: 'ev-python-id', repository: 'python-consumer', filePath: 'app/models/user.py', lineStart: 8, classification: 'CONFIRMED_IMPACT', confidence: 'MEDIUM', reasoning: 'Type annotation int will fail when id becomes a string.', commitSha: '3b1be8e5a705' },
    { id: 'ev-go-status', repository: 'go-consumer', filePath: 'client/user.go', lineStart: 8, classification: 'CONFIRMED_IMPACT', confidence: 'MEDIUM', reasoning: 'Exhaustive switch on status will panic on new enum value "suspended".', commitSha: 'a87772a3a9f0' },
  ],
  limitations: [
    'Preview mode — run_impact_assessment via Studio for live data.',
    'LLM classification is disabled; deterministic fallback was used.',
  ],
};

function unwrapToolResult(value: unknown): Assessment | null {
  if (!value) return null;
  const candidate = value as { structuredContent?: unknown; data?: unknown };
  return (candidate?.structuredContent ?? candidate?.data ?? value) as Assessment;
}

const severityColor = { HIGH: '#b42318', MEDIUM: '#b54708', LOW: '#067647' } as const;

const styles = {
  widget: {
    padding: 24,
    border: '1px solid #e4e7ec',
    borderRadius: 10,
    background: '#ffffff',
    color: '#101828',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 14,
    lineHeight: 1.5,
    boxShadow: '0 1px 3px rgba(16,24,40,.1), 0 1px 2px rgba(16,24,40,.06)',
  } as React.CSSProperties,
  banner: {
    marginBottom: 20,
    padding: '10px 14px',
    borderRadius: 8,
    background: '#fffaeb',
    border: '1px solid #f79009',
    fontSize: 12,
    color: '#b54708',
    lineHeight: 1.5,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  } as React.CSSProperties,
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#667085',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    color: '#101828',
    lineHeight: 1.3,
  } as React.CSSProperties,
  assessmentId: {
    marginTop: 4,
    fontSize: 13,
    color: '#667085',
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  } as React.CSSProperties,
  badge: (severity: keyof typeof severityColor) => ({
    background: severityColor[severity],
    color: '#ffffff',
    fontWeight: 800,
    fontSize: 11,
    padding: '6px 12px',
    borderRadius: 999,
    letterSpacing: '0.02em',
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  }) as React.CSSProperties,
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
    marginTop: 24,
  } as React.CSSProperties,
  stat: {
    padding: 14,
    borderRadius: 8,
    background: '#f8f9fb',
    border: '1px solid #eaecf0',
  } as React.CSSProperties,
  statLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: '#667085',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    marginBottom: 4,
  } as React.CSSProperties,
  statValue: {
    fontSize: 13,
    fontWeight: 600,
    color: '#101828',
  } as React.CSSProperties,
  section: {
    marginTop: 28,
  } as React.CSSProperties,
  sectionTitle: {
    margin: '0 0 12px',
    fontSize: 14,
    fontWeight: 600,
    color: '#101828',
    paddingBottom: 8,
    borderBottom: '1px solid #eaecf0',
  } as React.CSSProperties,
  changeCard: (breaking: boolean) => ({
    padding: 14,
    paddingLeft: 16,
    borderLeft: `3px solid ${breaking ? '#d92d20' : '#12b76a'}`,
    background: '#f8f9fb',
    borderRadius: 6,
    marginBottom: 8,
  }) as React.CSSProperties,
  changeCode: {
    fontSize: 12,
    fontWeight: 600,
    color: '#101828',
    marginBottom: 4,
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  } as React.CSSProperties,
  changeOperation: {
    fontSize: 12,
    color: '#475467',
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    marginBottom: 6,
  } as React.CSSProperties,
  changeRationale: {
    margin: 0,
    fontSize: 13,
    color: '#475467',
    lineHeight: 1.5,
  } as React.CSSProperties,
  evidenceCard: {
    padding: 14,
    border: '1px solid #eaecf0',
    borderRadius: 8,
    marginBottom: 8,
  } as React.CSSProperties,
  evidenceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  } as React.CSSProperties,
  evidenceRepo: {
    fontSize: 13,
    fontWeight: 600,
    color: '#101828',
  } as React.CSSProperties,
  evidenceClass: (classification: string) => ({
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: 4,
    background: classification.includes('IMPACT') ? '#fef3f2' : '#f0fdf4',
    color: classification.includes('IMPACT') ? '#b42318' : '#067647',
    letterSpacing: '0.02em',
    textTransform: 'uppercase' as const,
  }) as React.CSSProperties,
  evidencePath: {
    fontSize: 12,
    color: '#475467',
    fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
    marginBottom: 6,
  } as React.CSSProperties,
  evidenceReasoning: {
    margin: 0,
    fontSize: 13,
    color: '#475467',
    lineHeight: 1.5,
  } as React.CSSProperties,
  limitationsList: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 13,
    color: '#475467',
    lineHeight: 1.6,
  } as React.CSSProperties,
  actionsBar: {
    marginTop: 28,
    paddingTop: 20,
    borderTop: '1px solid #eaecf0',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#344054',
    marginBottom: 6,
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    minHeight: 64,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #d0d5dd',
    fontSize: 13,
    color: '#101828',
    background: '#ffffff',
    resize: 'vertical' as const,
    lineHeight: 1.5,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  buttonRow: {
    display: 'flex',
    gap: 10,
    marginTop: 12,
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  button: (variant: 'primary' | 'danger' | 'ghost', disabled: boolean) => ({
    padding: '10px 16px',
    border: variant === 'ghost' ? '1px solid #d0d5dd' : 0,
    borderRadius: 8,
    background: disabled ? '#f2f4f7' : variant === 'primary' ? '#067647' : variant === 'danger' ? '#b42318' : '#ffffff',
    color: disabled ? '#98a2b3' : variant === 'ghost' ? '#344054' : '#ffffff',
    fontWeight: 600,
    fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'background 150ms ease-out, opacity 150ms ease-out',
  }) as React.CSSProperties,
  disabledHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#667085',
  } as React.CSSProperties,
  errorBlock: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    background: '#fef3f2',
    border: '1px solid #fecdca',
    color: '#b42318',
    fontSize: 13,
  } as React.CSSProperties,
  fallbackButton: {
    marginTop: 8,
    padding: '6px 10px',
    border: '1px solid #d0d5dd',
    borderRadius: 6,
    background: '#ffffff',
    color: '#344054',
    fontSize: 12,
    cursor: 'pointer',
  } as React.CSSProperties,
  decisionResult: {
    marginTop: 28,
    padding: 16,
    borderRadius: 8,
    background: '#ecfdf3',
    border: '1px solid #a6f4c5',
  } as React.CSSProperties,
  decisionLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#067647',
    marginBottom: 4,
  } as React.CSSProperties,
  decisionReason: {
    margin: 0,
    fontSize: 13,
    color: '#475467',
    lineHeight: 1.5,
  } as React.CSSProperties,
};

export default function ApiImpactSummary() {
  const { isReady, getToolOutput, callTool, sendFollowUpMessage } = useWidgetSDK();

  const sdkOutput = isReady ? unwrapToolResult(getToolOutput()) : null;
  const [data, setData] = useState<Assessment | null>(sdkOutput ?? PREVIEW_DATA);
  const [reason, setReason] = useState('The React and Python consumers still rely on the old contract.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPreviewMode = !isReady;
  const canApprove = data?.analysisStatus === 'COMPLETE';
  const canBlock = reason.trim().length >= 3;

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

  if (!data) return <div style={{ padding: 20, fontSize: 13, color: '#667085' }}>Loading assessment...</div>;

  return (
    <main style={styles.widget}>
      {isPreviewMode && (
        <div style={styles.banner}>
          Preview mode — open via NitroStack Studio for live assessment data.
        </div>
      )}

      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>APIGuard Release Evidence</div>
          <h1 style={styles.title}>Consumer impact assessment</h1>
          <div style={styles.assessmentId}>{data.id}</div>
        </div>
        <span style={styles.badge(data.overallSeverity)}>
          {data.overallSeverity}
        </span>
      </header>

      <div style={styles.statsGrid}>
        {([
          ['Evidence', data.sourceMode],
          ['Classifier', data.classifierMode],
          ['Decision', data.decisionStatus],
        ] as const).map(([label, value]) => (
          <div key={label} style={styles.stat}>
            <div style={styles.statLabel}>{label}</div>
            <div style={styles.statValue}>{value}</div>
          </div>
        ))}
      </div>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Evidence provenance</h2>
        <div style={styles.changeCard(false)}>
          <div style={styles.changeCode}>{data.sourceMode.toUpperCase()} · {data.evidenceSnapshotId ?? 'snapshot not persisted'}</div>
          <div style={styles.changeOperation}>
            Scope coverage: {data.repositoriesChecked?.length ?? 0}/{data.repositoriesExpected?.length ?? 0}
            {typeof data.coverageRatio === 'number' ? ` (${Math.round(data.coverageRatio * 100)}%)` : ''}
          </div>
          {Object.entries(data.repositoryCommits ?? {}).map(([repository, commit]) => (
            <p key={repository} style={styles.changeRationale}>
              {repository} @ {commit.slice(0, 12)}
            </p>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Contract changes</h2>
        <div>
          {data.changes.map((change) => (
            <div key={change.id} style={styles.changeCard(change.breaking)}>
              <div style={styles.changeCode}>{change.code}</div>
              <div style={styles.changeOperation}>
                {change.operation}{change.jsonPath ? ` \u00b7 ${change.jsonPath}` : ''}
              </div>
              <p style={styles.changeRationale}>{change.rationale}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Consumer evidence</h2>
        <div>
          {data.evidence.map((evidence) => (
            <div key={evidence.id} style={styles.evidenceCard}>
              <div style={styles.evidenceHeader}>
                <span style={styles.evidenceRepo}>{evidence.repository}</span>
                <span style={styles.evidenceClass(evidence.classification)}>
                  {evidence.classification}
                </span>
              </div>
              <div style={styles.evidencePath}>
                {evidence.filePath}:{evidence.lineStart} &middot; {evidence.commitSha.slice(0, 8)}
              </div>
              <p style={styles.evidenceReasoning}>{evidence.reasoning}</p>
            </div>
          ))}
        </div>
      </section>

      {data.limitations.length > 0 && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Limitations</h2>
          <ul style={styles.limitationsList}>
            {data.limitations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {data.decisionStatus === 'PENDING' ? (
        <div style={styles.actionsBar}>
          <label style={styles.label}>Block reason</label>
          <textarea
            value={reason}
            onChange={(e: { target: { value: string } }) => setReason(e.target.value)}
            rows={2}
            style={styles.textarea}
          />
          <div style={styles.buttonRow}>
            <button
              disabled={busy || isPreviewMode || !canApprove}
              onClick={() => callDecision('APPROVE')}
              style={styles.button('primary', busy || isPreviewMode || !canApprove)}
            >
              Approve release
            </button>
            <button
              disabled={busy || isPreviewMode || !canBlock}
              onClick={() => callDecision('BLOCK')}
              style={styles.button('danger', busy || isPreviewMode || !canBlock)}
            >
              Block pending migration
            </button>
          </div>
          {isPreviewMode && (
            <div style={styles.disabledHint}>
              Actions disabled in preview. Open via Studio to interact.
            </div>
          )}
          {!isPreviewMode && !canApprove && (
            <div style={styles.disabledHint}>
              Approval is disabled for {data.analysisStatus} assessments. Resolve missing evidence or warnings first; blocking remains available.
            </div>
          )}
          {error && (
            <div style={styles.errorBlock}>
              {error}
              <br />
              <button onClick={sendFallback} style={styles.fallbackButton}>
                Send typed-chat fallback
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={styles.decisionResult}>
          <div style={styles.decisionLabel}>{data.decisionStatus}</div>
          {data.decision?.reason && (
            <p style={styles.decisionReason}>{data.decision.reason}</p>
          )}
        </div>
      )}
    </main>
  );
}
