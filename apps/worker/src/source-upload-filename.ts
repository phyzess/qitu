export function filenameFromUploadHeaders(
  encodedFilename: string | undefined,
  fallbackFilename: string | undefined,
): string {
  if (encodedFilename) {
    try {
      return normalizeUploadedFilename(decodeURIComponent(encodedFilename));
    } catch {
      // The UTF-8 hint is optional, so a malformed value falls back to the ASCII header.
    }
  }

  return normalizeUploadedFilename(fallbackFilename ?? "source.bin");
}

export function normalizeUploadedFilename(filename: string): string {
  const normalized = Array.from(filename)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 || character === "/" || character === "\\"
        ? "_"
        : character;
    })
    .join("")
    .trim();

  return normalized || "source.bin";
}
