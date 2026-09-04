export function mapsStart(token?: string) {
  const start = Number(token || 0);
  if (!Number.isInteger(start) || start < 0 || start > 100 || start % 20 !== 0) {
    throw new Error("Invalid Google Maps page offset.");
  }
  return start;
}

export function nextMapsStart(next: string | undefined, current: number) {
  if (!next || current >= 100) return null;
  try {
    const start = mapsStart(new URL(next).searchParams.get("start") || undefined);
    return start > current ? String(start) : null;
  } catch {
    return null;
  }
}
