import { randomBytes } from 'node:crypto';
import type { Context, Next } from 'koa';
import { findCustomer } from './data.js';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

interface Session {
  customerId: string;
  expiresAt: number;
}

const sessions = new Map<string, Session>();

// Demo login: pick one of the synthetic customers. The session token still scopes every /api/me route.
export function login(customerId: unknown): string | null {
  if (typeof customerId !== 'string' || !findCustomer(customerId)) return null;
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
