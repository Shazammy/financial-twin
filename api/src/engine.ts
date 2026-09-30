import { randomUUID } from 'node:crypto';
import { type Customer, type SignalConsent, TICKERS, customers, holdersByTicker, netWorth } from './data.js';
import { rewriteAsTwin } from './writer.js';

// Illustrative rates for the demo, not real KBC product terms.
const TERM_ACCOUNT_RATE = 0.024;
const CURRENT_ACCOUNT_RATE = 0;
const LONG_TERM_RETURN = 0.04;
const DCC_FEE = 0.03;
const CLASSIC_CAR_LOAN_RATE_PCT = 5.9;
const POOL_CAR_LOAN_RATE_PCT = 4.4;

// Twin policy: when the twin stays quiet.
const MIN_YEARLY_IMPACT_EUR = 50;
const DAILY_MESSAGE_CAP = 6;
const QUIET_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const TOP_PER_SCAN = 2;

export interface Impact {
  eur: number;
  period: string;
}

export type NudgeKind =
  | 'news' | 'idle-cash' | 'subscription' | 'salary' | 'travel' | 'community'
  | 'car-search' | 'new-baby' | 'bereavement' | 'moving' | 'match';

export type Channel = 'WhatsApp' | 'KBC Mobile';

export interface Nudge {
  id: string;
  kind: NudgeKind;
  title: string;
  body: string;
  impact: Impact | null;
  why: string[];
  action: { label: string; kind: 'open-app' | 'join-deal'; dealId?: string };
  channel: Channel;
  createdAt: string;
}

export interface Decision {
  at: string;
  signal: string;
  outcome: 'SEND' | 'HOLD' | 'OBSERVE';
  detail: string;
}

export type Draft = Omit<Nudge, 'id' | 'createdAt' | 'channel'> & { channel?: Channel; rankEurPerYear: number };

// Offers are paused during a quiet period; care messages are not.
const SALES_KINDS = new Set<NudgeKind>(['idle-cash', 'subscription', 'salary', 'community', 'car-search', 'new-baby']);

const inbox = new Map<string, Nudge[]>();
const decisions = new Map<string, Decision[]>();
const quietUntil = new Map<string, number>();

export function nudgesFor(customerId: string): Nudge[] {
  return inbox.get(customerId) ?? [];
}

export function decisionsFor(customerId: string): Decision[] {
  return decisions.get(customerId) ?? [];
}

export function logDecision(customerId: string, signal: string, outcome: Decision['outcome'], detail: string): void {
  const list = [{ at: new Date().toISOString(), signal, outcome, detail }, ...decisionsFor(customerId)];
  decisions.set(customerId, list.slice(0, 50));
}

export const eur = (n: number) => `€${Math.round(n).toLocaleString('nl-BE')}`;

function sentLastDay(customerId: string): number {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return nudgesFor(customerId).filter((n) => Date.parse(n.createdAt) > since).length;
}

function holdReason(c: Customer, d: Draft): string | null {
  if (SALES_KINDS.has(d.kind) && (quietUntil.get(c.id) ?? 0) > Date.now()) {
    return 'quiet period after a death in the family, no offers for 30 days';
  }
  if (SALES_KINDS.has(d.kind) && d.rankEurPerYear < MIN_YEARLY_IMPACT_EUR) {
    return `gain of ${eur(d.rankEurPerYear)}/year is below the ${eur(MIN_YEARLY_IMPACT_EUR)} threshold`;
  }
  // Care messages and confirmations of the customer's own action are never capped.
  if (d.kind !== 'bereavement' && d.kind !== 'match' && sentLastDay(c.id) >= DAILY_MESSAGE_CAP) {
    return `daily limit of ${DAILY_MESSAGE_CAP} messages reached`;
  }
  return null;
}

function describeImpact(impact: Impact | null): string {
  return impact ? ` (+${eur(impact.eur)} ${impact.period})` : '';
}

