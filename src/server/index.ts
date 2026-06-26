import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PartRepository } from "./db.js";
import { configureLogger } from "./logger.js";
import { PartProcessor } from "./partProcessor.js";
import { ToolpathClient } from "./toolpathClient.js";

const config = loadConfig();
configureLogger({ logToolpathBodies: config.logToolpathBodies });
const repository = PartRepository.open(config.databasePath);
const toolpathClient = new ToolpathClient({
  apiRoot: config.toolpathApiRoot,
  apiKey: config.toolpathApiKey
});
const processor = new PartProcessor(repository, toolpathClient);
const app = createApp({ repository, toolpathClient, processor });

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const closeClientServer = await attachClient(app, currentDir);

if (config.pollIntervalMs < 5000) {
  console.warn(
    `POLL_INTERVAL_MS is set to ${config.pollIntervalMs}ms. Polling faster than 5000ms will likely hit Toolpath API rate limits; set POLL_INTERVAL_MS=5000 or higher.`
  );
}

processor.start(config.pollIntervalMs);

const server = app.listen(config.port, () => {
  console.log(`TP API Demo listening on http://localhost:${config.port}`);
});

function shutdown(): void {
  processor.stop();
  repository.close();
  void closeClientServer();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function attachClient(app: express.Express, currentDir: string): Promise<() => Promise<void>> {
  const isSourceRuntime = currentDir.endsWith(path.join("src", "server"));

  if (isSourceRuntime) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
    return () => vite.close();
  }

  const clientDist = path.resolve(currentDir, "../client");
  app.use(express.static(clientDist));
  app.get(/.*/, (_request, response) => {
    response.sendFile(path.join(clientDist, "index.html"));
  });

  return async () => undefined;
}
