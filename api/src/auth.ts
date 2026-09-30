import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'koa';
import { customers } from './data.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000;

interface Session {
  customerId: string;
  expiresAt: number;
}

const sessions = new Map<string, Session>();
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

// Demo PIN comes from the environment; each customer gets its own salted hash at startup.
const demoPin = process.env.DEMO_PIN ?? '';
const pinHashes = new Map(
  customers.map((c) => {
    const salt = randomBytes(16);
    return [c.id, { salt, hash: scryptSync(demoPin, salt, 32) }];
  }),
);

export function login(customerId: unknown, pin: unknown): string | null {
  if (typeof customerId !== 'string' || typeof pin !== 'string' || demoPin === '') return null;
  const stored = pinHashes.get(customerId);
  if (!stored) return null;

  const attempts = failedAttempts.get(customerId);
  if (attempts && attempts.lockedUntil > Date.now()) return null;

  const candidate = scryptSync(pin, stored.salt, 32);
  if (!timingSafeEqual(candidate, stored.hash)) {
    const count = (attempts?.count ?? 0) + 1;
    failedAttempts.set(customerId, {
      count: count >= MAX_FAILED_ATTEMPTS ? 0 : count,
      lockedUntil: count >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
    });
    return null;
  }

  failedAttempts.delete(customerId);
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { customerId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function bearerToken(ctx: Context): string | null {
  const header = ctx.get('Authorization');
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function logout(ctx: Context): void {
  const token = bearerToken(ctx);
  if (token) sessions.delete(token);
}

// The customer id always comes from the session, never from the request.
export async function requireAuth(ctx: Context, next: Next): Promise<void> {
  const token = bearerToken(ctx);
  const session = token ? sessions.get(token) : undefined;
  if (!token || !session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    ctx.throw(401, 'Log in first');
  }
  ctx.state.customerId = session.customerId;
  await next();
}
