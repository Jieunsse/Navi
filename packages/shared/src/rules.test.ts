import assert from "node:assert/strict";
import { test } from "node:test";
import { findBannedWord, normalizeForBan } from "./rules.ts";

test("기호와 반복을 넣어도 금칙어가 걸린다", () => {
  assert.equal(normalizeForBan("ㅅ.ㅂ"), "ㅅㅂ");
  assert.equal(findBannedWord("ㅅ ㅂ ㅂ 진짜"), "ㅅㅂ");
  assert.equal(findBannedWord("시이발"), null);
  assert.equal(findBannedWord("안녕하세요"), null);
});
