import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PartsDashboard } from "./PartsDashboard.js";
import { SettingsPanel } from "./SettingsPanel.js";
import { UploadButton } from "./UploadButton.js";
import type { CutConfig, PartSummary } from "../../shared/types.js";

const cutConfigs: CutConfig[] = [
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

describe("SettingsPanel", () => {
  it("renders cut config metadata and toggles selection", async () => {
    const onSelectionChange = vi.fn();
    render(
      <SettingsPanel
        cutConfigs={cutConfigs}
        selectedCutConfigIds={["cfg00001"]}
        loading={false}
        error={null}
        onSelectionChange={onSelectionChange}
      />
    );

    expect(screen.getByText("Aluminum 3-axis")).toBeInTheDocument();
    expect(screen.getByText(/148 tools/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/DFM Cut Config/));

    expect(onSelectionChange).toHaveBeenCalledWith(["cfg00001", "cfg00002"]);
  });
});

describe("UploadButton", () => {
  it("is disabled until a cut config is selected", () => {
    render(<UploadButton selectedCutConfigCount={0} uploading={false} onUpload={vi.fn()} />);

    expect(screen.getByLabelText("Upload STEP file")).toBeDisabled();
    expect(screen.getByText("Select at least one cut config first.")).toBeInTheDocument();
  });

  it("passes the selected file to onUpload", async () => {
    const onUpload = vi.fn();
    const file = new File(["step"], "bracket.step", { type: "application/step" });
    render(<UploadButton selectedCutConfigCount={1} uploading={false} onUpload={onUpload} />);

    fireEvent.change(screen.getByLabelText("Upload STEP file"), {
      target: {
        files: [file]
      }
    });

    expect(onUpload).toHaveBeenCalledWith(file);
  });
});

describe("PartsDashboard", () => {
  it("renders part rows with nested cut-config program rows", () => {
    const parts: PartSummary[] = [
      {
        id: "part0001",
        name: "bracket",
        units: "mm",
        localLifecycle: "ready",
        toolpathStatus: "ready",
        programId: "prog0001",
        programIds: ["prog0001", "prog0002"],
        failureCode: null,
        failureReason: null,
        createdAt: "2026-06-24T18:00:00.000Z",
        averageScore: 85,
        rows: [
          {
            cutConfigId: "cfg00001",
            cutConfigName: "Aluminum 3-axis",
            programId: "prog0001",
            programUrl: "https://app.toolpath.com/programs/prog0001",
            status: "ready",
            score: 80,
            setupCount: 2,
            totalDurationSeconds: 125,
            failureReason: null
          },
          {
            cutConfigId: "cfg00002",
            cutConfigName: "DFM Cut Config",
            programId: "prog0002",
            programUrl: null,
            status: "processing",
            score: null,
            setupCount: null,
            totalDurationSeconds: null,
            failureReason: null
          }
        ]
      }
    ];

    render(<PartsDashboard parts={parts} loading={false} error={null} />);

    expect(screen.getByText("bracket")).toBeInTheDocument();
    expect(screen.getByText("Aluminum 3-axis")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Aluminum 3-axis/ })).toHaveAttribute(
      "href",
      "https://app.toolpath.com/programs/prog0001"
    );
    expect(screen.getByRole("link", { name: /Aluminum 3-axis/ })).toHaveAttribute("target", "_blank");
    expect(screen.getByText("DFM Cut Config")).toBeInTheDocument();
    expect(screen.getAllByText("80.0").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("2 / 2 / 2")).toBeInTheDocument();
    expect(screen.getByText("2:05 / 2:05 / 2:05")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("2:05")).toBeInTheDocument();
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
  });

  it("calls back with the part id and program id when a program status is clicked", () => {
    const onProgramStatusClick = vi.fn();
    const parts: PartSummary[] = [
      {
        id: "part0001",
        name: "bracket",
        units: "mm",
        localLifecycle: "ready",
        toolpathStatus: "ready",
        programId: "prog0001",
        programIds: ["prog0001"],
        failureCode: null,
        failureReason: null,
        createdAt: "2026-06-24T18:00:00.000Z",
        averageScore: 80,
        rows: [
          {
            cutConfigId: "cfg00001",
            cutConfigName: "Aluminum 3-axis",
            programId: "prog0001",
            programUrl: null,
            status: "ready",
            score: 80,
            setupCount: 2,
            totalDurationSeconds: 125,
            failureReason: null
          }
        ]
      }
    ];

    render(
      <PartsDashboard
        parts={parts}
        loading={false}
        error={null}
        onProgramStatusClick={onProgramStatusClick}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "ready" }));

    expect(onProgramStatusClick).toHaveBeenCalledWith("part0001", "prog0001");
  });
});
