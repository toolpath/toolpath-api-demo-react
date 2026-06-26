export type ToolpathStatus = "processing" | "ready" | "failed" | "created" | string;

export type LocalPartLifecycle = "created" | "uploading" | "processing" | "ready" | "failed";

export type CutConfig = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
  isDefault: boolean;
  readOnly: boolean;
  generic: boolean;
  toolLibraries: number;
  tools: number;
};

export type ProgramSummary = {
  id: string;
  url: string | null;
  partId: string;
  cutConfigId: string | null;
  cutConfigName: string | null;
  status: ToolpathStatus;
  score: number | null;
  setupCount: number | null;
  totalDurationSeconds: number | null;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ExpectedProgramRow = {
  cutConfigId: string;
  cutConfigName: string;
  programId: string | null;
  programUrl: string | null;
  status: ToolpathStatus | LocalPartLifecycle;
  score: number | null;
  setupCount: number | null;
  totalDurationSeconds: number | null;
  failureReason: string | null;
};

export type PartSummary = {
  id: string;
  name: string;
  units: string;
  localLifecycle: LocalPartLifecycle;
  toolpathStatus: ToolpathStatus;
  programId: string | null;
  programIds: string[];
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  averageScore: number | null;
  rows: ExpectedProgramRow[];
};

export type PartsResponse = {
  parts: PartSummary[];
};

export type CutConfigsResponse = {
  cutConfigs: CutConfig[];
};

export type UploadPartResponse = {
  part: PartSummary;
};

export type ProgramToolpathResponse = {
  program: ProgramSummary;
  toolpathResponse: unknown;
};
