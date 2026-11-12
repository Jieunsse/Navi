import assert from "node:assert/strict";
import { test } from "node:test";
import { appealRefusal } from "./appeal.ts";

test("경고·채팅 금지·방송 금지는 적용 중이든 끝났든 이의 제기를 할 수 있다", () => {
  for (const kind of ["warning", "chatBan", "broadcastBan"] as const) {
    assert.equal(appealRefusal({ kind, status: "active" }), null);
    assert.equal(appealRefusal({ kind, status: "ended" }), null);
  }
});

test("영구 정지와 이미 풀린 제재는 거절한다", () => {
  assert.ok(appealRefusal({ kind: "suspend", status: "active" }));
  assert.ok(appealRefusal({ kind: "chatBan", status: "revoked" }));
  assert.ok(appealRefusal({ kind: "chatBan", status: "appealCanceled" }));
});
