import { serve } from "@hono/node-server";
import { getApp } from "./server";
import { loadConfig } from "./config";

const config = loadConfig();
const port = config.PORT !== undefined ? Number(config.PORT) : 3000;

const app = getApp(config);

console.log(`Starting server on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
