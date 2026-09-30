import Koa from 'koa';
import Router from '@koa/router';
import { bodyParser } from '@koa/bodyparser';
import serve from 'koa-static';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { customers, findCustomer, netWorth, type SignalConsent } from './data.js';
import { login, logout, requireAuth } from './auth.js';
import { decisionsFor, handleSignal, nudgesFor, parseSignal } from './engine.js';
import { feedStatus, startFeed } from './signal-feed.js';
import { announceDeals, dealsFor, joinDeal } from './community.js';

const DEMO_MODE = process.env.DEMO_MODE === 'true';
const CONSENT_KEYS: SignalConsent[] = ['transactions', 'news', 'location', 'community'];

const app = new Koa();
const router = new Router({ prefix: '/api' });

function currentCustomer(ctx: Koa.Context) {
  const customer = findCustomer(ctx.state.customerId as string);
  if (!customer) ctx.throw(401, 'Log in first');
  return customer;
}

router.get('/health', (ctx) => {
  ctx.body = { status: 'ok' };
});

// Public: names only, so the demo login screen can list the synthetic customers.
router.get('/demo-customers', (ctx) => {
  ctx.body = customers.map((c) => ({ id: c.id, name: c.name, lifeStage: c.lifeStage }));
});

router.post('/login', (ctx) => {
  const { customerId, pin } = (ctx.request.body ?? {}) as Record<string, unknown>;
  const token = login(customerId, pin);
  if (!token) ctx.throw(401, 'Wrong customer or PIN');
  ctx.body = { token };
});

router.post('/logout', (ctx) => {
  logout(ctx);
  ctx.status = 204;
});

router.use('/me', requireAuth);

router.get('/me', (ctx) => {
  const c = currentCustomer(ctx);
  ctx.body = {
    name: c.name,
    age: c.age,
    lifeStage: c.lifeStage,
    neighbourhood: c.neighbourhood,
    goals: c.goals,
    netWorth: netWorth(c),
    consents: c.consents,
    demoMode: DEMO_MODE,
  };
});

router.put('/me/consents', (ctx) => {
  const c = currentCustomer(ctx);
  const body = (ctx.request.body ?? {}) as Record<string, unknown>;
  for (const key of CONSENT_KEYS) {
    if (typeof body[key] === 'boolean') c.consents[key] = body[key];
  }
  ctx.body = c.consents;
});

router.get('/me/nudges', (ctx) => {
  ctx.body = nudgesFor(currentCustomer(ctx).id);
});

// Only this customer's own decisions; other customers never show up here.
router.get('/me/agent-log', (ctx) => {
  ctx.body = decisionsFor(currentCustomer(ctx).id);
});

router.get('/me/community', (ctx) => {
  ctx.body = dealsFor(currentCustomer(ctx));
});

router.post('/me/community/announce', async (ctx) => {
  ctx.body = await announceDeals(currentCustomer(ctx));
});

router.post('/me/community/:dealId/join', async (ctx) => {
  const deal = await joinDeal(currentCustomer(ctx), ctx.params.dealId);
  if (!deal) return ctx.throw(404, 'This deal is not available to you');
  ctx.body = deal;
});

// Demo control room: simulates incoming signals. Disabled unless DEMO_MODE=true.
router.post('/me/simulate', async (ctx) => {
  if (!DEMO_MODE) ctx.throw(404, 'Not found');
  const signal = parseSignal(ctx.request.body);
  if (!signal) return ctx.throw(400, 'Unknown or invalid signal');
  ctx.body = await handleSignal(currentCustomer(ctx), signal);
});

// Demo only: the simulated signal feed the twin reacts to.
router.get('/me/signal-feed', (ctx) => {
  ctx.body = { ...feedStatus(), available: DEMO_MODE };
});

router.post('/me/signal-feed/start', (ctx) => {
  if (!DEMO_MODE) ctx.throw(404, 'Not found');
  startFeed();
  ctx.body = feedStatus();
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    ctx.status = status;
    ctx.body = { error: status < 500 ? (err as Error).message : 'Something went wrong' };
    if (status >= 500) console.error(err);
  }
});
app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

// In production the API also serves the built web app (single service on Render).
const webDist = resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webDist)) {
  const indexHtml = readFileSync(resolve(webDist, 'index.html'));
  app.use(serve(webDist));
  app.use(async (ctx) => {
    if (ctx.method === 'GET' && !ctx.path.startsWith('/api')) {
      ctx.type = 'html';
      ctx.body = indexHtml;
    }
  });
}

const port = Number(process.env.PORT ?? 4100);
const host = process.env.HOST ?? '127.0.0.1';
app.listen(port, host, () => console.log(`API on http://${host}:${port} (demo mode: ${DEMO_MODE})`));
