import { randomUUID } from "node:crypto";
import type { CutConfig, ProgramSummary, ToolpathStatus } from "../shared/types.js";
import { logToolpathRequest, logToolpathResponse } from "./logger.js";

type FetchLike = typeof fetch;

type ToolpathClientOptions = {
  apiRoot: string;
  apiKey: string;
  fetchImpl?: FetchLike;
  createIdempotencyKey?: () => string;
};

export type ToolpathPartData = {
  id: string;
  status: ToolpathStatus;
  name: string;
  units: string;
  programId: string | null;
  programIds: string[];
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
};

export type CreatePartResult = {
  data: ToolpathPartData;
  upload: {
    url: string;
    method: string;
    expiresAt: string;
  };
};

export type CreatePartRequest = {
  name: string;
  units: string;
  stepFileName: string;
  cutConfigIds: string[];
};

export type CreateProgramRequest = {
  partId: string;
  cutConfigId?: string | null;
};

export type ProgramWithRawResponse = {
  program: ProgramSummary;
  raw: unknown;
};

export type ProgramMachinabilitySummary = {
  partId: string;
  programId: string;
  status: ToolpathStatus;
  machinabilityScore: number | null;
  setupCount: number | null;
  totalDurationSeconds: number | null;
  failureCode: string | null;
  failureReason: string | null;
};

type ToolpathCutConfigPayload = {
  data?: {
    cutConfigs?: unknown[];
  };
};

type ToolpathPartPayload = {
  data?: Partial<ToolpathPartData>;
  upload?: CreatePartResult["upload"];
};

type ToolpathProgramPayload = {
  data?: Record<string, unknown>;
};

type ToolpathMachinabilityPayload = {
  data?: Record<string, unknown>;
};

export class ToolpathApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
  }
}

export class ToolpathClient {
  private readonly fetchImpl: FetchLike;
  private readonly createIdempotencyKey: () => string;

  constructor(private readonly options: ToolpathClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.createIdempotencyKey = options.createIdempotencyKey ?? randomUUID;
  }

  async getCutConfigs(): Promise<CutConfig[]> {
    const payload = (await this.requestJson("/cut-configs")) as ToolpathCutConfigPayload;
    return (payload.data?.cutConfigs ?? []).map(normalizeCutConfig);
  }

  async createPart(request: CreatePartRequest): Promise<CreatePartResult> {
    const payload = (await this.requestJson("/parts", {
      method: "POST",
      headers: this.writeHeaders(),
      body: JSON.stringify({
        name: request.name,
        units: request.units,
        stepFileName: request.stepFileName,
        autoCreateProgram: true,
        cutConfigIds: request.cutConfigIds
      })
    })) as ToolpathPartPayload;

    if (!payload.data || !payload.upload) {
      throw new Error("Toolpath create part response is missing data or upload details");
    }

    return {
      data: normalizePartData(payload.data),
      upload: {
        url: String(payload.upload.url),
        method: String(payload.upload.method ?? "PUT"),
        expiresAt: String(payload.upload.expiresAt)
      }
    };
  }

  async uploadStepFile(upload: CreatePartResult["upload"], file: Buffer): Promise<void> {
    const body = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const startedAt = performance.now();
    logToolpathRequest(upload.method, upload.url, { bytes: file.byteLength });
    const response = await this.fetchImpl(upload.url, {
      method: upload.method,
      body
    });
    const responseBody = response.ok ? undefined : await response.text();
    logToolpathResponse(upload.method, upload.url, response.status, Math.round(performance.now() - startedAt), responseBody);

    if (!response.ok) {
      throw new ToolpathApiError(
        `STEP upload failed with ${response.status}`,
        response.status,
        responseBody ?? ""
      );
    }
  }

  async completePartUpload(partId: string): Promise<ToolpathPartData> {
    const payload = (await this.requestJson(`/parts/${encodeURIComponent(partId)}/complete`, {
      method: "POST",
      headers: this.writeHeaders()
    })) as ToolpathPartPayload;

    if (!payload.data) {
      throw new Error("Toolpath complete part response is missing data");
    }

    return normalizePartData(payload.data);
  }

  async getPart(partId: string): Promise<ToolpathPartData> {
    const payload = (await this.requestJson(`/parts/${encodeURIComponent(partId)}`)) as ToolpathPartPayload;

    if (!payload.data) {
      throw new Error("Toolpath get part response is missing data");
    }

    return normalizePartData(payload.data);
  }

  async createProgram(request: CreateProgramRequest): Promise<ProgramSummary> {
    const body: Record<string, string | null> = {};

    if ("cutConfigId" in request) {
      body.cutConfigId = request.cutConfigId ?? null;
    }

    const payload = (await this.requestJson(`/parts/${encodeURIComponent(request.partId)}/programs`, {
      method: "POST",
      headers: this.writeHeaders(),
      body: JSON.stringify(body)
    })) as ToolpathProgramPayload;

    if (!payload.data) {
      throw new Error("Toolpath create program response is missing data");
    }

    return normalizeProgram(payload.data);
  }