// Every draft passes the agent policy; the outcome is logged either way.
export async function route(c: Customer, signal: string, drafts: Draft[]): Promise<Nudge[]> {
  const firstName = c.name.split(' ')[0];
  const delivered: Nudge[] = [];
  for (const draft of drafts) {
    const reason = holdReason(c, draft);
    if (reason) {
      logDecision(c.id, signal, 'HOLD', `${draft.title}: ${reason}`);
      continue;
    }
    const { rankEurPerYear: _rank, channel, ...rest } = draft;
    const nudge: Nudge = {
      ...rest,
      channel: channel ?? 'WhatsApp',
      body: await rewriteAsTwin(draft.body, firstName),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    inbox.set(c.id, [...nudgesFor(c.id), nudge]);
    delivered.push(nudge);
    logDecision(c.id, signal, 'SEND', `${draft.title}${describeImpact(draft.impact)} via ${nudge.channel}`);
  }
  return delivered;
}

export function futureValue(monthly: number, yearlyRate: number, years: number): number {
  const r = yearlyRate / 12;
  const n = years * 12;
  return monthly * ((Math.pow(1 + r, n) - 1) / r);
}

export function totalInterest(principal: number, yearlyRatePct: number, months: number): number {
  const r = yearlyRatePct / 100 / 12;
  const payment = (principal * r) / (1 - Math.pow(1 + r, -months));
  return payment * months - principal;
}

// ---- Rules: each returns a draft only when there is something worth saying ----

function idleCash(c: Customer): Draft | null {
  const buffer = c.monthlySpendEur * 3;
  const idle = c.currentAccountEur - buffer;
  if (idle <= 0) return null;
  const gain = idle * (TERM_ACCOUNT_RATE - CURRENT_ACCOUNT_RATE);
  return {
    kind: 'idle-cash',
    title: 'Your money could work harder',
    body: `You have ${eur(idle)} more on your current account than your 3-month buffer of ${eur(buffer)}. On a term account at ${(TERM_ACCOUNT_RATE * 100).toFixed(1)}% that earns about ${eur(gain)} a year.`,
    impact: { eur: gain, period: 'per year' },
    why: [`Current account: ${eur(c.currentAccountEur)}`, `3 months of spending: ${eur(buffer)}`, 'Signal: transactions'],
    action: { label: 'Compare in KBC Mobile', kind: 'open-app' },
    rankEurPerYear: gain,
  };
}

function unusedSubscriptions(c: Customer): Draft | null {
  const unused = c.subscriptions.filter((s) => s.daysSinceLastUse >= 45);
  if (unused.length === 0) return null;
  const yearly = unused.reduce((sum, s) => sum + s.monthlyEur * 12, 0);
  const names = unused.map((s) => `${s.name} (${s.daysSinceLastUse} days unused)`).join(', ');
  return {
    kind: 'subscription',
    title: 'A subscription you may have forgotten',
    body: `You pay for ${names}. Stopping it saves ${eur(yearly)} a year.`,
    impact: { eur: yearly, period: 'per year' },
    why: unused.map((s) => `${s.name}: €${s.monthlyEur}/month, last used ${s.daysSinceLastUse} days ago`).concat('Signal: transactions'),
    action: { label: 'Manage in KBC Mobile', kind: 'open-app' },
    rankEurPerYear: yearly,
  };
}

function salaryRise(c: Customer, changePct: number): Draft | null {
  if (changePct <= 0) return null;
  const extra = c.monthlyIncomeEur * (changePct / 100);
  const monthly = Math.max(50, Math.round((extra * 0.5) / 50) * 50);
  const value = futureValue(monthly, LONG_TERM_RETURN, 10);
  return {
    kind: 'salary',
    title: 'Congratulations on your raise',
    body: `Your salary went up ${changePct}% (about ${eur(extra)} a month). Setting aside ${eur(monthly)} a month at ${LONG_TERM_RETURN * 100}% grows to about ${eur(value)} in 10 years.`,
    impact: { eur: value, period: 'in 10 years' },
    why: [`Salary change: +${changePct}%`, `Half of the raise: ${eur(monthly)}/month`, 'Signal: transactions'],
    action: { label: 'Start a savings plan in KBC Mobile', kind: 'open-app' },
    rankEurPerYear: (value - monthly * 120) / 10,
  };
}

function travel(c: Customer, place: string): Draft {
  const tripSpend = 900;
  const saved = tripSpend * DCC_FEE;
  const insuranceLine = c.hasTravelInsurance ? 'Your travel insurance is active.' : 'You have no travel insurance yet.';
  return {
    kind: 'travel',
    title: `Welcome to ${place}`,
    body: `When a card terminal asks, choose the local currency: paying in EUR abroad adds about ${DCC_FEE * 100}% (${eur(saved)} on a typical ${eur(tripSpend)} trip). ${insuranceLine}`,
    impact: { eur: saved, period: 'one-off' },
    why: [`Location: ${place}`, `Travel insurance: ${c.hasTravelInsurance ? 'yes' : 'no'}`, 'Signal: location'],
    action: { label: c.hasTravelInsurance ? 'View cover in KBC Mobile' : 'Add travel insurance in KBC Mobile', kind: 'open-app' },
    rankEurPerYear: saved,
  };
}

function newsExposure(c: Customer, ticker: string, changePct: number, headline: string): Draft | null {
  const holding = c.holdings.find((h) => h.ticker === ticker);
  if (!holding) return null;
  const share = holding.valueEur / netWorth(c).investments;
  const move = holding.valueEur * (changePct / 100);
  return {
    kind: 'news',
    title: `${holding.name} ${changePct > 0 ? '+' : ''}${changePct}% today`,
    body: `${headline}. ${holding.name} is ${Math.round(share * 100)}% of your portfolio, so today's move is about ${eur(Math.abs(move))} ${move < 0 ? 'down' : 'up'}. This is information, not advice: the decision is yours.`,
    impact: null,
    why: [`You hold ${holding.name}: ${eur(holding.valueEur)}`, `Share of portfolio: ${Math.round(share * 100)}%`, 'Signal: news'],
    action: { label: 'See your portfolio in KBC Mobile', kind: 'open-app' },
    rankEurPerYear: Math.abs(move),
  };
}

function carSearch(c: Customer): Draft {
  const amount = c.loanNeed?.amountEur ?? 15000;
  const months = c.loanNeed?.months ?? 48;
  const saving = totalInterest(amount, CLASSIC_CAR_LOAN_RATE_PCT, months) - totalInterest(amount, POOL_CAR_LOAN_RATE_PCT, months);
  return {
    kind: 'car-search',
    title: 'Looking for a car?',
    body: `Through the twin pool a ${eur(amount)} car loan costs ${POOL_CAR_LOAN_RATE_PCT}% instead of ${CLASSIC_CAR_LOAN_RATE_PCT}%: about ${eur(saving)} less interest over ${months / 12} years. Want a car insurance quote for the same car right away?`,
    impact: { eur: saving, period: 'one-off' },
    why: ['You used the car loan simulator in KBC Mobile twice this week', `Loan: ${eur(amount)} over ${months} months`, 'Signal: app activity'],
    action: { label: 'Get loan + insurance quote in KBC Mobile', kind: 'open-app' },
    rankEurPerYear: saving / (months / 12),
  };
}

function newBaby(c: Customer): Draft {
  const monthly = 25;
  const value = futureValue(monthly, LONG_TERM_RETURN, 18);
  return {
    kind: 'new-baby',
    title: 'Congratulations on your baby!',
    body: `Two things worth doing: add your baby to your hospitalisation insurance, and start a savings plan. ${eur(monthly)} a month from birth grows to about ${eur(value)} by age 18 at ${LONG_TERM_RETURN * 100}%.`,
    impact: { eur: value, period: 'at age 18' },
    why: ['Child benefit (Groeipakket) payments started', 'Purchases at a baby store', 'Signal: transactions'],
    action: { label: 'Start a savings plan in KBC Mobile', kind: 'open-app' },
    rankEurPerYear: (value - monthly * 216) / 18,
  };
}

function bereavement(c: Customer): Draft {
  return {
    kind: 'bereavement',
    title: 'We are sorry for your loss',
    body: `We received the news that your father passed away. There is nothing you need to do right now. When you are ready: his funeral invoice can be paid directly from his account, and the estate declaration is due within 4 months. An advisor can call you whenever it suits you.`,
    impact: null,
    why: ['Death notice received via the national register', 'You are listed as an heir', 'All offers paused for 30 days', 'Sent in KBC Mobile, not WhatsApp'],
    action: { label: 'Plan a call with an advisor', kind: 'open-app' },
    channel: 'KBC Mobile',
    rankEurPerYear: 0,
  };
}

function moving(c: Customer): Draft {
  return {
    kind: 'moving',
    title: 'Moving house?',
    body: `Your home insurance has to cover the new address from the day you get the keys. Your twin checked: your current fire insurance still lists your old address.`,
    impact: null,
    why: ['Payment to a notary', 'Address change confirmed via itsme', 'Signal: transactions'],
    action: { label: 'Update your home insurance in KBC Mobile', kind: 'open-app' },
    rankEurPerYear: 0,
  };
}

// ---- Signals ----

export type LifeEvent = 'car-search' | 'new-baby' | 'bereavement' | 'moving';
const LIFE_EVENTS: LifeEvent[] = ['car-search', 'new-baby', 'bereavement', 'moving'];

export type Signal =
  | { type: 'news'; ticker: string; changePct: number; headline: string }
  | { type: 'salary'; changePct: number }
  | { type: 'location'; place: string }
  | { type: 'life-event'; event: LifeEvent }
  | { type: 'scan' };

export interface SignalResult {
  delivered: Nudge[];
  skippedNoConsent: boolean;
  fanOut?: { twinsMatched: number; customersMessaged: number; ms: number };
}

// A death notice is a legal notification, not an opt-in signal.
function consentFor(signal: Signal): SignalConsent | null {
  if (signal.type === 'news') return 'news';
  if (signal.type === 'location') return 'location';
  if (signal.type === 'life-event' && signal.event === 'bereavement') return null;
  return 'transactions';
}

export function describeSignal(signal: Signal): string {
  switch (signal.type) {
    case 'news': return `News: ${signal.ticker} ${signal.changePct > 0 ? '+' : ''}${signal.changePct}%`;
    case 'salary': return `Salary +${signal.changePct}%`;
    case 'location': return `Location: ${signal.place}`;
    case 'scan': return 'Transaction scan';
    case 'life-event': return {
      'car-search': 'Life event: car search',
      'new-baby': 'Life event: new baby',
      bereavement: 'Life event: death in the family',
      moving: 'Life event: moving house',
    }[signal.event];
  }
}

export function parseSignal(input: unknown): Signal | null {
  if (typeof input !== 'object' || input === null) return null;
  const s = input as Record<string, unknown>;
  const pct = typeof s.changePct === 'number' && Number.isFinite(s.changePct) && Math.abs(s.changePct) <= 50 ? s.changePct : null;
  switch (s.type) {
    case 'news':
      if (typeof s.ticker !== 'string' || !(s.ticker in TICKERS) || pct === null) return null;
      if (typeof s.headline !== 'string' || s.headline.length === 0 || s.headline.length > 200) return null;
      return { type: 'news', ticker: s.ticker, changePct: pct, headline: s.headline };
    case 'salary':
      return pct === null ? null : { type: 'salary', changePct: pct };
    case 'location':
      if (typeof s.place !== 'string' || s.place.length === 0 || s.place.length > 80) return null;
      return { type: 'location', place: s.place };
    case 'life-event':
      return LIFE_EVENTS.includes(s.event as LifeEvent) ? { type: 'life-event', event: s.event as LifeEvent } : null;
    case 'scan':
      return { type: 'scan' };
    default:
      return null;
  }
}

function lifeEventDraft(c: Customer, event: LifeEvent): Draft {
  switch (event) {
    case 'car-search': return carSearch(c);
    case 'new-baby': return newBaby(c);
    case 'bereavement': return bereavement(c);
    case 'moving': return moving(c);
  }
}

// Personal signals only ever touch the given customer. News is public and fans out through the index.
export async function handleSignal(customer: Customer, signal: Signal): Promise<SignalResult> {
  const label = describeSignal(signal);

  if (signal.type === 'news') {
    const started = performance.now();
    const twinsMatched = holdersByTicker.get(signal.ticker)?.length ?? 0;
    const ms = Math.round((performance.now() - started) * 10) / 10;
    let customersMessaged = 0;
    let deliveredToYou: Nudge[] = [];
    for (const c of customers) {
      logDecision(c.id, label, 'OBSERVE', `Index matched ${twinsMatched.toLocaleString('nl-BE')} of 20.000 twins in ${ms < 0.1 ? '<0.1' : ms} ms`);
      const draft = newsExposure(c, signal.ticker, signal.changePct, signal.headline);
      if (!draft) {
        logDecision(c.id, label, 'HOLD', `Not relevant: no ${signal.ticker} in portfolio`);
        continue;
      }
      if (!c.consents.news) {
        logDecision(c.id, label, 'HOLD', 'No consent for market news');
        continue;
      }
      const delivered = await route(c, label, [draft]);
      customersMessaged += delivered.length;
      if (c.id === customer.id) deliveredToYou = delivered;
    }
    return { delivered: deliveredToYou, skippedNoConsent: !customer.consents.news, fanOut: { twinsMatched, customersMessaged, ms } };
  }

  const consent = consentFor(signal);
  if (consent && !customer.consents[consent]) {
    logDecision(customer.id, label, 'HOLD', `No consent for ${consent}`);
    return { delivered: [], skippedNoConsent: true };
  }

  if (signal.type === 'life-event' && signal.event === 'bereavement') {
    quietUntil.set(customer.id, Date.now() + QUIET_PERIOD_MS);
  }

  let drafts: Draft[] = [];
  if (signal.type === 'salary') drafts = [salaryRise(customer, signal.changePct)].filter((d): d is Draft => d !== null);
  if (signal.type === 'location') drafts = [travel(customer, signal.place)];
  if (signal.type === 'life-event') drafts = [lifeEventDraft(customer, signal.event)];
  if (signal.type === 'scan') {
    // Rank by yearly euro impact and only consider the top ones: no spam.
    const ranked = [idleCash(customer), unusedSubscriptions(customer)]
      .filter((d): d is Draft => d !== null)
      .sort((a, b) => b.rankEurPerYear - a.rankEurPerYear);
    for (const d of ranked.slice(TOP_PER_SCAN)) logDecision(customer.id, label, 'HOLD', `${d.title}: not in the top ${TOP_PER_SCAN} for this scan`);
    drafts = ranked.slice(0, TOP_PER_SCAN);
    if (drafts.length === 0) logDecision(customer.id, label, 'OBSERVE', 'Nothing with a real gain found');
  }
  return { delivered: await route(customer, label, drafts), skippedNoConsent: false };
}
