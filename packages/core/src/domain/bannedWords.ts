import { normalizeForBan } from "@nabi/shared";
import { BANNED_WORD_MAX } from "@nabi/shared/adminOps.ts";

/** 금칙어를 더할 수 있는가. 허용이면 null, 아니면 이유. 비교는 채팅 검사와 같은 정규화로 한다(4-7). */
export function addRefusal(word: string, list: readonly string[]): string | null {
  const w = word.trim();
  if (!w || w.length > BANNED_WORD_MAX) return `금칙어는 1~${BANNED_WORD_MAX}자로 적어 주세요`;
  const n = normalizeForBan(w);
  if (!n) return "글자나 숫자가 들어 있어야 해요"; // 특수문자만이면 모든 글을 막게 된다
  if (list.some((x) => normalizeForBan(x) === n)) return "이미 있는 금칙어예요";
  return null;
}
