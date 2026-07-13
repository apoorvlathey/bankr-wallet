/**
 * Read a response body without ever buffering beyond `maxBytes`.
 * `Response.blob()` cannot enforce this bound while the stream is arriving.
 */
export async function readAvatarBlobBounded(
  response: Response,
  maxBytes: number,
  contentType: string,
): Promise<Blob | null> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const declared = Number(declaredLength);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
  }

  if (!response.body) return new Blob([], { type: contentType });
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let total = 0;
  let streamComplete = false;
  try {
    while (!streamComplete) {
      const { done, value } = await reader.read();
      streamComplete = done;
      if (streamComplete) continue;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      // Copy each streamed view into an ArrayBuffer-backed BlobPart. Newer DOM
      // typings correctly exclude SharedArrayBuffer-backed typed-array views.
      chunks.push(value.slice().buffer as ArrayBuffer);
    }
  } finally {
    reader.releaseLock();
  }
  return new Blob(chunks, { type: contentType });
}
