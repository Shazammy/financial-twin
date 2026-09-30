import type { Context } from 'koa';
import { type Customer, population } from './data.js';
import { type Impact, logDecision, route, totalInterest } from './engine.js';

// Illustrative terms for the demo, not real KBC or installer offers.
const HEAT_PUMP = { minGroupSize: 10, groupDiscountPct: 15, typicalCostEur: 14000, greenLoanRatePct: 1.9, standardLoanRatePct: 4.5 };
const POOL = { savingsRatePct: 1.0, saverPoolRatePct: 3.0, classicLoanRatePct: 5.9, borrowerPoolRatePct: 4.4, minSaverAmountEur: 5000 };
const AVERAGE_CAR_LOAN_EUR = 15000;

export interface CommunityDeal {
  id: string;
  kind: 'group-purchase' | 'saver' | 'borrower';
  title: string;
  message: string;
  why: string[];
  impact: Impact;
  othersInterested: number;
  joined: boolean;
}

// Opt-ins only store the customer id; other customers only ever see a count.
const joinedBy = new Map<string, Set<string>>();

const eur = (n: number) => `€${Math.round(n).toLocaleString('nl-BE')}`;

function othersJoined(id: string, customer: Customer): number {
  return [...(joinedBy.get(id) ?? [])].filter((c) => c !== customer.id).length;
}

function heatPumpDeal(c: Customer): Omit<CommunityDeal, 'joined'> | null {
  if (!c.goals.includes('heat-pump')) return null;
  const id = `heat-pump:${c.neighbourhood}`;
  const others =
    population.filter((t) => t.communityConsent && t.neighbourhood === c.neighbourhood && t.goals.includes('heat-pump')).length +
    othersJoined(id, c);
  const saving = (HEAT_PUMP.typicalCostEur * HEAT_PUMP.groupDiscountPct) / 100;
  return {
    id,
    kind: 'group-purchase',
    title: 'Neighbourhood heat pump group purchase',
    message: `${others} households in ${c.neighbourhood} share your goal of a heat pump. Together you get ${HEAT_PUMP.groupDiscountPct}% off (about ${eur(saving)}) and a green loan at ${HEAT_PUMP.greenLoanRatePct}% instead of ${HEAT_PUMP.standardLoanRatePct}%. You join anonymously.`,
    why: ['Your goal: heat pump', `Neighbourhood: ${c.neighbourhood}`, `${others} matching twins opted in to community deals`, 'Signal: community'],
    impact: { eur: saving, period: 'one-off' },
    othersInterested: others,
  };
}

// Saver x borrower: KBC links savers and borrowers through a pool and carries the credit risk itself.
function saverDeal(c: Customer): Omit<CommunityDeal, 'joined'> | null {
  const idle = c.currentAccountEur - c.monthlySpendEur * 3;
  if (idle < POOL.minSaverAmountEur) return null;
  const id = 'pool:saver';
  const borrowers = population.filter((t) => t.communityConsent && t.goals.includes('car')).length + othersJoined('pool:borrower', c);
  const amount = Math.floor(idle / 1000) * 1000;
  const gain = amount * ((POOL.saverPoolRatePct - POOL.savingsRatePct) / 100);
  return {
    id,
    kind: 'saver',
    title: 'Saver × borrower pool: your savings',
    message: `Put ${eur(amount)} in the KBC twin pool at ${POOL.saverPoolRatePct}% instead of ${POOL.savingsRatePct}% on a savings account: about ${eur(gain)} more a year. It funds car loans for ${borrowers.toLocaleString('nl-BE')} twins. KBC stays in the middle and carries the risk, and your deposit keeps its guarantee.`,
    why: [`Idle cash above your 3-month buffer: ${eur(idle)}`, `${borrowers.toLocaleString('nl-BE')} twins need a car loan`, 'KBC carries the credit risk', 'Signal: community'],
    impact: { eur: gain, period: 'per year' },
    othersInterested: borrowers,
  };
}

function borrowerDeal(c: Customer): Omit<CommunityDeal, 'joined'> | null {
  if (!c.loanNeed) return null;
  const id = 'pool:borrower';
  const savers = population.filter((t) => t.communityConsent && t.goals.includes('retire-early')).length + othersJoined('pool:saver', c);
  const { amountEur, months, purpose } = c.loanNeed;
  const saving = totalInterest(amountEur, POOL.classicLoanRatePct, months) - totalInterest(amountEur, POOL.borrowerPoolRatePct, months);
  return {
    id,
    kind: 'borrower',
    title: `Saver × borrower pool: your ${purpose} loan`,
    message: `Your ${eur(amountEur)} ${purpose} loan can be funded by ${savers.toLocaleString('nl-BE')} saving twins through the KBC pool: ${POOL.borrowerPoolRatePct}% instead of ${POOL.classicLoanRatePct}% on a classic loan. That saves about ${eur(saving)} in interest over ${months / 12} years. KBC stays your lender.`,
    why: [`Your need: ${purpose}, ${eur(amountEur)} over ${months} months`, `${savers.toLocaleString('nl-BE')} saving twins in the pool`, 'KBC carries the credit risk', 'Signal: community'],
    impact: { eur: saving, period: 'one-off' },
    othersInterested: savers,
  };
}

export function dealsFor(customer: Customer): CommunityDeal[] {
  if (!customer.consents.community) return [];
  return [heatPumpDeal(customer), saverDeal(customer), borrowerDeal(customer)]
    .filter((d): d is Omit<CommunityDeal, 'joined'> => d !== null)
    .map((d) => ({ ...d, joined: joinedBy.get(d.id)?.has(customer.id) ?? false }));
}

export async function announceDeals(customer: Customer) {
  const signal = 'Community match';
  if (!customer.consents.community) {
    logDecision(customer.id, signal, 'HOLD', 'No consent for community matching');
    return [];
  }
  const open = dealsFor(customer).filter((d) => !d.joined);
  if (open.length === 0) logDecision(customer.id, signal, 'OBSERVE', 'No open pools for your goals');
  return route(
    customer,
    signal,
    open.map((deal) => ({
      kind: 'community' as const,
      title: deal.title,
      body: deal.message,
      impact: deal.impact,
      why: deal.why,
      action: { label: 'Join anonymously', kind: 'join-deal' as const, dealId: deal.id },
      rankEurPerYear: deal.impact.period === 'per year' ? deal.impact.eur : deal.impact.eur / 4,
    })),
  );
}

export function joinDeal(ctx: Context, customer: Customer, id: string): CommunityDeal {
  const deal = dealsFor(customer).find((d) => d.id === id);
  if (!deal) return ctx.throw(404, 'This deal is not available to you');
  const joined = joinedBy.get(id) ?? new Set<string>();
  joined.add(customer.id);
  joinedBy.set(id, joined);
  return { ...deal, joined: true };
}
