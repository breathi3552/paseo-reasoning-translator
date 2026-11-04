// Preserve every source character, including whitespace. Prefer paragraph boundaries.
// Avoid separating a UTF-16 surrogate pair at a hard size boundary.
export function splitReasoning(text: string, maxChars = 12_000): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 2) throw new Error("Chunk size must be at least 2.");
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const paragraph = text.lastIndexOf("\n\n", end - 2);
      if (paragraph >= start + Math.floor(maxChars / 2)) end = paragraph + 2;
      const previous = text.charCodeAt(end - 1);
      const next = text.charCodeAt(end);
      if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) end--;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
