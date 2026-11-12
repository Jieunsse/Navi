import assert from "node:assert/strict";
import { test } from "node:test";
import { GRADE_BENEFITS, GRADES } from "@nabi/shared/grade.ts";
import { asGrade, nextGrade, promotedGrade } from "./grade.ts";
import { sharePercent } from "./honey.ts";

const H = 3_600_000;

test("세 조건을 모두 채워야 승급한다", () => {
  assert.equal(promotedGrade("egg", { broadcastCount: 3, totalBroadcastMs: 2 * H, donationCount: 1 }), "larva");
  assert.equal(promotedGrade("egg", { broadcastCount: 2, totalBroadcastMs: 2 * H, donationCount: 1 }), null);
  assert.equal(promotedGrade("egg", { broadcastCount: 3, totalBroadcastMs: 2 * H - 1, donationCount: 1 }), null);
  assert.equal(promotedGrade("egg", { broadcastCount: 3, totalBroadcastMs: 2 * H, donationCount: 0 }), null);
});

test("한 번에 한 등급씩만 오른다", () => {
  const big = { broadcastCount: 999, totalBroadcastMs: 999 * H, donationCount: 999 };
  assert.equal(promotedGrade("egg", big), "larva");
  assert.equal(promotedGrade("larva", big), "pupa");
  assert.equal(promotedGrade("pupa", big), "butterfly");
  assert.equal(promotedGrade("butterfly", big), null);
});

test("등급 이름 처리", () => {
  assert.equal(asGrade("nope"), "egg");
  assert.equal(asGrade(undefined), "egg");
  assert.equal(nextGrade("butterfly"), null);
  assert.equal(nextGrade("egg"), "larva");
});

test("혜택 표의 비율은 후원 확정에 쓰는 비율과 같다", () => {
  for (const g of GRADES) assert.equal(GRADE_BENEFITS[g].share, sharePercent(g));
});
