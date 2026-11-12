import assert from "node:assert/strict";
import { test } from "node:test";
import { chatSendSchema } from "@nabi/shared/chat.ts";
import { tooFast } from "./chat.ts";

const t0 = new Date("2026-11-12T00:00:00Z");
const ms = (n: number) => new Date(t0.getTime() + n);

test("1초 안에 다시 보내면 도배다", () => {
  assert.equal(tooFast(null, t0), false);
  assert.equal(tooFast(t0, ms(999)), true);
  assert.equal(tooFast(t0, ms(1000)), false);
});

test("채팅은 1~200자, 공백만은 안 된다", () => {
  const ok = (content: string) => chatSendSchema.safeParse({ messageId: "abcdefgh", content }).success;
  assert.equal(ok("a"), true);
  assert.equal(ok("가".repeat(200)), true);
  assert.equal(ok("가".repeat(201)), false);
  assert.equal(ok("   "), false);
});
