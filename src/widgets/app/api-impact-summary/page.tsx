'use client';

import { useMemo, useState } from 'react';
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

function unwrapToolResult(value: unknown): Assessment {
  const candidate = value as { structuredContent?: unknown; data?: unknown };
  return (candidate?.structuredContent ?? candidate?.data ?? value) as Assessment;
}

export default function ApiImpactSummary() {
  const { isReady, getToolOutput, callTool, sendFollowUpMessage } = useWidgetSDK();
  const initial = getToolOutput<Assessment>();
  const [data, setData] = useState<Assessment | null>(initial ?? null);
  const [reason, setReason] = useState('The React and Python consumers still rely on the old contract.');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tone = useMemo(
    () => data?.overallSeverity === 'HIGH' ? '#b42318' : data?.overallSeverity === 'MEDIUM' ? '#b54708' : '#067647',
    [data]
  );

  async function callDecision(decision: 'APPROVE' | 'BLOCK') {
    if (!data) return;
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
      setData(unwrapToolResult(result));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function sendFallback() {
    if (!data) return;
    const instruction = `Block assessment ${data.id} because ${reason}`;
    try {
      await sendFollowUpMessage(instruction);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  if (!isReady || !data) return <div style={{ padding: 20 }}>Loading APIGuard assessment…</div>;

  return (
    <main style={{ padding: 18, border: '1px solid rgba(120,130,150,.28)', borderRadius: 16, background: '#fff', color: '#172033', boxShadow: '0 10px 30px rgba(20,30,55,.08)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: '#475467' }}>APIGUARD RELEASE EVIDENCE</div>
          <h1 style={{ margin: '6px 0 4px', fontSize: 24 }}>Consumer impact assessment</h1>
          <div style={{ color: '#667085', fontSize: 13 }}>{data.id}</div>
        </div>
        <div style={{ background: tone, color: 'white', fontWeight: 800, padding: '8px 12px', borderRadius: 999 }}>{data.overallSeverity}</div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 16 }}>
        {([['Evidence', data.sourceMode], ['Classifier', data.classifierMode], ['Decision', data.decisionStatus]] as const).map(([key, value]) => (
          <div key={key} style={{ padding: 12, borderRadius: 12, background: '#f2f4f7' }}>
            <div style={{ fontSize: 11, color: '#667085', textTransform: 'uppercase' }}>{key}</div>
            <strong style={{ fontSize: 13 }}>{value}</strong>
          </div>
        ))}
      </section>

      <h2 style={{ fontSize: 16, marginTop: 20 }}>Contract changes</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {data.changes.map((change) => (
          <article key={change.id} style={{ padding: 12, borderLeft: `4px solid ${change.breaking ? '#d92d20' : '#12b76a'}`, background: '#f9fafb', borderRadius: 8 }}>
            <strong>{change.code}</strong>
            <div style={{ fontSize: 13, color: '#475467' }}>{change.operation} {change.jsonPath ?? ''}</div>
            <p style={{ margin: '5px 0 0', fontSize: 13 }}>{change.rationale}</p>
          </article>
        ))}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 20 }}>Consumer evidence</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {data.evidence.map((evidence) => (
          <article key={evidence.id} style={{ padding: 12, border: '1px solid #eaecf0', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <strong>{evidence.repository}</strong><span style={{ fontSize: 12, fontWeight: 800 }}>{evidence.classification}</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#475467', marginTop: 4 }}>{evidence.filePath}:{evidence.lineStart} · {evidence.commitSha.slice(0, 8)}</div>
            <p style={{ fontSize: 13, marginBottom: 0 }}>{evidence.reasoning}</p>
          </article>
        ))}
      </div>

      {data.limitations.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, marginTop: 20 }}>Limitations</h2>
          <ul style={{ paddingLeft: 20, fontSize: 13 }}>{data.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </>
      )}

      {data.decisionStatus === 'PENDING' ? (
        <section style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #eaecf0' }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>Block reason</label>
          <textarea value={reason} onChange={(event: { target: { value: string } }) => setReason(event.target.value)} rows={2} style={{ width: '100%', margin: '6px 0 10px', padding: 10, borderRadius: 8, border: '1px solid #d0d5dd' }} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button disabled={busy} onClick={() => callDecision('APPROVE')} style={{ padding: '9px 14px', border: 0, borderRadius: 8, background: '#067647', color: 'white', fontWeight: 800 }}>Approve</button>
            <button disabled={busy} onClick={() => callDecision('BLOCK')} style={{ padding: '9px 14px', border: 0, borderRadius: 8, background: '#b42318', color: 'white', fontWeight: 800 }}>Block pending migration</button>
          </div>
          {error && (
            <div style={{ marginTop: 10, color: '#b42318', fontSize: 13 }}>
              {error}
              <br />
              <button onClick={sendFallback} style={{ marginTop: 8, padding: '7px 10px' }}>Send typed-chat fallback</button>
            </div>
          )}
        </section>
      ) : (
        <section style={{ marginTop: 20, padding: 14, borderRadius: 10, background: '#ecfdf3' }}>
          <strong>{data.decisionStatus}</strong>
          {data.decision?.reason && <p style={{ marginBottom: 0 }}>{data.decision.reason}</p>}
        </section>
      )}
    </main>
  );
}
