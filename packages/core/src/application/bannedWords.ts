import { DEFAULT_BANNED_WORDS } from "@nabi/shared";
import type { z } from "zod";
import type { bannedWordsSchema } from "@nabi/shared/adminOps.ts";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import { addRefusal } from "../domain/bannedWords.ts";
import { badRequest } from "../errors.ts";
import { writeAdminLog } from "./moderation.ts";
import type { Viewer } from "./auth.ts";

const ref = () => db().collection("config").doc("bannedWords");
const TTL_MS = 60_000; // 서버는 목록을 1분 기억한다(4-7)
let cache: { words: string[]; at: number } | null = null;

/** 채팅·제목·닉네임·미션 검사에 쓰는 금칙어 목록. 설정 문서가 없으면 처음 목록을 쓴다. */
export async function getBannedWords(): Promise<string[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.words;
  const snap = await ref().get();
  const words = snap.exists ? ((snap.data()!.words as string[] | undefined) ?? []) : [...DEFAULT_BANNED_WORDS];
  cache = { words, at: Date.now() };
  return words;
}

type View = z.output<typeof bannedWordsSchema>;

export const bannedWordsAdmin = {
  async view(admin: Viewer): Promise<View> {
    const d = (await ref().get()).data() as { updatedBy?: string; updatedAt?: Timestamp } | undefined;
    return { words: await getBannedWords(), updatedBy: d?.updatedBy ?? null, updatedAt: iso(d?.updatedAt), readOnly: !!admin.user.isTestAdmin };
  },

  /** 더하기(add=true)와 빼기. 테스트 운영자는 보기만 한다(4-15). */
  async change(admin: Viewer, word: string, add: boolean): Promise<View> {
    if (admin.user.isTestAdmin) throw badRequest("READ_ONLY", "테스트 운영자는 금칙어를 볼 수만 있어요");
    const snap = await ref().get();
    const before = snap.exists ? (snap.data()!.words as string[]) : [...DEFAULT_BANNED_WORDS];
    const w = word.trim();
    if (add) {
      const refusal = addRefusal(w, before);
      if (refusal) throw badRequest("INVALID_WORD", refusal);
    } else if (!before.includes(w)) throw badRequest("INVALID_WORD", "목록에 없는 금칙어예요");
    const words = add ? [...before, w] : before.filter((x) => x !== w);
    await ref().set({ words, updatedBy: admin.uid, updatedAt: Timestamp.now() });
    cache = { words, at: Date.now() }; // 이 서버는 바로 쓴다. 다른 서버는 1분 안에 따라온다
    await writeAdminLog(admin, { action: add ? "금칙어 추가" : "금칙어 삭제", targetType: "config", targetId: "bannedWords", targetNickname: "금칙어", targetSeed: true, reason: "", before: `${before.length}개`, after: `${words.length}개 (${w})` });
    return bannedWordsAdmin.view(admin);
  },
};
