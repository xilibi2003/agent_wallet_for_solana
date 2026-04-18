export function nowIso() {
  return new Date().toISOString();
}

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
