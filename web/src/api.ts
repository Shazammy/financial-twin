export interface Impact {
  eur: number;
  period: string;
}

export interface Nudge {
  id: string;
  kind:
    | 'news' | 'idle-cash' | 'subscription' | 'salary' | 'travel' | 'community'
    | 'car-search' | 'new-baby' | 'bereavement' | 'moving';
  title: string;
  body: string;
  impact: Impact | null;
  why: string[];
  action: { label: string; kind: 'open-app' | 'join-deal'; dealId?: string };
  channel: 'WhatsApp' | 'KBC Mobile';
  createdAt: string;
}

export interface Decision {
  at: string;
  signal: string;
  outcome: 'SEND' | 'HOLD' | 'OBSERVE';
  detail: string;
}

export interface AutopilotStatus {
  running: boolean;
  step: number;
  total: number;
  available: boolean;
}

export type ConsentKey = 'transactions' | 'news' | 'location' | 'community';

export interface Me {
  name: string;
  age: number;
  lifeStage: string;
  neighbourhood: string;
  goals: string[];
  netWorth: { total: number; current: number; savings: number; investments: number };
  consents: Record<ConsentKey, boolean>;
  demoMode: boolean;
}

export interface CommunityDeal {
  id: string;
  kind: 'group-purchase' | 'saver' | 'borrower';
  title: string;
  othersInterested: number;
  joined: boolean;
}

export interface SignalResult {
  delivered: Nudge[];
  skippedNoConsent: boolean;
  fanOut?: { twinsMatched: number; customersMessaged: number; ms: number };
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, token: string | null, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'Request failed');
  return data as T;
}

export const eur = (n: number) =>
  new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
