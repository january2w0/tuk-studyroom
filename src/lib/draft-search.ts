import { InputError } from "./validation";

export type DraftFilters = { q: string; date: string };
export function parseDraftFilters(
  params: Record<string, string | string[] | undefined>,
): DraftFilters {
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const date = typeof params.date === "string" ? params.date : "";
  if (q.length > 200)
    throw new InputError("검색어는 200자 이내로 입력해주세요.");
  if (date) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new InputError("검색 날짜를 확인해주세요.");
  }
  return { q, date };
}
