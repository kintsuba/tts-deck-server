import type { Logger } from "../utils/logger";

declare module "hono" {
  interface ContextVariableMap {
    logger: Logger;
    requestId: string;
    payloadBytes: number;
    mergeMetrics: Record<string, unknown>;
    responseStatus: number;
  }
}
