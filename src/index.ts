import { serve } from "@hono/node-server";
import { getApp } from "./server";
import { getPort, loadConfig } from "./config";

const config = loadConfig();
const port = getPort(config);

const app = getApp(config);

console.log(`Starting server on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
