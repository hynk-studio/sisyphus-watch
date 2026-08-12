export async function shortStableHash(value: string, length = 16): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return hex.slice(0, length);
}

export function normalizeForId(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
