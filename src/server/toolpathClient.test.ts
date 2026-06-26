import { describe, expect, it, vi } from "vitest";
import { normalizeToolpathApiRoot } from "./config.js";
import { ToolpathClient, extractScore } from "./toolpathClient.js";

describe("normalizeToolpathApiRoot", () => {
  it("adds the public API path when only an origin is provided", () => {
    expect(normalizeToolpathApiRoot("https://app.toolpath.com")).toBe("https://app.toolpath.com/api/public/v0");
  });

  it("does not duplicate the public API path", () => {
    expect(normalizeToolpathApiRoot("https://app.toolpath.com/api/public/v0/")).toBe(
      "https://app.toolpath.com/api/public/v0"
    );
  });
});

describe("ToolpathClient", () => {
  it("normalizes cut configs from data.cutConfigs", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: {
          cutConfigs: [
            {
              id: "cfg00001",
              name: "Aluminum 3-axis",
              isDefault: true,
              readOnly: false,
              generic: false,
              toolLibraries: 2,
              tools: 148
            }
          ]
        }
      })
    );
    const client = new ToolpathClient({ apiRoot: "https://example.com/api/public/v0", apiKey: "tp_test", fetchImpl: fetchMock });

    await expect(client.getCutConfigs()).resolves.toEqual([
      expect.objectContaining({
        id: "cfg00001",
        name: "Aluminum 3-axis",
        isDefault: true,
        toolLibraries: 2,
        tools: 148
      })
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/public/v0/cut-configs",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tp_test",
          Accept: "application/json"
        })
      })
    );
  });

  it("sends the create-part body and idempotency key", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
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
      })
    );
    const client = new ToolpathClient({
      apiRoot: "https://example.com/api/public/v0",
      apiKey: "tp_test",
      fetchImpl: fetchMock,
      createIdempotencyKey: () => "idem-1"
    });

    await client.createPart({
      name: "bracket",
      units: "mm",
      stepFileName: "bracket.step",
      cutConfigIds: ["cfg00001", "cfg00002"]
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/public/v0/parts",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tp_test",
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-1"
        }),
        body: JSON.stringify({
          name: "bracket",
          units: "mm",
          stepFileName: "bracket.step",
          autoCreateProgram: true,
          cutConfigIds: ["cfg00001", "cfg00002"]
        })
      })
    );
  });

  it("normalizes currentProgramId from current part responses", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: {
          id: "part0001",
          status: "ready",
          name: "bracket",
          units: "mm",
          currentProgramId: "prog0001",
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:00:00.000Z"
        }
      })
    );
    const client = new ToolpathClient({ apiRoot: "https://example.com/api/public/v0", apiKey: "tp_test", fetchImpl: fetchMock });

    await expect(client.getPart("part0001")).resolves.toEqual(
      expect.objectContaining({
        id: "part0001",
        programId: "prog0001",
        programIds: []
      })
    );
  });

  it("sends the nested create-program body with optional cutConfigId", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: {
          id: "prog0002",
          status: "processing",
          partId: "part0001",
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:05:00.000Z",
          updatedAt: "2026-06-24T18:05:00.000Z"
        }
      })
    );
    const client = new ToolpathClient({
      apiRoot: "https://example.com/api/public/v0",
      apiKey: "tp_test",
      fetchImpl: fetchMock,
      createIdempotencyKey: () => "idem-2"
    });

    await client.createProgram({ partId: "part0001", cutConfigId: "cfg00002" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/public/v0/parts/part0001/programs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "idem-2"
        }),
        body: JSON.stringify({
          cutConfigId: "cfg00002"
        })
      })
    );
  });

  it("lists programs through the nested part route", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: {
          programs: [
            {
              id: "prog0002",
              url: "https://app.toolpath.com/parts/prog0002/report",
              status: "processing",
              partId: "part0001",
              cutConfigId: "cfg00002",
              cutConfigName: "DFM Cut Config",
              createdAt: "2026-06-24T18:05:00.000Z",
              updatedAt: "2026-06-24T18:05:00.000Z"
            }
          ]
        }
      })
    );
    const client = new ToolpathClient({
      apiRoot: "https://example.com/api/public/v0",
      apiKey: "tp_test",
      fetchImpl: fetchMock
    });

    await expect(client.listPrograms("part0001")).resolves.toEqual([
      expect.objectContaining({
        id: "prog0002",
        partId: "part0001",
        cutConfigId: "cfg00002",
        cutConfigName: "DFM Cut Config",
        url: "https://app.toolpath.com/parts/prog0002/report"
      })
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/public/v0/parts/part0001/programs",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tp_test"
        })
      })
    );
  });

  it("fetches programs through the nested part route", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: {
          id: "prog0002",
          status: "ready",
          partId: "part0001",
          failureCode: null,
          failureReason: null,
          createdAt: "2026-06-24T18:05:00.000Z",
          updatedAt: "2026-06-24T18:05:00.000Z"
        }
      })
    );
    const client = new ToolpathClient({
      apiRoot: "https://example.com/api/public/v0",
      apiKey: "tp_test",
      fetchImpl: fetchMock
    });

    await client.getProgramWithRaw("part0001", "prog0002");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/public/v0/parts/part0001/programs/prog0002",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tp_test"
        })
      })
    );
  });

  it("fetches nested program machinability and sums setup durations", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: {
          partId: "part0001",
          programId: "prog0002",
          status: "ready",
          machinabilityScore: 72,
          setups: [
            {
              id: "setup1",
              machiningTimeSeconds: 65
            },
            {
              id: "setup2",
              machiningTimeSeconds: 125
            }
          ],
          failureCode: null,
          failureReason: null
        }
      })
    );
    const client = new ToolpathClient({
      apiRoot: "https://example.com/api/public/v0",
      apiKey: "tp_test",
      fetchImpl: fetchMock
    });

    await expect(client.getProgramMachinability("part0001", "prog0002")).resolves.toEqual({
      partId: "part0001",
      programId: "prog0002",
      status: "ready",
      machinabilityScore: 72,
      setupCount: 2,
      totalDurationSeconds: 190,
      failureCode: null,
      failureReason: null
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/public/v0/parts/part0001/programs/prog0002/machinability",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tp_test"
        })
      })
    );
  });

  it("sends complete after the upload is finished", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
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
        }
      })
    );
    const client = new ToolpathClient({
      apiRoot: "https://example.com/api/public/v0",
      apiKey: "tp_test",
      fetchImpl: fetchMock,
      createIdempotencyKey: () => "idem-complete"
    });

    await client.completePartUpload("part0001");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/api/public/v0/parts/part0001/complete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tp_test",
          "Idempotency-Key": "idem-complete"
        })
      })
    );
  });

  it("reports the configured API host when fetch cannot connect", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const client = new ToolpathClient({
      apiRoot: "http://localhost:3000/api/public/v0",
      apiKey: "tp_test",
      fetchImpl: fetchMock
    });

    await expect(client.getCutConfigs()).rejects.toThrow(
      "Could not reach Toolpath API at http://localhost:3000/api/public/v0/cut-configs: fetch failed"
    );
  });
});

describe("extractScore", () => {
  it("returns nullable scores from known possible fields", () => {
    expect(extractScore({ score: "82.5" })).toBe(82.5);
    expect(extractScore({ summary: { score: 91 } })).toBe(91);
    expect(extractScore({ setups: [] })).toBeNull();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