  async getProgram(partId: string, programId: string): Promise<ProgramSummary> {
    return (await this.getProgramWithRaw(partId, programId)).program;
  }

  async getProgramWithRaw(partId: string, programId: string): Promise<ProgramWithRawResponse> {
    const payload = (await this.requestJson(
      `/parts/${encodeURIComponent(partId)}/programs/${encodeURIComponent(programId)}`
    )) as ToolpathProgramPayload;

    if (!payload.data) {
      throw new Error("Toolpath get program response is missing data");
    }

    return {
      program: normalizeProgram(payload.data),
      raw: payload
    };
  }

  async getProgramMachinability(partId: string, programId: string): Promise<ProgramMachinabilitySummary> {
    const payload = (await this.requestJson(
      `/parts/${encodeURIComponent(partId)}/programs/${encodeURIComponent(programId)}/machinability`
    )) as ToolpathMachinabilityPayload;

    if (!payload.data) {
      throw new Error("Toolpath program machinability response is missing data");
    }

    return normalizeProgramMachinability(payload.data);
  }

  private async requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
    const method = init.method ?? "GET";
    const url = `${this.options.apiRoot}${path}`;
    const startedAt = performance.now();
    logToolpathRequest(method, url, parseJsonBody(init.body));

    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        Accept: "application/json",
        ...(init.headers ?? {})
      }
    });
    const text = await response.text();
    const responseBody = parseJsonText(text) ?? text;
    logToolpathResponse(method, url, response.status, Math.round(performance.now() - startedAt), responseBody);

    if (!response.ok) {
      throw new ToolpathApiError(
        `Toolpath request failed with ${response.status}`,
        response.status,
        text
      );
    }

    return responseBody;
  }

  private writeHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Idempotency-Key": this.createIdempotencyKey()
    };
  }
}

function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") {
    return undefined;
  }

  return parseJsonText(body) ?? body;
}

function parseJsonText(text: string): unknown {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function normalizeCutConfig(raw: unknown): CutConfig {
  const record = asRecord(raw);

  return {
    id: String(record.id),
    name: String(record.name),
    createdAt: optionalString(record.createdAt) ?? undefined,
    updatedAt: optionalString(record.updatedAt) ?? undefined,
    isDefault: Boolean(record.isDefault),
    readOnly: Boolean(record.readOnly),
    generic: Boolean(record.generic),
    toolLibraries: Number(record.toolLibraries ?? 0),
    tools: Number(record.tools ?? 0)
  };
}

export function normalizePartData(raw: Partial<ToolpathPartData>): ToolpathPartData {
  return {
    id: String(raw.id),
    status: String(raw.status ?? "processing"),
    name: String(raw.name ?? "Untitled part"),
    units: String(raw.units ?? "mm"),
    programId: raw.programId ? String(raw.programId) : null,
    programIds: Array.isArray(raw.programIds) ? raw.programIds.map(String) : [],
    failureCode: raw.failureCode ? String(raw.failureCode) : null,
    failureReason: raw.failureReason ? String(raw.failureReason) : null,
    createdAt: String(raw.createdAt ?? new Date().toISOString())
  };
}

export function normalizeProgram(raw: Record<string, unknown>): ProgramSummary {
  return {
    id: String(raw.id),
    url: optionalString(raw.url),
    partId: String(raw.partId),
    cutConfigId: optionalString(raw.cutConfigId),
    cutConfigName: optionalString(raw.cutConfigName),
    status: String(raw.status ?? "processing"),
    score: extractScore(raw),
    setupCount: null,
    totalDurationSeconds: null,
    failureCode: optionalString(raw.failureCode),
    failureReason: optionalString(raw.failureReason),
    createdAt: optionalString(raw.createdAt),
    updatedAt: optionalString(raw.updatedAt)
  };
}

export function normalizeProgramMachinability(raw: Record<string, unknown>): ProgramMachinabilitySummary {
  const setups = Array.isArray(raw.setups) ? raw.setups.map(asRecord) : [];
  const totalDurationSeconds = setups.reduce((sum, setup) => {
    const duration = Number(setup.machiningTimeSeconds ?? 0);
    return Number.isFinite(duration) ? sum + duration : sum;
  }, 0);

  return {
    partId: String(raw.partId),
    programId: String(raw.programId),
    status: String(raw.status ?? "processing"),
    machinabilityScore: extractScore(raw),
    setupCount: setups.length,
    totalDurationSeconds,
    failureCode: optionalString(raw.failureCode),
    failureReason: optionalString(raw.failureReason)
  };
}

export function extractScore(raw: Record<string, unknown>): number | null {
  const candidates = [
    raw.score,
    raw.machinabilityScore,
    raw.averageScore,
    asRecordOrNull(raw.estimate)?.score,
    asRecordOrNull(raw.summary)?.score
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === "string" && candidate.trim() !== "") {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as Record<string, unknown>;
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}
