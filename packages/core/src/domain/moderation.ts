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

/** 한국 시간 기준 이번 달 1일 0시. 대시보드의 이번 달 합계가 시작하는 때다(4-15). */
export function kstMonthStartOf(now: Date) {
  const t = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - 9 * 3600_000);
}

/** 방송 시간 합계(ms). 아직 방송 중이면 지금까지를 센다. 시작하지 않은 방송은 0이다. */
export function broadcastDuration(rows: readonly { startedAt: Date | null; endedAt: Date | null }[], now: Date) {
  return rows.reduce((n, r) => (r.startedAt ? n + Math.max(0, (r.endedAt ?? now).getTime() - r.startedAt.getTime()) : n), 0);
}

type ReportStatus = "pending" | "actioned" | "dismissed";
/** 신고 묶음의 상태. 접수된 것이 하나라도 있으면 접수, 아니면 가장 최근 신고의 결과다. rows는 최근 것이 앞이다. */
export const reportGroupStatus = (rows: readonly { status: ReportStatus }[]): ReportStatus => (rows.some((r) => r.status === "pending") ? "pending" : (rows[0]?.status ?? "pending"));

/**
 * 한 사용자가 받은 신고 전부로 신고 대상 요약(reportTargets 문서)을 처음부터 다시 계산한다. 신고가 없으면 null이다.
 * 시간 값은 넘겨받은 것을 그대로 돌려준다(Timestamp든 Date든 toMillis만 있으면 된다).
 */
export function reportTargetOf<T extends { toMillis(): number }>(
  rows: readonly { status: ReportStatus; reason: string; createdAt: T; processedAt?: T | null }[],
) {
  if (!rows.length) return null;
  const byNewest = [...rows].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  const pending = byNewest.filter((r) => r.status === "pending");
  const status = reportGroupStatus(byNewest);
  const processed = byNewest.map((r) => r.processedAt).filter((t): t is T => !!t);
  return {
    pendingCount: pending.length,
    totalCount: rows.length,
    firstPendingAt: pending.length ? pending[pending.length - 1]!.createdAt : null,
    lastReportAt: byNewest[0]!.createdAt,
    latestReason: byNewest[0]!.reason,
    status,
    resolvedAt: status === "pending" || !processed.length ? null : processed.reduce((a, b) => (b.toMillis() > a.toMillis() ? b : a)),
  };
}

/** 회원 검색어 종류. 이메일은 @가 있고, 회원 ID는 공백 없는 영문·숫자 20자 이상(시드는 하이픈 포함)이다. 그 외는 닉네임 앞부분이다. */
export const userSearchKind = (q: string): "email" | "id" | "nickname" => (q.includes("@") ? "email" : /^[A-Za-z0-9_-]{20,}$/.test(q) ? "id" : "nickname");
