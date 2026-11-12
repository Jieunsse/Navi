import { PAYOUT_DAY, SETTLEMENT_CHUNK } from "@nabi/shared/settlement.ts";

const KST_MS = 9 * 3600_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** 한국 시간 기준 연·월(0부터)·일 */
function kst(d: Date) {
  const t = new Date(d.getTime() + KST_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}
/** 한국 시간 y년 m월(0부터) 1일 0시. 월이 넘쳐도 Date.UTC가 알아서 넘긴다. */
export const kstMonthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - KST_MS);
const payoutAt = (y: number, m: number) => new Date(Date.UTC(y, m, PAYOUT_DAY) - KST_MS);

/** 가장 가까운 지급일. 25일 당일까지는 이번 달, 지나면 다음 달 25일(06 결정 28). */
export function nearestPayoutDate(now: Date) {
  const t = kst(now);
  return payoutAt(t.y, t.d <= PAYOUT_DAY ? t.m : t.m + 1);
}
/** 그다음 지급일 */
export function followingPayoutDate(payout: Date) {
  const t = kst(payout);
  return payoutAt(t.y, t.m + 1);
}
/** 예약 실행이 오늘 지급하는 날. 실행한 달의 25일이다. */
export function scheduledPayoutDate(now: Date) {
  const t = kst(now);
  return payoutAt(t.y, t.m);
}
/** 그 지급일의 전달 1일(포함)부터 이번 달 1일(미포함)까지 */
export function payoutPeriod(payout: Date) {
  const t = kst(payout);
  return { start: kstMonthStart(t.y, t.m - 1), end: kstMonthStart(t.y, t.m) };
}
/** 지급일이 속한 달의 1일. 카드의 두 금액을 가르는 경계다. */
export const payoutMonthStart = (payout: Date) => payoutPeriod(payout).end;
/** 예: 2026-11 */
export function yearMonth(d: Date) {
  const t = kst(d);
  return `${t.y}-${pad(t.m + 1)}`;
}

/** 정산 기록 ID. 예약은 `방송자ID_연월_순번`, 테스트는 `요청번호_방송자ID_순번`. 순번은 1부터다(4-12). */
export const scheduledSettlementId = (uid: string, payout: Date, seq: number) => `${uid}_${yearMonth(payout)}_${seq}`;
export const testSettlementId = (requestId: string, uid: string, seq: number) => `${requestId}_${uid}_${seq}`;

export type EarningRow = { delivered: number; earning: number };
/** 후원들을 합친다. 나비 몫은 꿀에서 방송자 몫을 뺀 값이라 내림 차이가 여기 들어간다(4-12). */
export function summarize(rows: readonly EarningRow[]) {
  const honey = rows.reduce((s, r) => s + r.delivered, 0);
  const streamerShare = rows.reduce((s, r) => s + r.earning, 0);
  return { count: rows.length, honey, streamerShare, nabiShare: honey - streamerShare };
}

/** 정산 기록 하나에 넣을 수 있는 수만큼 자른다. */
export function chunk<T>(rows: readonly T[], size = SETTLEMENT_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** 지급 대상으로 모으는 상태(4-12). 운영 조치 보류는 모으지 않는다. */
export const COLLECTABLE = ["pending", "heldNoAccount", "failed"] as const;

/** 월 정산 테스트 실행 결과 문구(4-12, 06 결정 28) */
export function testRunMessage(r: { newDonations: number; newShare: number; paidCount: number; heldCount: number }) {
  const n = (v: number) => v.toLocaleString("ko-KR");
  if (r.newDonations === 0 && r.paidCount === 0) {
    return r.heldCount === 0 ? "정산할 후원이 없어요" : `새로 정산할 후원이 없어요. 보류로 남은 기록 ${n(r.heldCount)}건은 그대로예요`;
  }
  return `새로 정산한 후원 ${n(r.newDonations)}건(방송자 몫 ${n(r.newShare)}원), 지급 ${n(r.paidCount)}건, 보류로 남은 기록 ${n(r.heldCount)}건(테스트)`;
}
