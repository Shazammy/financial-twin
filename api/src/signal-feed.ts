import { findCustomer } from './data.js';
import { type Signal, handleSignal } from './engine.js';
import { announceDeals, joinDeal } from './community.js';

// Simulated live feed for the demo. In production these arrive from event streams.
type FeedItem = { customerId: string; signal: Signal | { type: 'community' } | { type: 'join'; dealId: string } };

const FEED: FeedItem[] = [
  { customerId: 'lotte', signal: { type: 'news', ticker: 'ASML', changePct: -8, headline: 'ASML falls after new chip export restrictions' } },
  { customerId: 'youssef', signal: { type: 'life-event', event: 'car-search' } },
  { customerId: 'lotte', signal: { type: 'scan' } },
  { customerId: 'marie', signal: { type: 'scan' } },
  { customerId: 'youssef', signal: { type: 'scan' } },
  { customerId: 'lotte', signal: { type: 'life-event', event: 'new-baby' } },
  { customerId: 'marie', signal: { type: 'community' } },
  { customerId: 'lotte', signal: { type: 'community' } },
  { customerId: 'youssef', signal: { type: 'community' } },
  // Simulated customer taps on "Join anonymously"
  { customerId: 'youssef', signal: { type: 'join', dealId: 'pool:borrower' } },
  { customerId: 'lotte', signal: { type: 'join', dealId: 'pool:saver' } },
  { customerId: 'lotte', signal: { type: 'location', place: 'Barcelona' } },
  { customerId: 'marie', signal: { type: 'life-event', event: 'moving' } },
  { customerId: 'lotte', signal: { type: 'life-event', event: 'bereavement' } },
  { customerId: 'lotte', signal: { type: 'salary', changePct: 10 } },
];

const TICK_MS = 5000;
let timer: NodeJS.Timeout | null = null;
let position = 0;

async function tick(): Promise<void> {
  const item = FEED[position];
  position++;
  if (!item || position >= FEED.length) stopFeed();
  if (!item) return;
  const customer = findCustomer(item.customerId);
  if (!customer) return;
  if (item.signal.type === 'community') await announceDeals(customer);
  else if (item.signal.type === 'join') await joinDeal(customer, item.signal.dealId);
  else await handleSignal(customer, item.signal);
}

// Starts (or replays) the simulated signal feed. In production the twin listens to live event streams.
export function startFeed(): void {
  if (timer) return;
  if (position >= FEED.length) position = 0;
  timer = setInterval(() => void tick().catch((err) => console.error('signal feed', err)), TICK_MS);
  void tick();
}

function stopFeed(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function feedStatus() {
  return { running: timer !== null, step: position, total: FEED.length };
}
