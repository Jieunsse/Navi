import assert from "node:assert/strict";
import { test } from "node:test";
import { donationReceived, isFresh, missionDelivered, missionResult, promoted, operatorAction } from "./notification.ts";

test("익명 후원은 닉네임 대신 익명이라고 쓴다", () => {
  assert.equal(donationReceived("하린", true, 5000, "d1").text, "익명님이 5,000꿀을 후원했어요");
  assert.equal(donationReceived("하린", false, 5000, "d1").text, "하린님이 5,000꿀을 후원했어요");
});

test("미션 문구와 승급 문구", () => {
  assert.equal(missionDelivered("하린", false, 3000, true, "m").text, "하린님의 미션 상금 3,000꿀이 전달됐어요");
  assert.equal(missionDelivered("하린", false, 300, false, "m").text, "하린님의 미션 응원금 300꿀이 전달됐어요");
  assert.match(missionResult("민수", "success", "m").text, /성공으로 끝났어요$/);
  assert.match(promoted("larva").text, /등급이 됐어요$/);
});

test("운영 조치 알림은 이동하지 않는다", () => assert.equal(operatorAction("채팅을 숨겼어요").href, null));

test("30일이 지난 알림은 보여주지 않는다", () => {
  const now = Date.UTC(2026, 10, 30);
  assert.equal(isFresh(now - 29 * 86_400_000, now), true);
  assert.equal(isFresh(now - 30 * 86_400_000, now), false);
});
