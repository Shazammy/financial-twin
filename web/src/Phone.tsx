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
    <div className={`bubble ${nudge.kind === 'bereavement' ? 'care' : nudge.kind === 'match' ? 'match' : ''}`}>
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
  // The same saving can reach the customer twice (e.g. car search and borrower pool); count it once.
  const uniqueImpacts = new Map(nudges.flatMap((n) => (n.impact ? [[`${Math.round(n.impact.eur)}|${n.impact.period}`, n.impact] as const] : [])));
  const sumFor = (period: string) => [...uniqueImpacts.values()].filter((i) => i.period === period).reduce((sum, i) => sum + i.eur, 0);
  const yearlyFound = sumFor('per year');

  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' });
  }, [nudges.length]);

  const oneOffFound = sumFor('one-off');

  return (
    <div className="phone" aria-label="Customer phone">
      <div className="phone-header">
        <img src="/kbc-logo.svg" alt="" width={32} height={32} />
        <div>
          <strong>Your Financial Twin</strong>
          <span>KBC · via WhatsApp</span>
        </div>
      </div>
      <div className="found-bar">
        Your twin found <strong>{eur(yearlyFound)}/year</strong>
        {oneOffFound > 0 && <> + <strong>{eur(oneOffFound)}</strong> one-off</>} for you
      </div>
      <div className="chat" ref={chatRef}>
        {nudges.length === 0 && <p className="chat-empty">No messages yet. Your twin contacts you when something is worth it.</p>}
        {nudges.map((n) => (
          <Bubble key={n.id} nudge={n} joined={!!n.action.dealId && joinedDeals.has(n.action.dealId)} onJoin={onJoin} />
        ))}
      </div>
      <div className="phone-foot">Tips and alerts only. Invoices and offers open in KBC Mobile.</div>
    </div>
  );
}
