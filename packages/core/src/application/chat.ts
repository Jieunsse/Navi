import { findBannedWord } from "@nabi/shared";
import { getBannedWords } from "./bannedWords.ts";
import { chatItemSchema, type ChatItem } from "@nabi/shared/chat.ts";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { chatChangeBlock, tooFast } from "../domain/chat.ts";
import { stillBlocked } from "../domain/moderation.ts";
import { AppError, conflict, forbidden, notFound } from "../errors.ts";
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
  edited?: boolean;
  deleted?: boolean;
  kind?: string;
  messageId: string;
  createdAt: Timestamp;
};

const toItem = (d: CommentDoc): ChatItem =>
  chatItemSchema.parse({ ...d, kind: "chat", createdAt: iso(d.createdAt) });


async function openBroadcast(broadcastId: string) {
  const bsnap = await db().collection("broadcasts").doc(broadcastId).get();
  if (!bsnap.exists) throw notFound();
  const b = bsnap.data() as { ownerId: string; status: "ready" | "live" | "ended" };
  if (b.status === "ended") throw ENDED();
  return b;
}

type Change = { content: string; hidden: boolean; edited?: boolean; deleted?: boolean; hiddenOriginal: { content: string; bannedWord: string } | null };

const BLOCK_MESSAGE = {
  NOT_CHAT: "후원과 미션 메시지는 고치거나 지울 수 없어요",
  NOT_AUTHOR: "내가 쓴 채팅만 고치거나 지울 수 있어요",
  DELETED: "이미 지운 채팅이에요",
} as const;

/** 작성자 확인 → 바꾸기 전 원문을 서버 전용 모음에 남김 → 채팅 줄을 바꿈. 시청자에게 보내기는 부르는 쪽이 한다. */
async function change(viewer: Viewer, broadcastId: string, messageId: string, n: Change) {
  const cref = db().collection("broadcasts").doc(broadcastId).collection("comments").doc(messageId);
  const href = db().collection("hiddenComments").doc(messageId);
  return db().runTransaction(async (tx) => {
    const [csnap, hsnap] = await Promise.all([tx.get(cref), tx.get(href)]); // 트랜잭션은 읽기를 쓰기보다 먼저 한다
    if (!csnap.exists) throw notFound("채팅을 찾을 수 없어요");
    const old = csnap.data() as CommentDoc;
    const block = chatChangeBlock(old, viewer.uid);
    if (block === "NOT_AUTHOR") throw forbidden(BLOCK_MESSAGE.NOT_AUTHOR);
    if (block) throw conflict(block, BLOCK_MESSAGE[block]);

    const now = Timestamp.now();
    const fields = { content: n.content, hidden: n.hidden, edited: n.edited ?? old.edited ?? false, deleted: n.deleted ?? false };
    const before = old.hidden ? ((hsnap.data()?.content as string | undefined) ?? "") : old.content;
    tx.update(cref, fields);
    // 신고를 확인할 때 쓰도록 바꾸기 전과 뒤의 원문을 남긴다(firestore.rules가 브라우저 읽기를 막는다)
    tx.create(db().collection("chatEdits").doc(), { broadcastId, messageId, authorId: viewer.uid, action: n.deleted ? "delete" : "edit", before, after: n.hiddenOriginal?.content ?? n.content, createdAt: now });
    if (n.hiddenOriginal) tx.set(href, { broadcastId, ...n.hiddenOriginal, createdAt: now });
    return toItem({ ...old, ...fields });
  });
}

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

    /** 내 채팅 고치기(선택 요구사항: 댓글 수정). 서버가 작성자 본인인지 확인하고, 금칙어 검사를 다시 한다. */
    async edit(viewer: Viewer, broadcastId: string, messageId: string, content: string): Promise<ChatItem> {
      const b = await openBroadcast(broadcastId);
      await assertCanChat(viewer.uid, b.ownerId); // 채팅이 막힌 사람은 고쳐서 새 내용을 쓸 수도 없다
      const banned = findBannedWord(content, await getBannedWords());
      const item = await change(viewer, broadcastId, messageId, {
        content: banned ? "" : content,
        hidden: !!banned,
        edited: true,
        // 고친 내용에 금칙어가 있으면 원문은 숨긴 채팅 보관함에만 남긴다
        hiddenOriginal: banned ? { content, bannedWord: banned } : null,
      });
      await livekit.send(broadcastId, "chat", item); // 같은 번호의 줄을 받으면 화면이 덮어쓴다
      return item;
    },

    /** 내 채팅 지우기(선택 요구사항: 댓글 삭제). 서버가 작성자 본인인지 확인한다. 줄은 "삭제된 채팅"으로 남긴다. */
    async remove(viewer: Viewer, broadcastId: string, messageId: string): Promise<ChatItem> {
      await openBroadcast(broadcastId);
      const item = await change(viewer, broadcastId, messageId, { content: "", hidden: false, deleted: true, hiddenOriginal: null });
      await livekit.send(broadcastId, "chat", item);
      return item;
    },
  };
}
