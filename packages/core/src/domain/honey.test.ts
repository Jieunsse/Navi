import assert from "node:assert/strict";
import { test } from "node:test";
import { payAmount, suggestChargeHoney } from "@nabi/shared/honey.ts";
import { allocateFifo, chargedToday, isAdult, koreanAge, kstDayStart, streamerEarning } from "./honey.ts";

test("결제 금액은 꿀의 1.1배다", () => {
  assert.equal(payAmount(1_000), 1_100);
  assert.equal(payAmount(1_000_000), 1_100_000);
});

test("등급별 배분 비율과 내림", () => {
  assert.equal(streamerEarning(1_000, "egg"), 800);
  assert.equal(streamerEarning(1_000, "larva"), 820);
  assert.equal(streamerEarning(1_000, "pupa"), 850);
  assert.equal(streamerEarning(1_000, "butterfly"), 880);
  assert.equal(streamerEarning(1_234, "larva"), 1_011); // 1011.88 → 내림
});

test("먼저 충전한 꿀부터 나눈다", () => {
  const cs = [
    { id: "b", remaining: 5_000, approvedAtMs: 2 },
    { id: "a", remaining: 1_000, approvedAtMs: 1 },
    { id: "c", remaining: 0, approvedAtMs: 0 },
  ];
  assert.deepEqual(allocateFifo(cs, 3_000), [
    { chargeId: "a", amount: 1_000 },
    { chargeId: "b", amount: 2_000 },
  ]);
  assert.equal(allocateFifo(cs, 6_001), null);
});

test("만 19세 판단은 한국 시간 생일 기준이다", () => {
  const now = new Date("2026-11-12T00:00:00+09:00");
  assert.equal(isAdult("2007-11-12", now), true); // 생일 당일
  assert.equal(isAdult("2007-11-13", now), false); // 하루 모자람
  assert.equal(koreanAge("2000-02-31", now), NaN);
  // UTC로는 11/11이지만 한국은 11/12 0시 30분이다
  assert.equal(isAdult("2007-11-12", new Date("2026-11-11T15:30:00Z")), true);
});

test("하루는 한국 시간 0시부터다", () => {
  assert.equal(kstDayStart(new Date("2026-11-12T10:00:00+09:00")).toISOString(), "2026-11-11T15:00:00.000Z");
  assert.equal(kstDayStart(new Date("2026-11-11T15:00:00Z")).toISOString(), "2026-11-11T15:00:00.000Z");
});

test("하루 한도에는 완료, 취소, 30분 안의 결제 대기를 센다", () => {
  const now = 100 * 60_000;
  const list = [
    { honey: 1_000, status: "done", createdAtMs: 0 },
    { honey: 2_000, status: "pending", createdAtMs: now - 29 * 60_000 },
    { honey: 4_000, status: "pending", createdAtMs: now - 31 * 60_000 },
    { honey: 8_000, status: "failed", createdAtMs: now },
    { honey: 16_000, status: "canceled", createdAtMs: 0 }, // 취소한 충전도 한도에서 빼지 않는다
    { honey: 32_000, status: "canceling", createdAtMs: 0 },
  ];
  assert.equal(chargedToday(list, now), 51_000);
});

test("충전 꿀 수 자동 선택", () => {
  assert.equal(suggestChargeHoney(1_500, 1_000_000), 5_000);
  assert.equal(suggestChargeHoney(1_000, 1_000_000), 1_000);
  assert.equal(suggestChargeHoney(100_001, 1_000_000), 101_000);
  assert.equal(suggestChargeHoney(1_500, 3_000), 2_000); // 5,000은 한도 초과 → 1,000 단위로 올림
  assert.equal(suggestChargeHoney(4_000, 3_000), null);
});
