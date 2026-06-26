import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

vi.mock("./api.js", () => ({
  fetchCutConfigs: vi.fn().mockResolvedValue({ cutConfigs: [] }),
  fetchParts: vi.fn().mockResolvedValue({ parts: [] }),
  fetchProgramToolpathResponse: vi.fn(),
  uploadPart: vi.fn()
}));

describe("App", () => {
  it("links to the Toolpath API docs from the demo ribbon", async () => {
    render(<App />);

    const link = await screen.findByRole("link", { name: "API docs" });
    expect(screen.getByText("Toolpath Public API Demo")).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://docs.toolpath.com/api");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
