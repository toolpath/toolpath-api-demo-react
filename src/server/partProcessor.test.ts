import { describe, expect, it, vi } from "vitest";
import { PartRepository } from "./db.js";
import { PartProcessor } from "./partProcessor.js";
import type { ToolpathClient } from "./toolpathClient.js";

const cutConfigs = [
  {
    id: "cfg00001",
    name: "Aluminum 3-axis",
    isDefault: true,
    readOnly: false,
    generic: false,
    toolLibraries: 2,
    tools: 148
  },
  {
    id: "cfg00002",
    name: "DFM Cut Config",
    isDefault: false,
    readOnly: true,
    generic: true,
    toolLibraries: 1,
    tools: 64
  }
];

describe("PartProcessor", () => {
  it("polls a ready part, fetches reported programs, and averages numeric scores only", async () => {
    const repository = PartRepository.open(":memory:");
    repository.createPart(
      {
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
      cutConfigs
    );
    repository.setLocalLifecycle("part0001", "processing");

    const toolpathClient = {
      getPart: vi.fn().mockResolvedValue({
        id: "part0001",
        status: "ready",
        name: "bracket",
        units: "mm",
        programId: "prog0001",
        programIds: ["prog0001", "prog0002"],
        failureCode: null,
        failureReason: null,
        createdAt: "2026-06-24T18:00:00.000Z"
      }),
      getProgram: vi
        .fn()
        .mockResolvedValueOnce({
          id: "prog0001",
          partId: "part0001",
          cutConfigId: "cfg00001",
          cutConfigName: "Aluminum 3-axis",
          status: "ready",
          score: null,
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:05:00.000Z",
          updatedAt: "2026-06-24T18:06:00.000Z"
        })
        .mockResolvedValueOnce({
          id: "prog0002",
          partId: "part0001",
          cutConfigId: "cfg00002",
          cutConfigName: "DFM Cut Config",
          status: "ready",
          score: null,
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:05:00.000Z",
          updatedAt: "2026-06-24T18:06:00.000Z"
        }),
      getProgramMachinability: vi
        .fn()
        .mockResolvedValueOnce({
          partId: "part0001",
          programId: "prog0001",
          status: "ready",
          machinabilityScore: 80,
          setupCount: 2,
          totalDurationSeconds: 125,
          failureCode: null,
          failureReason: null
        })
        .mockResolvedValueOnce({
          partId: "part0001",
          programId: "prog0002",
          status: "ready",
          machinabilityScore: 90,
          setupCount: 1,
          totalDurationSeconds: 60,
          failureCode: null,
          failureReason: null
        }),
      createProgram: vi.fn()
    } as unknown as ToolpathClient;
    const processor = new PartProcessor(repository, toolpathClient);

    await processor.processPartOnce("part0001");

    const part = repository.getPart("part0001");
    expect(part.localLifecycle).toBe("ready");
    expect(part.programIds).toEqual(["prog0001", "prog0002"]);
    expect(part.averageScore).toBe(85);
    expect(part.rows).toEqual([
      expect.objectContaining({
        cutConfigId: "cfg00001",
        programId: "prog0001",
        score: 80,
        setupCount: 2,
        totalDurationSeconds: 125
      }),
      expect.objectContaining({
        cutConfigId: "cfg00002",
        programId: "prog0002",
        score: 90,
        setupCount: 1,
        totalDurationSeconds: 60
      })
    ]);
    expect(toolpathClient.getProgram).toHaveBeenNthCalledWith(1, "part0001", "prog0001");
    expect(toolpathClient.getProgram).toHaveBeenNthCalledWith(2, "part0001", "prog0002");
    expect(toolpathClient.getProgramMachinability).toHaveBeenNthCalledWith(1, "part0001", "prog0001");
    expect(toolpathClient.getProgramMachinability).toHaveBeenNthCalledWith(2, "part0001", "prog0002");
    expect(toolpathClient.createProgram).not.toHaveBeenCalled();
    repository.close();
  });

  it("keeps polling a ready part until child programs are terminal", async () => {
    const repository = PartRepository.open(":memory:");
    repository.createPart(
      {
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
      cutConfigs
    );
    repository.setLocalLifecycle("part0001", "processing");

    const toolpathClient = {
      getPart: vi.fn().mockResolvedValue({
        id: "part0001",
        status: "ready",
        name: "bracket",
        units: "mm",
        programId: "prog0001",
        programIds: ["prog0001", "prog0002"],
        failureCode: null,
        failureReason: null,
        createdAt: "2026-06-24T18:00:00.000Z"
      }),
      getProgram: vi
        .fn()
        .mockResolvedValueOnce({
          id: "prog0001",
          partId: "part0001",
          cutConfigId: "cfg00001",
          cutConfigName: "Aluminum 3-axis",
          status: "ready",
          score: null,
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:05:00.000Z",
          updatedAt: "2026-06-24T18:06:00.000Z"
        })
        .mockResolvedValueOnce({
          id: "prog0002",
          partId: "part0001",
          cutConfigId: "cfg00002",
          cutConfigName: "DFM Cut Config",
          status: "processing",
          score: null,
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:05:00.000Z",
          updatedAt: "2026-06-24T18:06:00.000Z"
        }),
      getProgramMachinability: vi
        .fn()
        .mockResolvedValueOnce({
          partId: "part0001",
          programId: "prog0001",
          status: "ready",
          machinabilityScore: 80,
          setupCount: 2,
          totalDurationSeconds: 125,
          failureCode: null,
          failureReason: null
        })
        .mockResolvedValueOnce({
          partId: "part0001",
          programId: "prog0002",
          status: "processing",
          machinabilityScore: null,
          setupCount: 0,
          totalDurationSeconds: 0,
          failureCode: null,
          failureReason: null
        }),
      createProgram: vi.fn()
    } as unknown as ToolpathClient;
    const processor = new PartProcessor(repository, toolpathClient);

    await processor.processPartOnce("part0001");

    const part = repository.getPart("part0001");
    expect(part.toolpathStatus).toBe("ready");
    expect(part.localLifecycle).toBe("processing");
    expect(repository.listProcessableParts().map((candidate) => candidate.id)).toEqual(["part0001"]);
    repository.close();
  });

  it("continues polling an old ready local part if child programs are not settled", async () => {
    const repository = PartRepository.open(":memory:");
    repository.createPart(
      {
        id: "part0001",
        status: "ready",
        name: "bracket",
        units: "mm",
        programId: "prog0001",
        programIds: ["prog0001"],
        failureCode: null,
        failureReason: null,
        createdAt: "2026-06-24T18:00:00.000Z"
      },
      cutConfigs
    );
    repository.setLocalLifecycle("part0001", "ready");
    repository.upsertProgram({
      id: "prog0001",
      url: null,
      partId: "part0001",
      cutConfigId: "cfg00001",
      cutConfigName: "Aluminum 3-axis",
      status: "processing",
      score: null,
      setupCount: null,
      totalDurationSeconds: null,
      failureCode: null,
      failureReason: null,
      createdAt: "2026-06-24T18:05:00.000Z",
      updatedAt: "2026-06-24T18:06:00.000Z"
    });

    expect(repository.listProcessableParts().map((candidate) => candidate.id)).toEqual(["part0001"]);
    repository.close();
  });

  it("marks failed Toolpath parts as failed locally", async () => {
    const repository = PartRepository.open(":memory:");
    repository.createPart(
      {
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
      [cutConfigs[0]]
    );
    repository.setLocalLifecycle("part0001", "processing");

    const toolpathClient = {
      getPart: vi.fn().mockResolvedValue({
        id: "part0001",
        status: "failed",
        name: "bracket",
        units: "mm",
        programId: null,
        programIds: [],
        failureCode: "bad_geometry",
        failureReason: "Could not process geometry",
        createdAt: "2026-06-24T18:00:00.000Z"
      }),
      getProgram: vi.fn(),
      createProgram: vi.fn()
    } as unknown as ToolpathClient;
    const processor = new PartProcessor(repository, toolpathClient);

    await processor.processPartOnce("part0001");

    const part = repository.getPart("part0001");
    expect(part.localLifecycle).toBe("failed");
    expect(part.failureCode).toBe("bad_geometry");
    expect(part.failureReason).toBe("Could not process geometry");
    expect(toolpathClient.getProgram).not.toHaveBeenCalled();
    repository.close();
  });
});
