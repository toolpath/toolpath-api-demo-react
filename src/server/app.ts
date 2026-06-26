import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { CutConfig, ProgramToolpathResponse, UploadPartResponse } from "../shared/types.js";
import type { PartRepository } from "./db.js";
import { logLocalRequest } from "./logger.js";
import type { PartProcessor } from "./partProcessor.js";
import { ToolpathApiError, type ToolpathClient } from "./toolpathClient.js";

type AppServices = {
  repository: PartRepository;
  toolpathClient: ToolpathClient;
  processor: PartProcessor;
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

export function createApp(services: AppServices): express.Express {
  const app = express();

  app.use(requestLogger);
  app.use(express.json());

  app.get(
    "/api/cut-configs",
    asyncHandler(async (_request, response) => {
      const cutConfigs = await services.toolpathClient.getCutConfigs();
      response.json({ cutConfigs });
    })
  );

  app.get("/api/parts", (_request, response) => {
    response.json({ parts: services.repository.listParts() });
  });

  app.post(
    "/api/parts",
    upload.single("stepFile"),
    asyncHandler(async (request, response) => {
      if (!request.file) {
        response.status(400).json({ error: "A STEP file is required in the stepFile field." });
        return;
      }

      const cutConfigIds = parseCutConfigIds(request.body.cutConfigIds);
      if (cutConfigIds.length === 0) {
        response.status(400).json({ error: "Select at least one cut config before uploading." });
        return;
      }

      const cutConfigs = await services.toolpathClient.getCutConfigs();
      const selectedCutConfigs = selectCutConfigs(cutConfigs, cutConfigIds);
      const fileName = request.file.originalname;
      const createdPart = await services.toolpathClient.createPart({
        name: path.parse(fileName).name,
        units: String(request.body.units ?? "mm"),
        stepFileName: fileName,
        cutConfigIds
      });

      let part = services.repository.createPart(createdPart.data, selectedCutConfigs);
      services.repository.setLocalLifecycle(part.id, "uploading");

      try {
        await services.toolpathClient.uploadStepFile(createdPart.upload, request.file.buffer);
        // Toolpath does not start downstream processing until the client confirms
        // the signed upload URL has received the STEP bytes.
        const completedPart = await services.toolpathClient.completePartUpload(part.id);
        services.repository.updateToolpathPart(completedPart);
        services.repository.setLocalLifecycle(part.id, "processing");
        void services.processor.processPartOnce(part.id).catch((error) => {
          console.error(`Initial poll failed for part ${part.id}`, error);
        });
      } catch (error) {
        services.repository.setLocalLifecycle(part.id, "failed", error instanceof Error ? error.message : "Upload failed");
      }

      part = services.repository.getPart(part.id);
      const payload: UploadPartResponse = { part };
      response.status(part.localLifecycle === "failed" ? 502 : 201).json(payload);
    })
  );

  app.post(
    "/api/parts/:partId/programs",
    asyncHandler(async (request, response) => {
      const partId = typeof request.params.partId === "string" ? request.params.partId : null;
      if (!partId) {
        response.status(400).json({ error: "partId is required." });
        return;
      }

      const program = await services.toolpathClient.createProgram({
        partId,
        cutConfigId: typeof request.body.cutConfigId === "string" ? request.body.cutConfigId : request.body.cutConfigId ?? undefined
      });

      services.repository.upsertProgram(program);
      response.status(201).json({ program });
    })
  );

  app.get(
    "/api/parts/:partId/programs/:programId/toolpath",
    asyncHandler(async (request, response) => {
      const partId = String(request.params.partId);
      const programId = String(request.params.programId);
      const result = await services.toolpathClient.getProgramWithRaw(partId, programId);
      try {
        services.repository.upsertProgram(result.program);
      } catch (error) {
        console.warn(`Could not cache Toolpath program ${programId}`, error);
      }

      const payload: ProgramToolpathResponse = {
        program: result.program,
        toolpathResponse: result.raw
      };
      response.json(payload);
    })
  );

  app.use(errorHandler);

  return app;
}

function requestLogger(request: Request, response: Response, next: NextFunction): void {
  const startedAt = performance.now();

  response.on("finish", () => {
    logLocalRequest(request.method, request.originalUrl, response.statusCode, Math.round(performance.now() - startedAt));
  });

  next();
}

function parseCutConfigIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(parseCutConfigIds);
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
  } catch {
    // Fall through to comma-separated parsing for basic form posts.
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectCutConfigs(cutConfigs: CutConfig[], selectedIds: string[]): CutConfig[] {
  const cutConfigsById = new Map(cutConfigs.map((cutConfig) => [cutConfig.id, cutConfig]));
  return selectedIds.map((id) => cutConfigsById.get(id) ?? unknownCutConfig(id));
}

function unknownCutConfig(id: string): CutConfig {
  return {
    id,
    name: id,
    isDefault: false,
    readOnly: false,
    generic: false,
    toolLibraries: 0,
    tools: 0
  };
}

function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    void handler(request, response, next).catch(next);
  };
}

function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof ToolpathApiError) {
    response.status(502).json({
      error: error.message,
      toolpathStatus: error.status,
      toolpathBody: error.body
    });
    return;
  }

  response.status(500).json({
    error: error instanceof Error ? error.message : "Unexpected server error"
  });
}
