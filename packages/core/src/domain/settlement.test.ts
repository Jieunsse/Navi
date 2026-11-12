import assert from "node:assert/strict";
import { test } from "node:test";
import { chunk, followingPayoutDate, kstMonthStart, nearestPayoutDate, payoutMonthStart, payoutPeriod, scheduledPayoutDate, scheduledSettlementId, summarize, testRunMessage, testSettlementId } from "./settlement.ts";

// 한국 시간 y-m-d h:00 를 Date로
const kst = (y: number, m: number, d: number, h = 0) => new Date(Date.UTC(y, m - 1, d, h) - 9 * 3600_000);

test("가장 가까운 지급일은 25일까지 이번 달, 지나면 다음 달", () => {
  assert.deepEqual(nearestPayoutDate(kst(2026, 11, 7)), kst(2026, 11, 25));
  assert.deepEqual(nearestPayoutDate(kst(2026, 11, 25, 23)), kst(2026, 11, 25));
  assert.deepEqual(nearestPayoutDate(kst(2026, 11, 26)), kst(2026, 12, 25));
  assert.deepEqual(nearestPayoutDate(kst(2026, 12, 30)), kst(2027, 1, 25)); // 해가 넘어간다
  assert.deepEqual(followingPayoutDate(kst(2026, 12, 25)), kst(2027, 1, 25));
});

test("지급일의 정산 기간은 전달 1일부터 이번 달 1일 전까지", () => {
  const p = payoutPeriod(kst(2026, 11, 25));
  assert.deepEqual(p.start, kst(2026, 10, 1));
  assert.deepEqual(p.end, kst(2026, 11, 1));
  assert.deepEqual(payoutMonthStart(kst(2027, 1, 25)), kst(2027, 1, 1));
  assert.deepEqual(payoutPeriod(kst(2027, 1, 25)).start, kst(2026, 12, 1)); // 1월 지급은 12월분
  assert.deepEqual(kstMonthStart(2026, 12), kst(2027, 1, 1));
});

test("예약 실행은 실행한 달의 25일이 지급일이다", () => {
  assert.deepEqual(scheduledPayoutDate(kst(2026, 11, 25, 3)), kst(2026, 11, 25));
});

test("정산 기록 ID 규칙", () => {
  assert.equal(scheduledSettlementId("abc", kst(2026, 11, 25), 1), "abc_2026-11_1");
  assert.equal(testSettlementId("req123", "abc", 2), "req123_abc_2");
});

test("합계: 나비 몫은 꿀에서 방송자 몫을 뺀다", () => {
  assert.deepEqual(summarize([{ delivered: 1_234, earning: 1_011 }, { delivered: 1_000, earning: 800 }]), { count: 2, honey: 2_234, streamerShare: 1_811, nabiShare: 423 });
  assert.deepEqual(summarize([]), { count: 0, honey: 0, streamerShare: 0, nabiShare: 0 });
});

test("490건씩 자른다", () => {
  const rows = Array.from({ length: 1_000 }, (_, i) => i);
  assert.deepEqual(chunk(rows).map((c) => c.length), [490, 490, 20]);
  assert.deepEqual(chunk([]), []);
});

test("테스트 실행 문구 세 가지", () => {
  assert.equal(testRunMessage({ newDonations: 0, newShare: 0, paidCount: 0, heldCount: 0 }), "정산할 후원이 없어요");
  assert.equal(testRunMessage({ newDonations: 0, newShare: 0, paidCount: 0, heldCount: 2 }), "새로 정산할 후원이 없어요. 보류로 남은 기록 2건은 그대로예요");
  assert.equal(testRunMessage({ newDonations: 3, newShare: 2_400, paidCount: 1, heldCount: 1 }), "새로 정산한 후원 3건(방송자 몫 2,400원), 지급 1건, 보류로 남은 기록 1건(테스트)");
  // 새 후원은 없어도 보류 기록이 지급되면 전체 문구를 쓴다
  assert.match(testRunMessage({ newDonations: 0, newShare: 0, paidCount: 2, heldCount: 0 }), /지급 2건/);
});
