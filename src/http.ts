export type ApiMeta = {
  registry: string;
  apiVersion: string;
};

export type ErrorCode =
  | "bad_request"
  | "not_found"
  | "method_not_allowed"
  | "internal_error"
  | "not_ready";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "X-Content-Type-Options": "nosniff"
} as const;

function applyBaseHeaders(headers: Headers): Headers {
  for (const [key, value] of Object.entries(baseHeaders)) {
    headers.set(key, value);
  }
  return headers;
}

function requestOrigin(request?: Request): string {
  const origin = request?.headers.get("Origin")?.trim();
  if (!origin) {
    return "*";
  }
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return origin;
    }
  } catch {
    // Fall back to public wildcard CORS for malformed Origin values.
  }
  return "*";
}

export function withCors(response: Response, request?: Request): Response {
  const headers = applyBaseHeaders(new Headers(response.headers));
  const origin = requestOrigin(request);
  headers.set("Access-Control-Allow-Origin", origin);
  if (origin !== "*") {
    headers.set("Vary", mergeVary(headers.get("Vary"), "Origin"));
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function mergeVary(current: string | null, value: string): string {
  if (!current) {
    return value;
  }
  const parts = current.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => part.toLowerCase() === value.toLowerCase())) {
    return current;
  }
  return `${current}, ${value}`;
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  cacheControl = "public, max-age=30, s-maxage=60"
): Response {
  const headers = applyBaseHeaders(new Headers(init.headers));
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", cacheControl);

  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers
  });
}

export function emptyResponse(init: ResponseInit = {}): Response {
  const headers = applyBaseHeaders(new Headers(init.headers));

  return new Response(null, {
    ...init,
    headers
  });
}

export function errorResponse(code: ErrorCode, message: string, meta: ApiMeta, status: number): Response {
  return jsonResponse(
    {
      error: {
        code,
        message
      },
      meta
    },
    { status },
    "no-store"
  );
}

export function envelope(data: unknown, meta: ApiMeta, nextCursor?: string): Record<string, unknown> {
  const body: Record<string, unknown> = { data, meta };
  if (nextCursor) {
    body.nextCursor = nextCursor;
  }
  return body;
}

export function withHead(request: Request, response: Response): Response {
  if (request.method !== "HEAD") {
    return response;
  }
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}
