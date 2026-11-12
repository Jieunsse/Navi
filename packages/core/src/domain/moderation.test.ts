import assert from "node:assert/strict";
import { test } from "node:test";
import { chatBanEnd, chatBlock, kstDayStart, sanctionEnd, sanctionRefusal, summarize } from "./moderation.ts";

const t0 = new Date("2026-11-12T00:00:00Z");
const day = (n: number) => new Date(t0.getTime() + n * 86_400_000);

test("활동 제한 기간: 1일, 7일, 영구", () => {
  assert.deepEqual(chatBanEnd("1d", t0), day(1));
  assert.deepEqual(chatBanEnd("7d", t0), day(7));
  assert.equal(chatBanEnd("perm", t0), null);
});

test("제재 기간은 정해진 값만 받는다", () => {
  assert.deepEqual(sanctionEnd("chatBan", 7, t0), day(7));
  assert.equal(sanctionEnd("chatBan", 30, t0), undefined);
  assert.deepEqual(sanctionEnd("broadcastBan", 30, t0), day(30));
  assert.equal(sanctionEnd("broadcastBan", 1, t0), undefined);
  assert.equal(sanctionEnd("chatBan", undefined, t0), undefined);
  assert.equal(sanctionEnd("suspend", undefined, t0), null);
  assert.equal(sanctionEnd("warning", 7, t0), undefined);
});

test("채팅을 막는 이유: 정지, 채팅 금지, 방송자 제한, 기간이 끝나면 풀린다", () => {
  assert.equal(chatBlock({ suspended: true }, null, t0), "SUSPENDED");
  assert.equal(chatBlock({ chatBannedUntil: day(1) }, null, t0), "CHAT_BANNED");
  assert.equal(chatBlock({ chatBannedUntil: day(-1) }, null, t0), null);
  assert.equal(chatBlock({}, { endAt: null }, t0), "OWNER_BAN");
  assert.equal(chatBlock({}, { endAt: day(1) }, t0), "OWNER_BAN");
  assert.equal(chatBlock({}, { endAt: day(-1) }, t0), null);
  assert.equal(chatBlock({}, null, t0), null);
});

test("요약: 적용 중인 제재만 센다. 끝난 것과 해제한 것은 뺀다", () => {
  const s = summarize(
    [
      { kind: "chatBan", status: "active", endAt: day(1) },
      { kind: "chatBan", status: "active", endAt: day(7) },
      { kind: "chatBan", status: "active", endAt: day(-1) },
      { kind: "broadcastBan", status: "revoked", endAt: day(30) },
      { kind: "warning", status: "active", endAt: null },
    ],
    t0,
  );
  assert.deepEqual(s.chatBannedUntil, day(7));
  assert.equal(s.broadcastBannedUntil, null);
  assert.equal(s.suspended, false);
  assert.equal(s.unseenWarning, true);
  assert.equal(summarize([{ kind: "suspend", status: "active", endAt: null }], t0).suspended, true);
});

test("테스트 운영자는 시드 계정 중 보호 대상이 아닌 것만 제재한다", () => {
  const real = { isTestAdmin: false };
  const test = { isTestAdmin: true };
  assert.equal(sanctionRefusal(test, { seedKind: "sanctionPractice" }), null);
  assert.equal(sanctionRefusal(test, { seedKind: null }), "NOT_SEED");
  assert.equal(sanctionRefusal(test, { seedKind: "testBroadcaster" }), "PROTECTED_TEST");
  assert.equal(sanctionRefusal(test, { seedKind: "testViewer" }), "PROTECTED_TEST");
  assert.equal(sanctionRefusal(test, { seedKind: "sample" }), "PROTECTED_TEST");
  assert.equal(sanctionRefusal(real, { seedKind: "testViewer" }), null);
  assert.equal(sanctionRefusal(real, { seedKind: null }), null);
  assert.equal(sanctionRefusal(real, { isAdmin: true }), "ADMIN_TARGET");
});

test("신고 하루 한도는 한국 시간 0시부터 센다", () => {
  assert.deepEqual(kstDayStart(new Date("2026-11-12T14:59:00Z")), new Date("2026-11-11T15:00:00Z"));
  assert.deepEqual(kstDayStart(new Date("2026-11-12T15:00:00Z")), new Date("2026-11-12T15:00:00Z"));
});
