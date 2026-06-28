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

export function withCors(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: applyBaseHeaders(new Headers(response.headers))
  });
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
