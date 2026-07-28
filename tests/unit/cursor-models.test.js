import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// agent.api5.cursor.sh is HTTP/2-only, so cursorModels.js talks to it via
// Node's raw http2 module instead of fetch — mock that transport here.
let lastRequest = null;
let requestCount = 0;
let mockResponse = { status: 200, body: new Uint8Array(0) };

vi.mock("http2", () => ({
  default: {
    connect: () => ({
      close: () => {},
      on: () => {},
      request: (headers) => {
        const req = new EventEmitter();
        req.end = (body) => {
          requestCount += 1;
          lastRequest = { headers, body };
          queueMicrotask(() => {
            req.emit("response", { ":status": mockResponse.status });
            req.emit("data", Buffer.from(mockResponse.body));
            req.emit("end");
          });
        };
        return req;
      },
    }),
  },
}));

const {
  clearCursorModelCache,
  parseCursorUsableModels,
  resolveCursorModels,
} = await import("../../open-sse/services/cursorModels.js");

const originalFetch = global.fetch;

function varint(value) {
  const bytes = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return Uint8Array.from(bytes);
}

function field(fieldNumber, value) {
  return Uint8Array.from([(fieldNumber << 3) | 2, ...varint(value.length), ...value]);
}

function text(value) {
  return new TextEncoder().encode(value);
}

function concat(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function model(id, name) {
  return field(1, concat(field(1, text(id)), field(4, text(name))));
}

describe("Cursor live model catalog", () => {
  beforeEach(() => {
    lastRequest = null;
    requestCount = 0;
    mockResponse = { status: 200, body: new Uint8Array(0) };
    clearCursorModelCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    clearCursorModelCache();
  });

  it("decodes the GetUsableModels protobuf response", () => {
    const payload = concat(
      model("default", "Auto"),
      model("gpt-5.3-codex", "GPT 5.3 Codex"),
      model("gpt-5.3-codex", "Duplicate"),
    );

    expect(parseCursorUsableModels(payload)).toEqual([
      { id: "default", name: "Auto" },
      { id: "gpt-5.3-codex", name: "GPT 5.3 Codex" },
    ]);
  });

  it("fetches the account-specific catalog and caches it", async () => {
    mockResponse = {
      status: 200,
      body: concat(model("claude-4.6-opus", "Claude 4.6 Opus")),
    };
    const credentials = {
      accessToken: "cursor-token",
      providerSpecificData: { machineId: "machine-id" },
    };

    await expect(resolveCursorModels(credentials)).resolves.toEqual({
      models: [{ id: "claude-4.6-opus", name: "Claude 4.6 Opus" }],
    });
    await expect(resolveCursorModels(credentials)).resolves.toEqual({
      models: [{ id: "claude-4.6-opus", name: "Claude 4.6 Opus" }],
    });

    expect(requestCount).toBe(1);
    expect(lastRequest.headers).toEqual(
      expect.objectContaining({
        ":method": "POST",
        "content-type": "application/proto",
        accept: "application/proto",
      }),
    );
  });

  it("fails open when the Cursor catalog request fails", async () => {
    mockResponse = { status: 403, body: new TextEncoder().encode("no") };

    await expect(resolveCursorModels({
      accessToken: "cursor-token",
      providerSpecificData: { machineId: "machine-id" },
    })).resolves.toBeNull();
  });
});
