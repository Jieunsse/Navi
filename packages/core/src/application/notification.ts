import { NOTIFICATION_LIST_LIMIT, type NotificationItem, type NotificationKind } from "@nabi/shared/notification.ts";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import { freshSince, type NotificationInput } from "../domain/notification.ts";
import { notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";

/** 트랜잭션과 배치가 둘 다 이 모양으로 쓸 수 있다. */
type Writer = { create(ref: DocumentReference, data: DocumentData): unknown };

const col = (uid: string) => db().collection("users").doc(uid).collection("notifications");

/** 일을 확정하는 같은 트랜잭션(또는 배치)에서 부른다. 읽기가 없어서 쓰기 단계 어디서든 부를 수 있다(4-17). */
export function writeNotification(w: Writer, uid: string, n: NotificationInput) {
  w.create(col(uid).doc(), { kind: n.kind, text: n.text, href: n.href, refId: n.refId ?? null, read: false, createdAt: Timestamp.now() });
}

/** 확정하는 쓰기가 트랜잭션이 아닌 곳에서만 쓴다. */
export async function notify(uid: string, n: NotificationInput) {
  const b = db().batch();
  writeNotification(b, uid, n);
  await b.commit();
}

const unreadQuery = (uid: string) => col(uid).where("read", "==", false).where("createdAt", ">=", Timestamp.fromDate(freshSince(Date.now())));

export function notificationUseCases() {
  const unread = async (uid: string) => (await unreadQuery(uid).count().get()).data().count;
  return {
    unread: async (viewer: Viewer) => ({ unread: await unread(viewer.uid) }),

    /** 알림 패널을 열 때: 30일 안의 최근 30개 */
    async list(viewer: Viewer): Promise<{ items: NotificationItem[]; unread: number }> {
      const [snap, count] = await Promise.all([
        col(viewer.uid).where("createdAt", ">=", Timestamp.fromDate(freshSince(Date.now()))).orderBy("createdAt", "desc").limit(NOTIFICATION_LIST_LIMIT).get(),
        unread(viewer.uid),
      ]);
      return {
        items: snap.docs.map((d) => {
          const x = d.data() as { kind: NotificationKind; text: string; href: string | null; refId: string | null; read: boolean; createdAt: Timestamp };
          return { id: d.id, kind: x.kind, text: x.text, href: x.href, refId: x.refId, read: x.read, createdAt: iso(x.createdAt)! };
        }),
        unread: count,
      };
    },

    async read(viewer: Viewer, id: string) {
      const ref = col(viewer.uid).doc(id);
      if (!(await ref.get()).exists) throw notFound("알림을 찾을 수 없어요");
      await ref.update({ read: true });
    },

    /** 내 알림을 모두 읽음으로. 한 번에 최대 400개씩 끝날 때까지 바꾼다. */
    async readAll(viewer: Viewer) {
      for (;;) {
        const snap = await col(viewer.uid).where("read", "==", false).limit(400).get();
        if (snap.empty) return;
        const b = db().batch();
        snap.docs.forEach((d) => b.update(d.ref, { read: true }));
        await b.commit();
      }
    },
  };
}
