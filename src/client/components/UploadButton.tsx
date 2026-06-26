import type { JSX } from "react";

type UploadButtonProps = {
  selectedCutConfigCount: number;
  uploading: boolean;
  onUpload: (file: File) => void;
};

export function UploadButton({ selectedCutConfigCount, uploading, onUpload }: UploadButtonProps): JSX.Element {
  const disabled = uploading || selectedCutConfigCount === 0;

  return (
    <div className="upload-card">
      <label className={`upload-button ${disabled ? "disabled" : ""}`}>
        <input
          aria-label="Upload STEP file"
          type="file"
          accept=".step,.stp"
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              onUpload(file);
            }
          }}
        />
        {uploading ? "Uploading..." : "Upload STEP"}
      </label>
      {selectedCutConfigCount === 0 ? <span className="upload-hint">Select at least one cut config first.</span> : null}
    </div>
  );
}
