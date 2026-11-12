import assert from "node:assert/strict";
import { test } from "node:test";
import { addRefusal } from "./bannedWords.ts";

test("새 금칙어는 더할 수 있다", () => assert.equal(addRefusal("바보", ["시발"]), null));

test("특수문자만 있거나 빈 값이거나 너무 길면 거절한다", () => {
  assert.ok(addRefusal("  ", []));
  assert.ok(addRefusal("...", []));
  assert.ok(addRefusal("가".repeat(21), []));
});

test("띄어쓰기나 기호만 다른 같은 말은 중복으로 본다", () => assert.ok(addRefusal("시.발", ["시발"])));
