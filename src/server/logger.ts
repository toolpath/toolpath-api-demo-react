const MAX_LOG_LENGTH = 4000;
const SENSITIVE_KEYS = new Set(["authorization", "apiKey", "token", "secret", "password"]);

let shouldLogToolpathBodies = false;

export function configureLogger(options: { logToolpathBodies: boolean }): void {
  shouldLogToolpathBodies = options.logToolpathBodies;
}

export function logLocalRequest(method: string, url: string, statusCode: number, durationMs: number): void {
  console.log(`[local] ${method} ${url} -> ${statusCode} ${durationMs}ms`);
}

export function logToolpathRequest(method: string, url: string, body?: unknown): void {
  const bodyText = shouldLogToolpathBodies && body !== undefined ? ` body=${formatLogValue(body)}` : "";
  console.log(`[toolpath] -> ${method} ${sanitizeUrl(url)}${bodyText}`);
}

export function logToolpathResponse(method: string, url: string, statusCode: number, durationMs: number, body?: unknown): void {
  const bodyText = shouldLogToolpathBodies && body !== undefined ? ` body=${formatLogValue(body)}` : "";
  console.log(
    `[toolpath] <- ${method} ${sanitizeUrl(url)} -> ${statusCode} ${durationMs}ms${bodyText}`
  );
}

export function formatLogValue(value: unknown): string {
  const serialized = JSON.stringify(sanitizeValue(value));

  if (serialized.length <= MAX_LOG_LENGTH) {
    return serialized;
  }

  return `${serialized.slice(0, MAX_LOG_LENGTH)}...<truncated>`;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        return [key, "<redacted>"];
      }

      if (key.toLowerCase() === "url" && typeof nestedValue === "string") {
        return [key, sanitizeUrl(nestedValue)];
      }

      return [key, sanitizeValue(nestedValue)];
    })
  );
}

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}
