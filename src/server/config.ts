import dotenv from "dotenv";

dotenv.config();

export type AppConfig = {
  port: number;
  toolpathApiKey: string;
  toolpathApiRoot: string;
  databasePath: string;
  pollIntervalMs: number;
  logToolpathBodies: boolean;
};

const API_PATH = "/api/public/v0";

export function normalizeToolpathApiRoot(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (!trimmed) {
    throw new Error("TP_API_BASE_URL is required");
  }

  if (trimmed.endsWith(API_PATH)) {
    return trimmed;
  }

  return `${trimmed}${API_PATH}`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const toolpathApiKey = env.TP_API_KEY;
  const toolpathBaseUrl = env.TP_API_BASE_URL;

  if (!toolpathApiKey) {
    throw new Error("TP_API_KEY is required");
  }

  if (!toolpathBaseUrl) {
    throw new Error("TP_API_BASE_URL is required");
  }

  return {
    port: Number(env.PORT ?? 3002),
    toolpathApiKey,
    toolpathApiRoot: normalizeToolpathApiRoot(toolpathBaseUrl),
    databasePath: env.DATABASE_PATH ?? "data/tp-api-demo.sqlite",
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 5000),
    logToolpathBodies: env.LOG_TOOLPATH_BODIES === "true"
  };
}
