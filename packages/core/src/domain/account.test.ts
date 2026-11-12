import assert from "node:assert/strict";
import test from "node:test";
import { isBlockingCharge, isRecentLogin } from "./account.ts";

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
