import { findCustomer } from './data.js';
import { type Signal, handleSignal } from './engine.js';
import { announceDeals } from './community.js';

// Simulated live feed for the demo. In production these arrive from event streams.
type FeedItem = { customerId: string; signal: Signal | { type: 'community' } };

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
  if (!item || position >= FEED.length) stopAutopilot();
  if (!item) return;
  const customer = findCustomer(item.customerId);
  if (!customer) return;
  if (item.signal.type === 'community') await announceDeals(customer);
  else await handleSignal(customer, item.signal);
}

export function startAutopilot(): void {
  if (timer) return;
  if (position >= FEED.length) position = 0;
  timer = setInterval(() => void tick().catch((err) => console.error('autopilot', err)), TICK_MS);
  void tick();
}

export function stopAutopilot(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function autopilotStatus() {
  return { running: timer !== null, step: position, total: FEED.length };
}
