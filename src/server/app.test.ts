import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";
import { PartRepository } from "./db.js";
import { PartProcessor } from "./partProcessor.js";
import type { ToolpathClient } from "./toolpathClient.js";

describe("createApp", () => {
  it("creates a Toolpath part, uploads the STEP file, and persists selected cut configs", async () => {
    const repository = PartRepository.open(":memory:");
    const toolpathClient = {
      getCutConfigs: vi.fn().mockResolvedValue([
        {
          id: "cfg00001",
          name: "Aluminum 3-axis",
          isDefault: true,
          readOnly: false,
          generic: false,
          toolLibraries: 2,
          tools: 148
        }
      ]),
      createPart: vi.fn().mockResolvedValue({
        data: {
          id: "part0001",
          status: "processing",
          name: "bracket",
          units: "mm",
          programId: null,
          programIds: [],
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:00:00.000Z"
        },
        upload: {
          url: "https://s3.amazonaws.com/upload",
          method: "PUT",
          expiresAt: "2026-06-24T18:15:00.000Z"
        }
      }),
      uploadStepFile: vi.fn().mockResolvedValue(undefined),
      completePartUpload: vi.fn().mockResolvedValue({
        id: "part0001",
        status: "processing",
        name: "bracket",
        units: "mm",
        programId: null,
        programIds: [],
        failureCode: null,
        failureReason: null,
        createdAt: "2026-06-24T18:00:00.000Z"
      }),
      createProgram: vi.fn(),
      getPart: vi.fn(),
      getProgram: vi.fn()
    } as unknown as ToolpathClient;
    const processor = {
      processPartOnce: vi.fn().mockResolvedValue(undefined)
    } as unknown as PartProcessor;
    const app = createApp({ repository, toolpathClient, processor });

    const response = await request(app)
      .post("/api/parts")
      .field("cutConfigIds", JSON.stringify(["cfg00001"]))
      .attach("stepFile", Buffer.from("step content"), "bracket.step")
      .expect(201);

    expect(toolpathClient.createPart).toHaveBeenCalledWith({
      name: "bracket",
      units: "mm",
      stepFileName: "bracket.step",
      cutConfigIds: ["cfg00001"]
    });
    expect(toolpathClient.uploadStepFile).toHaveBeenCalledWith(
      expect.objectContaining({ method: "PUT" }),
      Buffer.from("step content")
    );
    expect(toolpathClient.completePartUpload).toHaveBeenCalledWith("part0001");
    expect(processor.processPartOnce).toHaveBeenCalledWith("part0001");
    expect(response.body.part).toEqual(
      expect.objectContaining({
        id: "part0001",
        localLifecycle: "processing",
        rows: [
          expect.objectContaining({
            cutConfigId: "cfg00001",
            cutConfigName: "Aluminum 3-axis",
            status: "processing"
          })
        ]
      })
    );
    repository.close();
  });

  it("marks upload failures distinctly from Toolpath processing failures", async () => {
    const repository = PartRepository.open(":memory:");
    const toolpathClient = {
      getCutConfigs: vi.fn().mockResolvedValue([
        {
          id: "cfg00001",
          name: "Aluminum 3-axis",
          isDefault: true,
          readOnly: false,
          generic: false,
          toolLibraries: 2,
          tools: 148
        }
      ]),
      createPart: vi.fn().mockResolvedValue({
        data: {
          id: "part0001",
          status: "processing",
          name: "bracket",
          units: "mm",
          programId: null,
          programIds: [],
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:00:00.000Z"
        },
        upload: {
          url: "https://s3.amazonaws.com/upload",
          method: "PUT",
          expiresAt: "2026-06-24T18:15:00.000Z"
        }
      }),
      uploadStepFile: vi.fn().mockRejectedValue(new Error("S3 upload failed")),
      completePartUpload: vi.fn(),
      createProgram: vi.fn(),
      getPart: vi.fn(),
      getProgram: vi.fn()
    } as unknown as ToolpathClient;
    const processor = {
      processPartOnce: vi.fn().mockResolvedValue(undefined)
    } as unknown as PartProcessor;
    const app = createApp({ repository, toolpathClient, processor });

    const response = await request(app)
      .post("/api/parts")
      .field("cutConfigIds", JSON.stringify(["cfg00001"]))
      .attach("stepFile", Buffer.from("step content"), "bracket.step")
      .expect(502);

    expect(response.body.part).toEqual(
      expect.objectContaining({
        id: "part0001",
        localLifecycle: "failed",
        failureReason: "S3 upload failed"
      })
    );
    expect(toolpathClient.completePartUpload).not.toHaveBeenCalled();
    expect(processor.processPartOnce).not.toHaveBeenCalled();
    repository.close();
  });

  it("fetches a raw Toolpath program response for status debugging", async () => {
    const repository = PartRepository.open(":memory:");
    const toolpathClient = {
      getProgramWithRaw: vi.fn().mockResolvedValue({
        program: {
          id: "prog0001",
          partId: "part0001",
          cutConfigId: "cfg00001",
          cutConfigName: "Aluminum 3-axis",
          status: "ready",
          score: 91,
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:05:00.000Z",
          updatedAt: "2026-06-24T18:06:00.000Z"
        },
        raw: {
          data: {
            id: "prog0001",
            status: "ready",
            score: 91
          }
        }
      })
    } as unknown as ToolpathClient;
    const processor = {
      processPartOnce: vi.fn().mockResolvedValue(undefined)
    } as unknown as PartProcessor;
    const app = createApp({ repository, toolpathClient, processor });

    const response = await request(app).get("/api/parts/part0001/programs/prog0001/toolpath").expect(200);

    expect(toolpathClient.getProgramWithRaw).toHaveBeenCalledWith("part0001", "prog0001");
    expect(response.body).toEqual({
      program: expect.objectContaining({
        id: "prog0001",
        score: 91
      }),
      toolpathResponse: {
        data: {
          id: "prog0001",
          status: "ready",
          score: 91
        }
      }
    });
    repository.close();
  });
});
