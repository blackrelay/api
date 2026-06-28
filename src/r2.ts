export async function readExportObject(bucket: R2Bucket, prefix: string, path: string): Promise<R2ObjectBody | null> {
  const key = `${prefix.replace(/\/+$/, "")}/latest/${path.replace(/^\/+/, "")}`;
  return bucket.get(key);
}

export function r2Response(
  object: R2ObjectBody,
  cacheControl = "public, max-age=60, s-maxage=300",
  extraHeaders?: HeadersInit
): Response {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  }
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", cacheControl);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/octet-stream");
  }
  return new Response(object.body, { headers });
}
