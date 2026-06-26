import type { CutConfigsResponse, PartsResponse, ProgramToolpathResponse, UploadPartResponse } from "../shared/types.js";

export async function fetchCutConfigs(): Promise<CutConfigsResponse> {
  return requestJson<CutConfigsResponse>("/api/cut-configs");
}

export async function fetchParts(): Promise<PartsResponse> {
  return requestJson<PartsResponse>("/api/parts");
}

export async function uploadPart(file: File, cutConfigIds: string[]): Promise<UploadPartResponse> {
  const formData = new FormData();
  formData.append("stepFile", file);
  formData.append("cutConfigIds", JSON.stringify(cutConfigIds));
  formData.append("units", "mm");

  const response = await fetch("/api/parts", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Upload failed with ${response.status}`);
  }

  return response.json() as Promise<UploadPartResponse>;
}

export async function fetchProgramToolpathResponse(partId: string, programId: string): Promise<ProgramToolpathResponse> {
  return requestJson<ProgramToolpathResponse>(
    `/api/parts/${encodeURIComponent(partId)}/programs/${encodeURIComponent(programId)}/toolpath`
  );
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}
