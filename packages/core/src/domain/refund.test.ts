import assert from "node:assert/strict";
import { test } from "node:test";
import { refundQuote } from "@nabi/shared/honey.ts";
import { cancelRefusal, canCancel, isStaleCancel, refundable } from "./refund.ts";

const DAY = 24 * 3600_000;
const now = 10 * DAY;
const fresh = { status: "done", honey: 5_000, remaining: 5_000, cancelableUntilMs: now + DAY };

test("환급 금액: 결제 금액 기준에서 10%를 떼고 원 단위 아래는 버린다", () => {
  assert.deepEqual(refundQuote(3_000), { base: 3_300, fee: 330, payout: 2_970 });
  assert.deepEqual(refundQuote(1_000), { base: 1_100, fee: 110, payout: 990 });
  assert.deepEqual(refundQuote(1_234), { base: 1_357, fee: 135, payout: 1_222 });
});

test("충전 취소 조건: 7일 안, 하나도 쓰지 않음, 완료 상태", () => {
  assert.equal(canCancel(fresh, now), true);
  assert.equal(canCancel({ ...fresh, remaining: 4_000 }, now), false); // 일부 사용 또는 미션에 묶임
  assert.equal(canCancel({ ...fresh, cancelableUntilMs: now }, now), false); // 7일 지남
  assert.equal(cancelRefusal({ ...fresh, status: "canceling" }, now), "이미 취소하는 중이에요");
  assert.notEqual(cancelRefusal({ ...fresh, status: "canceled" }, now), null);
});

test("환급할 수 있는 꿀: 취소할 수 있는 충전 건은 빼고, 묶인 미션 꿀은 다시 빼지 않는다", () => {
  const r = refundable(
    [
      { id: "old", ...fresh, cancelableUntilMs: now - 1, remaining: 3_000 }, // 7일 지난 건
      { id: "used", ...fresh, remaining: 1_000 }, // 일부 사용: 남은 1,000은 환급 대상
      { id: "new", ...fresh }, // 취소할 수 있음: 환급 대상 아님
      { id: "empty", ...fresh, remaining: 0, cancelableUntilMs: now - 1 },
      { id: "canceled", ...fresh, status: "canceled", remaining: 0 },
    ],
    now,
  );
  assert.deepEqual(r.items, [
    { chargeId: "old", amount: 3_000 },
    { chargeId: "used", amount: 1_000 },
  ]);
  assert.equal(r.total, 4_000);
  assert.equal(r.cancelable, 5_000);
  assert.equal(r.canApply, true);
  assert.equal(refundable([{ id: "x", ...fresh, remaining: 900, cancelableUntilMs: now - 1 }], now).canApply, false); // 1,000꿀 미만
});

test("취소 중으로 5분 넘게 멈춘 충전을 알아본다", () => {
  assert.equal(isStaleCancel(now - 4 * 60_000, now), false);
  assert.equal(isStaleCancel(now - 5 * 60_000, now), true);
});
