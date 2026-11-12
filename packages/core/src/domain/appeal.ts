import type { SanctionLike } from "./moderation.ts";

/** 이의 제기를 할 수 있는가. 허용이면 null, 아니면 이유. 경고·채팅 금지·방송 금지만, 영구 정지는 화면 밖이다(4-15). */
export function appealRefusal(s: Pick<SanctionLike, "kind" | "status">): string | null {
  if (s.kind === "suspend") return "영구 정지는 이메일로 이의를 제기해 주세요";
  if (s.status === "revoked" || s.status === "appealCanceled") return "이미 풀린 제재예요";
  return null;
}
