import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLogger, logToolpathRequest, logToolpathResponse } from "./logger.js";

describe("logger", () => {
  afterEach(() => {
    configureLogger({ logToolpathBodies: false });
    vi.restoreAllMocks();
  });

  it("omits Toolpath bodies by default", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logToolpathRequest("POST", "https://example.com/api?signature=secret", { token: "abc" });
    logToolpathResponse("POST", "https://example.com/api?signature=secret", 200, 12, { token: "abc" });

    expect(logSpy).toHaveBeenCalledWith("[toolpath] -> POST https://example.com/api");
    expect(logSpy).toHaveBeenCalledWith("[toolpath] <- POST https://example.com/api -> 200 12ms");
  });

  it("logs sanitized bodies when enabled", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    configureLogger({ logToolpathBodies: true });

    logToolpathRequest("POST", "https://example.com/api?signature=secret", {
      token: "abc",
      url: "https://s3.example.com/upload?signature=secret"
    });

    expect(logSpy).toHaveBeenCalledWith(
      '[toolpath] -> POST https://example.com/api body={"token":"<redacted>","url":"https://s3.example.com/upload"}'
    );
  });
});
