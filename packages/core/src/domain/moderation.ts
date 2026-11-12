import { PROTECTED_SEED_KINDS, SANCTION_DAYS, type CHAT_BAN_LABEL } from "@nabi/shared/moderation.ts";

type SanctionKind = "warning" | "chatBan" | "broadcastBan" | "suspend";
const DAY = 24 * 60 * 60 * 1000;

/** 방송자 활동 제한의 끝나는 시각. 영구는 null이다(4-14). */
export function chatBanEnd(duration: keyof typeof CHAT_BAN_LABEL, now: Date): Date | null {
  return duration === "perm" ? null : new Date(now.getTime() + (duration === "1d" ? 1 : 7) * DAY);
}

/** 운영자 제재의 끝나는 시각. 기간을 잘못 고르면 undefined(4-15). 경고와 영구 정지는 끝이 없어 null. */
export function sanctionEnd(kind: SanctionKind, days: number | undefined, now: Date): Date | null | undefined {
  if (kind === "warning" || kind === "suspend") return days === undefined ? null : undefined;
  const allowed: readonly number[] = SANCTION_DAYS[kind];
  return days !== undefined && allowed.includes(days) ? new Date(now.getTime() + days * DAY) : undefined;
}

/** 끝 시각이 아직 안 지났으면 막힌 것이다. */
export const stillBlocked = (until: Date | null | undefined, now: Date) => !!until && until > now;

export type SanctionLike = { kind: SanctionKind; status: "active" | "ended" | "revoked" | "appealCanceled"; endAt: Date | null };

/** 저장된 상태가 적용 중이어도 끝 시각이 지났으면 끝난 것으로 본다. 예약 작업 없이 읽을 때마다 확인한다. */
export const effectiveStatus = (s: SanctionLike, now: Date) => (s.status === "active" && s.endAt && s.endAt <= now ? "ended" : s.status);

/** 적용 중인 제재들에서 사용자 문서의 요약을 다시 계산한다. 같은 종류가 겹치면 더 늦게 끝나는 쪽을 따른다(4-15). */
export function summarize(sanctions: SanctionLike[], now: Date) {
  const active = sanctions.filter((s) => effectiveStatus(s, now) === "active");
  const latest = (kind: SanctionKind) => active.filter((s) => s.kind === kind && s.endAt).reduce<Date | null>((m, s) => (m && m > s.endAt! ? m : s.endAt!), null);
  return {
    chatBannedUntil: latest("chatBan"),
    broadcastBannedUntil: latest("broadcastBan"),
    suspended: active.some((s) => s.kind === "suspend"),
    unseenWarning: active.some((s) => s.kind === "warning"),
  };
}

/** 채팅·후원 메시지를 막는 이유. 없으면 null. ownerBan은 그 방송자가 건 활동 제한(endAt null이 영구). */
export function chatBlock(
  user: { suspended?: boolean; chatBannedUntil?: Date | null },
  ownerBan: { endAt: Date | null } | null,
  now: Date,
): "SUSPENDED" | "CHAT_BANNED" | "OWNER_BAN" | null {
  if (user.suspended) return "SUSPENDED";
  if (stillBlocked(user.chatBannedUntil, now)) return "CHAT_BANNED";
  if (ownerBan && (ownerBan.endAt === null || ownerBan.endAt > now)) return "OWNER_BAN";
  return null;
}

/** 테스트 운영자가 볼 수 있는 대상인가. 시드 계정만 볼 수 있다(결정 25). */
export const inTestAdminScope = (seedKind: string | null | undefined) => !!seedKind;

/** 제재를 걸 수 있는가. 허용이면 null, 아니면 거절 이유(4-15 권한 표). */
export function sanctionRefusal(
  actor: { isTestAdmin?: boolean },
  target: { isAdmin?: boolean; seedKind?: string | null },
): "ADMIN_TARGET" | "NOT_SEED" | "PROTECTED_TEST" | null {
  if (target.isAdmin) return "ADMIN_TARGET";
  if (!actor.isTestAdmin) return null;
  if (!inTestAdminScope(target.seedKind)) return "NOT_SEED";
  return PROTECTED_SEED_KINDS.includes(target.seedKind!) ? "PROTECTED_TEST" : null;
}

/** 한국 시간 기준 오늘 0시. 신고 하루 한도를 센다(4-13). */
export const kstDayStart = (now: Date) => new Date(Math.floor((now.getTime() + 9 * 3600_000) / DAY) * DAY - 9 * 3600_000);
