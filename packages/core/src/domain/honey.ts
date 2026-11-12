import { ADULT_AGE, DAILY_CHARGE_LIMIT, PENDING_CHARGE_MS } from "@nabi/shared/honey.ts";

const KST_MS = 9 * 3600_000;

/** 방송자 등급별 배분 비율(알 80%, 애벌레 82%, 번데기 85%, 나비 88%, 4-12). 정수 퍼센트로 둔다. */
const SHARE_PERCENT: Record<string, number> = { egg: 80, larva: 82, pupa: 85, butterfly: 88 };
export const sharePercent = (grade: string) => SHARE_PERCENT[grade] ?? 80;

/** 방송자 예상 수익 = 전달된 꿀 × 배분 비율, 원 단위 내림(4-12). 소수 오차를 피하려고 정수로 계산한다. */
export const streamerEarning = (delivered: number, grade: string) => Math.floor((delivered * sharePercent(grade)) / 100);

export type FifoCharge = { id: string; remaining: number; approvedAtMs: number };
export type ChargeUsage = { chargeId: string; amount: number };

/** 먼저 충전한 꿀부터 쓴다(4-8). 남은 꿀이 모자라면 null. */
export function allocateFifo(charges: readonly FifoCharge[], amount: number): ChargeUsage[] | null {
  const usage: ChargeUsage[] = [];
  let left = amount;
  for (const c of [...charges].sort((a, b) => a.approvedAtMs - b.approvedAtMs)) {
    if (left <= 0) break;
    const take = Math.min(c.remaining, left);
    if (take > 0) {
      usage.push({ chargeId: c.id, amount: take });
      left -= take;
    }
  }
  return left > 0 ? null : usage;
}

/** 한국 시간 기준 만 나이. birth는 YYYY-MM-DD. 없는 날짜(2월 30일 등)는 NaN. */
export function koreanAge(birth: string, now: Date) {
  const [y, m, d] = birth.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return NaN;
  const t = new Date(now.getTime() + KST_MS);
  const before = t.getUTCMonth() + 1 < m || (t.getUTCMonth() + 1 === m && t.getUTCDate() < d);
  return t.getUTCFullYear() - y - (before ? 1 : 0);
}
export const isAdult = (birth: string, now: Date) => koreanAge(birth, now) >= ADULT_AGE;

/** 오늘 0시(한국 시간) */
export const kstDayStart = (now: Date) => new Date(Math.floor((now.getTime() + KST_MS) / 86_400_000) * 86_400_000 - KST_MS);

/** 하루 한도에 들어가는 꿀: 완료된 충전 + 만든 지 30분이 안 된 결제 대기. 취소한 충전도 센다(되풀이로 한도를 넘지 못하게, 4-8). 실패는 뺀다. */
export function chargedToday(charges: readonly { honey: number; status: string; createdAtMs: number }[], nowMs: number) {
  const counted = (c: { status: string; createdAtMs: number }) =>
    c.status === "done" || c.status === "canceling" || c.status === "canceled" || (c.status === "pending" && nowMs - c.createdAtMs < PENDING_CHARGE_MS);
  return charges.reduce((sum, c) => sum + (counted(c) ? c.honey : 0), 0);
}
export const remainingToday = (used: number) => Math.max(0, DAILY_CHARGE_LIMIT - used);
