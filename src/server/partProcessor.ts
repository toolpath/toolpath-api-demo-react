import { isPartFullySettled, type PartRepository } from "./db.js";
import type { ToolpathClient } from "./toolpathClient.js";

const TERMINAL_FAILURE_STATUSES = new Set(["failed", "error", "cancelled"]);

export class PartProcessor {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly repository: PartRepository,
    private readonly toolpathClient: ToolpathClient
  ) {}

  async processPartOnce(partId: string): Promise<void> {
    console.log(`[poll] checking part ${partId}`);
    const remotePart = await this.toolpathClient.getPart(partId);
    const isFailed = TERMINAL_FAILURE_STATUSES.has(remotePart.status.toLowerCase()) || Boolean(remotePart.failureCode);
    const isReady = remotePart.status.toLowerCase() === "ready";

    this.repository.updateToolpathPart(remotePart, isFailed ? "failed" : "processing");

    for (const programId of remotePart.programIds) {
      const program = await this.toolpathClient.getProgram(partId, programId);
      this.repository.upsertProgram(program);

      if (isReady) {
        try {
          const machinability = await this.toolpathClient.getProgramMachinability(partId, programId);
          this.repository.updateProgramMachinability(machinability);
        } catch (error) {
          console.warn(`Machinability fetch failed for program ${programId}`, error);
        }
      }
    }

    const updatedPart = this.repository.getPart(partId);
    // Keep polling after the part is ready until every auto-created program has
    // reached a terminal state and has either machinability data or a failure.
    if (!isFailed && isReady && isPartFullySettled(updatedPart)) {
      this.repository.setLocalLifecycle(partId, "ready");
    }
  }

  async processAllOnce(): Promise<void> {
    const parts = this.repository.listProcessableParts();
    if (parts.length > 0) {
      console.log(`[poll] checking ${parts.length} processing part${parts.length === 1 ? "" : "s"}`);
    }
    await Promise.all(parts.map((part) => this.processPartOnce(part.id)));
  }

  start(intervalMs: number): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.processAllOnce().catch((error) => {
        console.error("Part polling failed", error);
      });
    }, intervalMs);
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }
}
