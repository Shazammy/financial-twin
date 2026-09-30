import { useEffect, useRef, useState } from 'react';
import { type Nudge, eur } from './api';

function ImpactChip({ nudge }: { nudge: Nudge }) {
  if (!nudge.impact) {
    const label = nudge.kind === 'bereavement' ? 'Care' : nudge.kind === 'news' ? 'Info, not advice' : 'Check';
    return <span className="chip info">{label}</span>;
  }
  const prefix = nudge.impact.period.startsWith('in ') || nudge.impact.period.startsWith('at ') ? '' : '+';
  return <span className="chip gain">{prefix}{eur(nudge.impact.eur)} {nudge.impact.period}</span>;
}

function Bubble({ nudge, joined, onJoin }: { nudge: Nudge; joined: boolean; onJoin: (dealId: string) => void }) {
  const [showWhy, setShowWhy] = useState(false);
  const time = new Date(nudge.createdAt).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`bubble ${nudge.kind === 'bereavement' ? 'care' : ''}`}>
      {nudge.channel !== 'WhatsApp' && <span className="channel">Sent in {nudge.channel}, not WhatsApp</span>}
      <div className="bubble-head">
        <strong>{nudge.title}</strong>
        <ImpactChip nudge={nudge} />
      </div>
      <p>{nudge.body}</p>
      <button type="button" className="why-toggle" onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy}>
        {showWhy ? 'Hide why' : 'Why am I seeing this?'}
      </button>
      {showWhy && (
        <ul className="why">
          {nudge.why.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      <div className="bubble-foot">
        {nudge.action.kind === 'join-deal' && nudge.action.dealId ? (
          <button type="button" className="action" disabled={joined} onClick={() => onJoin(nudge.action.dealId!)}>
            {joined ? 'Joined anonymously ✓' : nudge.action.label}
          </button>
        ) : (
          <span className="action-link">{nudge.action.label} →</span>
        )}
        <span className="time">{time}</span>
      </div>
    </div>
  );
}

export function Phone({ nudges, joinedDeals, onJoin }: { nudges: Nudge[]; joinedDeals: Set<string>; onJoin: (dealId: string) => void }) {
  const yearlyFound = nudges
    .filter((n) => n.impact?.period === 'per year')
    .reduce((sum, n) => sum + (n.impact?.eur ?? 0), 0);
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [nudges.length]);

  const oneOffFound = nudges
    .filter((n) => n.impact?.period === 'one-off')
    .reduce((sum, n) => sum + (n.impact?.eur ?? 0), 0);

  return (
    <div className="phone" aria-label="Customer phone">
      <div className="phone-header">
        <img src="/kbc-logo.svg" alt="" width={32} height={32} />
        <div>
          <strong>Kate</strong>
          <span>KBC · via WhatsApp</span>
        </div>
      </div>
      <div className="found-bar">
        Kate found <strong>{eur(yearlyFound)}/year</strong>
        {oneOffFound > 0 && <> + <strong>{eur(oneOffFound)}</strong> one-off</>} for you
      </div>
      <div className="chat" ref={chatRef}>
        {nudges.length === 0 && <p className="chat-empty">No messages yet. Fire a signal from the control room.</p>}
        {nudges.map((n) => (
          <Bubble key={n.id} nudge={n} joined={!!n.action.dealId && joinedDeals.has(n.action.dealId)} onJoin={onJoin} />
        ))}
      </div>
      <div className="phone-foot">Tips and alerts only. Invoices and offers open in KBC Mobile.</div>
    </div>
  );
}
