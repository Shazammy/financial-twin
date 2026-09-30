// Synthetic demo data. No real customer data is used anywhere.

export type SignalConsent = 'transactions' | 'news' | 'location' | 'community';
export type Goal = 'heat-pump' | 'first-home' | 'retire-early' | 'kids-education' | 'car';

export interface Holding {
  ticker: string;
  name: string;
  valueEur: number;
}

export interface Subscription {
  name: string;
  monthlyEur: number;
  daysSinceLastUse: number;
}

export interface Customer {
  id: string;
  name: string;
  age: number;
  lifeStage: string;
  neighbourhood: string;
  goals: Goal[];
  monthlyIncomeEur: number;
  monthlySpendEur: number;
  currentAccountEur: number;
  savingsEur: number;
  holdings: Holding[];
  subscriptions: Subscription[];
  hasTravelInsurance: boolean;
  loanNeed?: { purpose: string; amountEur: number; months: number };
  consents: Record<SignalConsent, boolean>;
}

export const customers: Customer[] = [
  {
    id: 'lotte',
    name: 'Lotte Peeters',
    age: 34,
    lifeStage: 'Young family',
    neighbourhood: 'Gent-Zuid',
    goals: ['heat-pump', 'kids-education'],
    monthlyIncomeEur: 3900,
    monthlySpendEur: 3000,
    currentAccountEur: 18400,
    savingsEur: 6000,
    holdings: [
      { ticker: 'ASML', name: 'ASML Holding', valueEur: 6000 },
      { ticker: 'KBCECO', name: 'KBC Eco Fund', valueEur: 40000 },
      { ticker: 'AAPL', name: 'Apple', valueEur: 4000 },
    ],
    subscriptions: [
      { name: 'Netflix', monthlyEur: 15.99, daysSinceLastUse: 2 },
      { name: 'Disney+', monthlyEur: 11.99, daysSinceLastUse: 74 },
      { name: 'Spotify', monthlyEur: 11.99, daysSinceLastUse: 1 },
    ],
    hasTravelInsurance: false,
    consents: { transactions: true, news: true, location: true, community: true },
  },
  {
    id: 'youssef',
    name: 'Youssef El Amrani',
    age: 27,
    lifeStage: 'First job',
    neighbourhood: 'Antwerpen-Berchem',
    goals: ['first-home', 'car'],
    monthlyIncomeEur: 2600,
    monthlySpendEur: 2100,
    currentAccountEur: 3200,
    savingsEur: 1500,
    holdings: [
      { ticker: 'TSLA', name: 'Tesla', valueEur: 1200 },
      { ticker: 'VWRL', name: 'Vanguard FTSE All-World', valueEur: 2500 },
    ],
    subscriptions: [
      { name: 'Basic-Fit', monthlyEur: 29.99, daysSinceLastUse: 51 },
      { name: 'Spotify', monthlyEur: 11.99, daysSinceLastUse: 0 },
    ],
    hasTravelInsurance: true,
    loanNeed: { purpose: 'car', amountEur: 15000, months: 48 },
    consents: { transactions: true, news: true, location: false, community: true },
  },
  {
    id: 'marie',
    name: 'Marie Dubois',
    age: 58,
    lifeStage: 'Pre-retirement',
    neighbourhood: 'Leuven-Heverlee',
    goals: ['retire-early', 'heat-pump'],
    monthlyIncomeEur: 4800,
    monthlySpendEur: 3200,
    currentAccountEur: 42000,
    savingsEur: 60000,
    holdings: [
      { ticker: 'ASML', name: 'ASML Holding', valueEur: 25000 },
      { ticker: 'KBCPEN', name: 'KBC Pension Fund', valueEur: 120000 },
    ],
    subscriptions: [{ name: 'Le Soir+', monthlyEur: 14.99, daysSinceLastUse: 3 }],
    hasTravelInsurance: true,
    consents: { transactions: true, news: true, location: false, community: false },
  },
];

export function findCustomer(id: string): Customer | undefined {
  return customers.find((c) => c.id === id);
}

export const TICKERS: Record<string, string> = {
  ASML: 'ASML Holding',
  AAPL: 'Apple',
  TSLA: 'Tesla',
  NVDA: 'Nvidia',
  VWRL: 'Vanguard FTSE All-World',
  KBCECO: 'KBC Eco Fund',
};

export const NEIGHBOURHOODS = [
  'Gent-Zuid', 'Antwerpen-Berchem', 'Leuven-Heverlee', 'Brugge-Centrum',
  'Kortrijk-Heule', 'Hasselt-Kiewit', 'Mechelen-Nekkerspoel', 'Aalst-Centrum',
];

const GOALS: Goal[] = ['heat-pump', 'first-home', 'retire-early', 'kids-education', 'car'];

// Anonymous twin population: stands in for the 2.3M customers. No names, no balances.
export interface AnonymousTwin {
  neighbourhood: string;
  goals: Goal[];
  tickers: string[];
  communityConsent: boolean;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const rand = seededRandom(42);
const tickerList = Object.keys(TICKERS);

export const population: AnonymousTwin[] = Array.from({ length: 20000 }, () => ({
  neighbourhood: NEIGHBOURHOODS[Math.floor(rand() * NEIGHBOURHOODS.length)],
  goals: GOALS.filter(() => rand() < 0.12),
  tickers: tickerList.filter(() => rand() < 0.15),
  communityConsent: rand() < 0.4,
}));

// Inverted index: ticker -> twins holding it. News fans out through this, never by scanning everyone.
export const holdersByTicker = new Map<string, number[]>();
population.forEach((twin, i) => {
  for (const t of twin.tickers) {
    const list = holdersByTicker.get(t) ?? [];
    list.push(i);
    holdersByTicker.set(t, list);
  }
});

export function netWorth(c: Customer): { total: number; current: number; savings: number; investments: number } {
  const investments = c.holdings.reduce((sum, h) => sum + h.valueEur, 0);
  return {
    total: c.currentAccountEur + c.savingsEur + investments,
    current: c.currentAccountEur,
    savings: c.savingsEur,
    investments,
  };
}
