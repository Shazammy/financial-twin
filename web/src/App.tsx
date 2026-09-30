import { useCallback, useEffect, useRef, useState } from 'react';
import { type CommunityDeal, type ConsentKey, type Decision, type Me, type FeedStatus, type Nudge, ApiError, api, eur } from './api';
import { Login } from './Login';
import { Phone } from './Phone';

const CONSENT_LABELS: Record<ConsentKey, string> = {
  transactions: 'Transactions and app use',
  news: 'Market news',
  location: 'Location',
  community: 'Community matching',
};

const GOAL_LABELS: Record<string, string> = {
  'heat-pump': 'Heat pump',
  'first-home': 'First home',
  car: 'Car',
  'retire-early': 'Retire early',
  'kids-education': "Kids' education",
};

const MONEY_SIGNALS = [
  { label: 'Scan transactions', body: { type: 'scan' } },
  { label: 'News: ASML −8%', body: { type: 'news', ticker: 'ASML', changePct: -8, headline: 'ASML falls after new chip export restrictions' } },
  { label: 'Salary +15%', body: { type: 'salary', changePct: 15 } },
  { label: 'Location: Barcelona', body: { type: 'location', place: 'Barcelona' } },
];

const LIFE_EVENTS = [
  { label: 'Looking for a car', body: { type: 'life-event', event: 'car-search' } },
  { label: 'New baby', body: { type: 'life-event', event: 'new-baby' } },
  { label: 'Moving house', body: { type: 'life-event', event: 'moving' } },
  { label: 'Death in the family', body: { type: 'life-event', event: 'bereavement' } },
];

const time = (iso: string) => new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function App() {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [deals, setDeals] = useState<CommunityDeal[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [feed, setFeed] = useState<FeedStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      const [meData, nudgeData, dealData, logData, feedData] = await Promise.all([
        api<Me>('/me', t),
        api<Nudge[]>('/me/nudges', t),
        api<CommunityDeal[]>('/me/community', t),
        api<Decision[]>('/me/agent-log', t),
        api<FeedStatus>('/me/signal-feed', t),
      ]);
      setMe(meData);
      setNudges(nudgeData);
      setDeals(dealData);
      setDecisions(logData);
      setFeed(feedData);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setToken(null);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setMe(null);
      setNudges([]);
      setDecisions([]);
      return;
    }
    // The twin is live from the moment you log in: in the demo, the simulated signal feed starts once.
    api<FeedStatus>('/me/signal-feed', token)
      .then((status) => (status.available && !status.running && status.step === 0 ? api('/me/signal-feed/start', token, { method: 'POST' }) : null))
      .catch(() => undefined);
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [token, refresh]);

  if (!token) return <Login onLogin={setToken} />;
  if (!me) return <div className="loading">Loading your twin…</div>;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const fire = (body: object) => run(() => api('/me/simulate', token, { method: 'POST', body }));
  const findPools = () => run(() => api('/me/community/announce', token, { method: 'POST' }));
  const join = (dealId: string) => run(() => api(`/me/community/${encodeURIComponent(dealId)}/join`, token, { method: 'POST' }));
  const toggleConsent = (key: ConsentKey) => run(() => api('/me/consents', token, { method: 'PUT', body: { [key]: !me.consents[key] } }));
  const replayFeed = () => run(() => api('/me/signal-feed/start', token, { method: 'POST' }));

  async function logout() {
    await api('/logout', token, { method: 'POST' }).catch(() => undefined);
    setToken(null);
  }

  const joinedDeals = new Set(deals.filter((d) => d.joined).map((d) => d.id));

  return (
    <div className="app">
      <header className="topbar">
        <img src="/kbc-logo.svg" alt="KBC" width={36} height={36} />
        <strong>Financial Twin</strong>
        <span className="motto">Samen staan we sterker</span>
        <span className="spacer" />
        <span>{me.name}</span>
        <button type="button" className="ghost" onClick={logout}>Log out</button>
      </header>

      <main className="layout">
        <section className="column">
          <div className="card twin">
            <span className="eyebrow">Financial twin</span>
            <h2>{me.name}, {me.age}</h2>
            <p className="muted">{me.lifeStage} · {me.neighbourhood}</p>
            <div className="goals">
              {me.goals.map((g) => <span key={g} className="chip goal">{GOAL_LABELS[g] ?? g}</span>)}
            </div>
            <div className="networth">
              <span className="muted">Net worth</span>
              <strong>{eur(me.netWorth.total)}</strong>
            </div>
            <dl className="breakdown">
              <div><dt>Current account</dt><dd>{eur(me.netWorth.current)}</dd></div>
              <div><dt>Savings</dt><dd>{eur(me.netWorth.savings)}</dd></div>
              <div><dt>Investments</dt><dd>{eur(me.netWorth.investments)}</dd></div>
            </dl>
          </div>

          <div className="card">
            <span className="eyebrow">What your twin may use</span>
            <div className="consents">
              {(Object.keys(CONSENT_LABELS) as ConsentKey[]).map((key) => (
                <label key={key} className="switch">
                  <input id={`consent-${key}`} type="checkbox" checked={me.consents[key]} onChange={() => toggleConsent(key)} />
                  <span>{CONSENT_LABELS[key]}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <span className="eyebrow">Your twin is live</span>
            <div className="live">
              <span className="status">
                {feed?.running && <span className="pulse" aria-hidden="true" />}
                {feed?.running
                  ? `Watching your accounts, the markets and life events · signal ${feed.step} of ${feed.total}`
                  : 'All caught up. Your twin keeps watching and contacts you when something is worth it.'}
              </span>
              {feed?.available && !feed.running && (
                <button type="button" className="replay" disabled={busy} onClick={replayFeed}>Replay signals (demo)</button>
              )}
            </div>
            <span className="eyebrow">Your twin's decisions</span>
            {decisions.length === 0 ? (
              <p className="muted">Nothing yet. Your twin only acts when there is something worth it.</p>
            ) : (
              <ol className="agent-log">
                {decisions.map((d) => (
                  <li key={`${d.at}-${d.detail}`}>
                    <span className={`outcome ${d.outcome}`}>{d.outcome}</span>
                    <span>
                      <span className="signal">{d.signal}</span> · <span className="muted">{time(d.at)}</span>
                      <br />
                      <span className="detail">{d.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {me.demoMode && (
            <div className="card">
              <span className="eyebrow">Demo: fire a signal yourself</span>
              <div className="signal-group">
                <span>Money signals</span>
                <div className="signals">
                  {MONEY_SIGNALS.map((s) => (
                    <button key={s.label} type="button" disabled={busy} onClick={() => fire(s.body)}>{s.label}</button>
                  ))}
                  <button type="button" disabled={busy} onClick={findPools}>Find people to pool with</button>
                </div>
              </div>
              <div className="signal-group">
                <span>Life events</span>
                <div className="signals">
                  {LIFE_EVENTS.map((s) => (
                    <button key={s.label} type="button" disabled={busy} onClick={() => fire(s.body)}>{s.label}</button>
                  ))}
                </div>
              </div>
              {error && <p className="error">{error}</p>}
            </div>
          )}
        </section>

        <section className="column phone-column">
          <Phone nudges={nudges} joinedDeals={joinedDeals} onJoin={join} />
        </section>
      </main>
    </div>
  );
}
