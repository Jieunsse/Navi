import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlay, canStartRecording, isBusy, shouldFailProcessing, shouldStopRecording, usageCorrection, usageMonth } from "./recording.ts";

const MIN = 60_000;

test("usageMonth는 한국 시간 기준 달이다", () => {
  assert.equal(usageMonth(new Date("2026-11-30T14:59:59Z")), "2026-11");
  assert.equal(usageMonth(new Date("2026-11-30T15:00:00Z")), "2026-12");
});

test("한 달 50분을 넘기지 않을 때만 새 녹화를 시작한다", () => {
  assert.equal(canStartRecording(0), true);
  assert.equal(canStartRecording(47 * MIN), true);
  assert.equal(canStartRecording(47 * MIN + 1), false);
  assert.equal(canStartRecording(50 * MIN), false);
});

test("끝나면 미리 더한 3분을 실제 길이로 고친다", () => {
  assert.equal(usageCorrection(90_000), 90_000 - 3 * MIN);
  assert.equal(usageCorrection(0), -3 * MIN);
  assert.equal(usageCorrection(-5), -3 * MIN);
});

test("녹화 시작 3분이 지나면 한 번만 멈춘다", () => {
  const r = { status: "recording" as const, startedAtMs: 0, stopRequested: false };
  assert.equal(shouldStopRecording(r, 3 * MIN - 1), false);
  assert.equal(shouldStopRecording(r, 3 * MIN), true);
  assert.equal(shouldStopRecording({ ...r, stopRequested: true }, 4 * MIN), false);
  assert.equal(shouldStopRecording({ ...r, status: "processing" }, 4 * MIN), false);
});

test("처리 중 30분이 지나면 실패로 본다", () => {
  const r = { status: "processing" as const, endedAtMs: 0 };
  assert.equal(shouldFailProcessing(r, 30 * MIN - 1), false);
  assert.equal(shouldFailProcessing(r, 30 * MIN), true);
  assert.equal(shouldFailProcessing({ status: "ready", endedAtMs: 0 }, 99 * MIN), false);
  assert.equal(shouldFailProcessing({ status: "processing", endedAtMs: null }, 99 * MIN), false);
});

test("녹화 중과 처리 중은 지울 수 없다", () => {
  assert.deepEqual((["recording", "processing", "ready", "failed"] as const).map(isBusy), [true, true, false, false]);
});

test("재생은 볼 수 있음이고 공개이거나 소유자일 때만 된다", () => {
  const base = { status: "ready" as const, isPublic: false, ownerId: "o" };
  assert.equal(canPlay(base, null), false);
  assert.equal(canPlay(base, "x"), false);
  assert.equal(canPlay(base, "o"), true);
  assert.equal(canPlay({ ...base, isPublic: true }, null), true);
  assert.equal(canPlay({ ...base, status: "processing", isPublic: true }, "o"), false);
});
