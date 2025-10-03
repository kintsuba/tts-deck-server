import { serve } from '@hono/node-server';
import { getApp } from './server';

const port = Number(process.env.PORT ?? 3000);

const app = getApp();

console.log(`Starting server on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
