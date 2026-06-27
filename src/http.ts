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
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "Content-Type",
  "access-control-max-age": "86400",
  "x-content-type-options": "nosniff"
} as const;

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  cacheControl = "public, max-age=30, s-maxage=60"
): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      ...baseHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      ...init.headers
    }
  });
}

export function emptyResponse(init: ResponseInit = {}): Response {
  return new Response(null, {
    ...init,
    headers: {
      ...baseHeaders,
      ...init.headers
    }
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
