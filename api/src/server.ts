import Koa from 'koa';
import Router from '@koa/router';
import { bodyParser } from '@koa/bodyparser';

const app = new Koa();
const router = new Router({ prefix: '/api' });

router.get('/health', (ctx) => {
  ctx.body = { status: 'ok' };
});

app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

const port = Number(process.env.PORT ?? 4100);
app.listen(port, '127.0.0.1', () => console.log(`API on http://127.0.0.1:${port}`));
