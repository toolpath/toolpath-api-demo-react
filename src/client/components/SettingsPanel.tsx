import type { JSX } from "react";
import type { CutConfig } from "../../shared/types.js";

type SettingsPanelProps = {
  cutConfigs: CutConfig[];
  selectedCutConfigIds: string[];
  loading: boolean;
  error: string | null;
  onSelectionChange: (ids: string[]) => void;
};

export function SettingsPanel({
  cutConfigs,
  selectedCutConfigIds,
  loading,
  error,
  onSelectionChange,
}: SettingsPanelProps): JSX.Element {
  const selectedIds = new Set(selectedCutConfigIds);

  function toggleCutConfig(id: string): void {
    if (selectedIds.has(id)) {
      onSelectionChange(
        selectedCutConfigIds.filter((selectedId) => selectedId !== id),
      );
      return;
    }

    onSelectionChange([...selectedCutConfigIds, id]);
  }

  return (
    <section className="settings-panel" aria-labelledby="settings-heading">
      <div className="panel-heading">
        <div>
          <h2 id="settings-heading">Cut configs</h2>
        </div>
        <span className="selected-count">
          {selectedCutConfigIds.length} selected
        </span>
      </div>

      {loading ? <p className="muted">Loading cut configs...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="cut-config-list">
        {cutConfigs.map((cutConfig) => (
          <label className="cut-config-option" key={cutConfig.id}>
            <input
              type="checkbox"
              checked={selectedIds.has(cutConfig.id)}
              onChange={() => toggleCutConfig(cutConfig.id)}
            />
            <span>
              <strong>{cutConfig.name}</strong>
              <small>
                {cutConfig.isDefault ? "Default · " : ""}
                {cutConfig.tools} tools · {cutConfig.toolLibraries} libraries
                {cutConfig.readOnly ? " · read-only" : ""}
              </small>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
