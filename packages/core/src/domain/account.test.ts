import assert from "node:assert/strict";
import test from "node:test";
import { abandonRefusal, isBlockingCharge, isRecentLogin, sanctionBlocksWithdraw } from "./account.ts";

const now = 1_000_000_000_000;
test("다시 로그인 확인은 5분 안만 인정한다", () => {
  assert.equal(isRecentLogin(now / 1000 - 60, now), true);
  assert.equal(isRecentLogin(now / 1000 - 301, now), false);
  assert.equal(isRecentLogin(undefined, now), false);
});
test("결제 대기는 30분 안만 탈퇴를 막는다", () => {
  assert.equal(isBlockingCharge({ status: "pending", createdAtMs: now - 60_000 }, now), true);
  assert.equal(isBlockingCharge({ status: "pending", createdAtMs: now - 31 * 60_000 }, now), false);
  assert.equal(isBlockingCharge({ status: "done", createdAtMs: now }, now), false);
});

test("채팅 금지나 방송 금지가 끝나기 전에는 탈퇴할 수 없다", () => {
  const n = new Date("2026-11-13T00:00:00Z");
  assert.equal(sanctionBlocksWithdraw({ chatBannedUntil: new Date("2026-11-14T00:00:00Z") }, n), true);
  assert.equal(sanctionBlocksWithdraw({ broadcastBannedUntil: new Date("2026-11-14T00:00:00Z") }, n), true);
  assert.equal(sanctionBlocksWithdraw({ chatBannedUntil: new Date("2026-11-12T00:00:00Z"), broadcastBannedUntil: null }, n), false);
  assert.equal(sanctionBlocksWithdraw({}, n), false);
});
test("남은 꿀과 수익 배분금은 포기에 동의해야 탈퇴한다", () => {
  const no = { abandonHoney: false, abandonEarnings: false };
  assert.equal(abandonRefusal({ honey: 0, earnings: 0 }, no), null);
  assert.equal(abandonRefusal({ honey: 100, earnings: 0 }, no)?.code, "HONEY_ABANDON_REQUIRED");
  assert.equal(abandonRefusal({ honey: 0, earnings: 100 }, { ...no, abandonHoney: true })?.code, "EARNINGS_ABANDON_REQUIRED");
  assert.equal(abandonRefusal({ honey: 100, earnings: 100 }, { abandonHoney: true, abandonEarnings: true }), null);
});
