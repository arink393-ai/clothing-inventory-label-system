export const HISTORY_PAGE_SIZE = 25;

export type HistorySearchParams = { q?: string; from?: string; to?: string; page?: string; message?: string };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseHistoryParams(raw: HistorySearchParams) {
  const q = String(raw.q || "").trim().slice(0, 80);
  const from = datePattern.test(String(raw.from || "")) ? String(raw.from) : "";
  const to = datePattern.test(String(raw.to || "")) ? String(raw.to) : "";
  const page = Math.max(1, Number.parseInt(String(raw.page || "1"), 10) || 1);
  const start = from ? new Date(`${from}T00:00:00+08:00`).toISOString() : "";
  let end = "";
  if (to) {
    const date = new Date(`${to}T00:00:00+08:00`);
    date.setUTCDate(date.getUTCDate() + 1);
    end = date.toISOString();
  }
  const safe = q.replace(/[,()%_]/g, " ").replace(/\s+/g, " ").trim();
  return { q, safe, from, to, start, end, page, offset: (page - 1) * HISTORY_PAGE_SIZE };
}
