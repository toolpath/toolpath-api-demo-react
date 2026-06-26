import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { fetchCutConfigs, fetchParts, fetchProgramToolpathResponse, uploadPart } from "./api.js";
import { PartsDashboard } from "./components/PartsDashboard.js";
import { SettingsPanel } from "./components/SettingsPanel.js";
import { UploadButton } from "./components/UploadButton.js";
import type { CutConfig, PartSummary } from "../shared/types.js";

const SELECTED_CUT_CONFIGS_STORAGE_KEY = "tp-api-demo:selected-cut-configs";

export function App(): JSX.Element {
  const [cutConfigs, setCutConfigs] = useState<CutConfig[]>([]);
  const [selectedCutConfigIds, setSelectedCutConfigIds] = useState<string[]>(readStoredSelectedCutConfigs);
  const [parts, setParts] = useState<PartSummary[]>([]);
  const [cutConfigError, setCutConfigError] = useState<string | null>(null);
  const [partsError, setPartsError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadingCutConfigs, setLoadingCutConfigs] = useState(true);
  const [loadingParts, setLoadingParts] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadParts = useCallback(async () => {
    try {
      const payload = await fetchParts();
      setParts(payload.parts);
      setPartsError(null);
    } catch (error) {
      setPartsError(error instanceof Error ? error.message : "Could not load parts");
    } finally {
      setLoadingParts(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCutConfigs(): Promise<void> {
      try {
        const payload = await fetchCutConfigs();
        if (cancelled) {
          return;
        }

        setCutConfigs(payload.cutConfigs);
        setCutConfigError(null);
        setSelectedCutConfigIds((current) => {
          if (current.length > 0 || payload.cutConfigs.length === 0) {
            return current;
          }

          const defaults = payload.cutConfigs.filter((cutConfig) => cutConfig.isDefault).map((cutConfig) => cutConfig.id);
          return defaults.length > 0 ? defaults : [payload.cutConfigs[0].id];
        });
      } catch (error) {
        if (!cancelled) {
          setCutConfigError(error instanceof Error ? error.message : "Could not load cut configs");
        }
      } finally {
        if (!cancelled) {
          setLoadingCutConfigs(false);
        }
      }
    }

    void loadCutConfigs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadParts();
    const interval = window.setInterval(() => {
      void loadParts();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [loadParts]);

  useEffect(() => {
    window.localStorage.setItem(SELECTED_CUT_CONFIGS_STORAGE_KEY, JSON.stringify(selectedCutConfigIds));
  }, [selectedCutConfigIds]);

  const selectedCutConfigCount = useMemo(() => selectedCutConfigIds.length, [selectedCutConfigIds]);

  async function handleUpload(file: File): Promise<void> {
    setUploading(true);
    setUploadError(null);

    try {
      await uploadPart(file, selectedCutConfigIds);
      await loadParts();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleProgramStatusClick(partId: string, programId: string): Promise<void> {
    try {
      const payload = await fetchProgramToolpathResponse(partId, programId);
      console.groupCollapsed(`[toolpath] GET /parts/${partId}/programs/${programId}`);
      console.log(payload.toolpathResponse);
      console.groupEnd();
      await loadParts();
    } catch (error) {
      console.error(`[toolpath] GET /parts/${partId}/programs/${programId} failed`, error);
      setPartsError(error instanceof Error ? error.message : "Could not fetch Toolpath program response");
    }
  }

  return (
    <main className="app-shell">
      <div className="demo-ribbon">
        <span>Toolpath Public API Demo</span>
        <a href="https://docs.toolpath.com/api" target="_blank" rel="noreferrer">
          API docs
        </a>
      </div>
      <header className="top-bar">
        <div>
          <h1>Toolpath API Dashboard</h1>
          <p>Upload STEP files and process them with selected cut configs.</p>
        </div>
        <UploadButton
          selectedCutConfigCount={selectedCutConfigCount}
          uploading={uploading}
          onUpload={(file) => {
            void handleUpload(file);
          }}
        />
      </header>

      <div className="content-area">
        <aside className="settings-column">
          <SettingsPanel
            cutConfigs={cutConfigs}
            selectedCutConfigIds={selectedCutConfigIds}
            loading={loadingCutConfigs}
            error={cutConfigError}
            onSelectionChange={setSelectedCutConfigIds}
          />
        </aside>

        <div className="main-column">
          {uploadError ? <p className="error top-error">{uploadError}</p> : null}

          <PartsDashboard
            parts={parts}
            loading={loadingParts}
            error={partsError}
            onProgramStatusClick={(partId, programId) => {
              void handleProgramStatusClick(partId, programId);
            }}
          />
        </div>
      </div>
    </main>
  );
}

function readStoredSelectedCutConfigs(): string[] {
  try {
    const value = window.localStorage.getItem(SELECTED_CUT_CONFIGS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
