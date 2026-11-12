import assert from "node:assert/strict";
import { test } from "node:test";
import { cheerAmount } from "@nabi/shared/honey.ts";
import { endOfBroadcast, isPastDeadline, missionMoney, restoreLifo, successOrLate } from "./mission.ts";

test("응원금은 상금의 20%이고 100꿀 아래는 버린다", () => {
  assert.equal(cheerAmount(5_000), 1_000);
  assert.equal(cheerAmount(1_000), 200);
  assert.equal(cheerAmount(1_550), 300); // 310 → 300
  assert.equal(cheerAmount(1_000_000), 200_000);
});

test("미션 결과마다 전달되는 꿀과 돌려주는 꿀", () => {
  assert.deepEqual(missionMoney("success", 5_000), { delivered: 5_000, returned: 0 });
  assert.deepEqual(missionMoney("failed", 5_000), { delivered: 1_000, returned: 4_000 });
  assert.deepEqual(missionMoney("rejected", 5_000), { delivered: 0, returned: 5_000 });
  assert.deepEqual(missionMoney("canceled", 5_000), { delivered: 0, returned: 5_000 });
});

test("마감이 지난 뒤의 성공은 실패로 처리한다", () => {
  assert.equal(isPastDeadline(1_000, 999), false);
  assert.equal(isPastDeadline(1_000, 1_000), true);
  assert.equal(isPastDeadline(null, 5_000), false);
  assert.equal(successOrLate(1_000, 999), "success");
  assert.equal(successOrLate(1_000, 1_001), "failed");
});

test("방송이 끝나면 대기 중은 취소, 진행 중은 실패다", () => {
  assert.equal(endOfBroadcast("pending"), "canceled");
  assert.equal(endOfBroadcast("active"), "failed");
  assert.equal(endOfBroadcast("success"), null);
});

test("돌려줄 꿀은 나중에 쓴 충전 건부터 되살린다", () => {
  const usage = [
    { chargeId: "a", amount: 1_000 },
    { chargeId: "b", amount: 4_000 },
  ];
  // 상금 5,000, 응원금 1,000이 먼저 쓴 a에서 나갔다고 보면 4,000은 b로 돌아간다
  assert.deepEqual(restoreLifo(usage, 4_000), [{ chargeId: "b", amount: 4_000 }]);
  assert.deepEqual(restoreLifo(usage, 5_000), [
    { chargeId: "b", amount: 4_000 },
    { chargeId: "a", amount: 1_000 },
  ]);
  assert.deepEqual(restoreLifo(usage, 0), []);
});

test("실패 때 응원금과 돌려준 꿀을 합치면 상금이고 충전 건의 합도 맞는다", () => {
  const usage = [
    { chargeId: "a", amount: 3_000 },
    { chargeId: "b", amount: 2_000 },
  ];
  const { delivered, returned } = missionMoney("failed", 5_000);
  const back = restoreLifo(usage, returned).reduce((s, u) => s + u.amount, 0);
  assert.equal(back, returned);
  assert.equal(delivered + returned, 5_000);
});
