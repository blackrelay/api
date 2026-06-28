import { describe, expect, it } from "vitest";
import { emptyResponse, jsonResponse, withCors } from "../src/http";

describe("HTTP helpers", () => {
  it("adds public CORS headers to JSON responses", async () => {
    const response = jsonResponse({ ok: true });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, HEAD, OPTIONS");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
    expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("adds public CORS headers to preflight responses", () => {
    const response = emptyResponse({ status: 204 });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, HEAD, OPTIONS");
  });

  it("wraps raw responses with public CORS headers", async () => {
    const response = withCors(
      new Response("blackrelay_api_entities 1\n", {
        headers: {
          "content-type": "text/plain; version=0.0.4; charset=utf-8",
          "cache-control": "no-store"
        }
      })
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("content-type")).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toBe("blackrelay_api_entities 1\n");
  });
});
