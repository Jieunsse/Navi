import { findBannedWord } from "@nabi/shared";
import { getBannedWords } from "./bannedWords.ts";
import { chatItemSchema, type ChatItem } from "@nabi/shared/chat.ts";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { tooFast } from "../domain/chat.ts";
import { stillBlocked } from "../domain/moderation.ts";
import { AppError, conflict, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";
import { assertCanChat } from "./moderation.ts";

const ENDED = () => conflict("ENDED", "방송이 끝나 채팅을 쓸 수 없어요");

type CommentDoc = {
  authorId?: string | null;
  authorNickname: string;
  authorGrade?: string | null;
  isHost?: boolean | null;
  content: string;
  hidden: boolean;
  messageId: string;
  createdAt: Timestamp;
};

const toItem = (d: CommentDoc): ChatItem =>
  chatItemSchema.parse({ ...d, kind: "chat", createdAt: iso(d.createdAt) });

/** enforceTestLimit은 broadcast 유스케이스의 것을 그대로 받는다(테스트 방송자 30분 제한). */
export function chatUseCases(livekit: LiveKitPort, enforceTestLimit: (broadcastId: string) => Promise<boolean>) {
  return {
    /**
     * 방송 보기 화면이 처음 열릴 때 묻는다(4-14, 4-15). 방송자의 방송 금지 여부(참/거짓)와,
     * 로그인한 본인이 채팅을 쓸 수 없을 때의 안내만 준다. 다른 사람의 제재 내용은 내보내지 않는다.
     */
    async access(uid: string | null, broadcastId: string) {
      const bsnap = await db().collection("broadcasts").doc(broadcastId).get();
      if (!bsnap.exists) throw notFound();
      const ownerId = (bsnap.data() as { ownerId: string }).ownerId;
      const owner = (await db().collection("users").doc(ownerId).get()).data() as { broadcastBannedUntil?: Timestamp | null } | undefined;
      const chatBlock = uid
        ? await assertCanChat(uid, ownerId).then(
            () => null,
            (e: unknown) => (e instanceof AppError ? e.message : Promise.reject(e)),
          )
        : null;
      return { ownerBroadcastBanned: stillBlocked(owner?.broadcastBannedUntil?.toDate() ?? null, new Date()), chatBlock };
    },

    /** 샘플 계정(seedKind가 sample)인가. 예시 표시에만 쓴다(4-18). */
    async isExample(userId: string) {
      const u = (await db().collection("users").doc(userId).get()).data() as { seedKind?: string | null } | undefined;
      return { example: u?.seedKind === "sample" };
    },

    async send(viewer: Viewer, broadcastId: string, input: { messageId: string; content: string }): Promise<ChatItem> {
      const bref = db().collection("broadcasts").doc(broadcastId);
      const bsnap = await bref.get();
      if (!bsnap.exists) throw notFound();
      const b = bsnap.data() as { ownerId: string; status: "ready" | "live" | "ended" };
      if (b.status === "ended" || (await enforceTestLimit(broadcastId))) throw ENDED();
      await assertCanChat(viewer.uid, b.ownerId); // 영구 정지, 채팅 금지, 방송자의 활동 제한(4-14, 4-15)

      const banned = findBannedWord(input.content, await getBannedWords());
      const cref = bref.collection("comments").doc(input.messageId);
      const lastRef = bref.collection("chatters").doc(viewer.uid);

      const item = await db().runTransaction(async (tx) => {
        const [csnap, lsnap] = await Promise.all([tx.get(cref), tx.get(lastRef)]);
        if (csnap.exists) {
          // 같은 번호의 다시 보내기는 처음 결과를 그대로 돌려준다. 다른 사람의 번호면 거절한다.
          const old = csnap.data() as CommentDoc;
          if (old.authorId !== viewer.uid) throw conflict("MESSAGE_ID_TAKEN", "이미 쓰인 메시지 번호예요");
          return toItem(old);
        }
        const now = Timestamp.now();
        const last = (lsnap.data() as { lastAt?: Timestamp } | undefined)?.lastAt?.toDate() ?? null;
        if (tooFast(last, now.toDate())) throw new AppError(429, "TOO_FAST", "조금 천천히 보내 주세요");

        const doc: CommentDoc & { kind: "chat" } = {
          kind: "chat",
          authorId: viewer.uid,
          authorNickname: viewer.user.nickname,
          authorGrade: viewer.user.grade, // 쓴 순간의 등급
          isHost: viewer.uid === b.ownerId,
          content: banned ? "" : input.content,
          hidden: !!banned,
          messageId: input.messageId,
          createdAt: now,
        };
        tx.create(cref, doc);
        tx.set(lastRef, { lastAt: now });
        if (banned) {
          tx.create(db().collection("hiddenComments").doc(input.messageId), {
            broadcastId,
            content: input.content,
            bannedWord: banned,
            createdAt: now,
          });
        }
        return toItem(doc);
      });

      // 숨긴 채팅은 내용이 이미 비어 있어 숨김 표시만 나간다. 다시 보내기여도 받는 쪽이 번호로 거른다.
      await livekit.send(broadcastId, "chat", item);
      return item;
    },
  };
}
