import assert from "node:assert/strict";
import { test } from "node:test";
import { endStats, overTestLimit } from "./broadcast.ts";

const t0 = new Date("2026-11-12T00:00:00Z");
const min = (m: number) => new Date(t0.getTime() + m * 60_000);

test("10분 이상 방송만 횟수로 센다", () => {
  assert.deepEqual(endStats(t0, min(9)), { durationMs: 9 * 60_000, counted: 0 });
  assert.deepEqual(endStats(t0, min(10)), { durationMs: 10 * 60_000, counted: 1 });
  assert.deepEqual(endStats(null, min(10)), { durationMs: 0, counted: 0 });
});

test("테스트 방송자의 방송 중 방송만 30분에 막힌다", () => {
  assert.equal(overTestLimit("seed-test-broadcaster", "live", t0, min(30)), true);
  assert.equal(overTestLimit("seed-test-broadcaster", "live", t0, min(29)), false);
  assert.equal(overTestLimit("seed-test-broadcaster", "ready", t0, min(90)), false);
  assert.equal(overTestLimit("someone", "live", t0, min(90)), false);
});
