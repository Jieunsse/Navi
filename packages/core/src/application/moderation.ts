import { REPORT_DAILY_LIMIT, REPORT_REASONS, type ChatBan, type MyReport, type SanctionItem } from "@nabi/shared/moderation.ts";
import type { z } from "zod";
import type { chatBanInputSchema, createReportSchema } from "@nabi/shared/moderation.ts";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import { chatBanEnd, chatBlock, effectiveStatus, kstDayStart, reportTargetOf, stillBlocked, summarize } from "../domain/moderation.ts";
import { AppError, conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";

type Stamp = Timestamp | null | undefined;
export type SummaryDoc = { suspended?: boolean; chatBannedUntil?: Stamp; broadcastBannedUntil?: Stamp };
export type SanctionDoc = {
  userId: string;
  kind: "warning" | "chatBan" | "broadcastBan" | "suspend";
  startAt: Timestamp;
  endAt: Timestamp | null;
  reason: string;
  reportId: string | null;
  adminId: string;
  status: "active" | "ended" | "revoked" | "appealCanceled";
  revokeReason?: string | null;
};
export type ReportDoc = {
  targetType: "chat" | "broadcast" | "user";
  targetId: string;
  targetUserId: string;
  broadcastId: string | null;
  reporterId: string;
  reporterNickname: string;
  reason: keyof typeof REPORT_REASONS;
  detail: string;
  snapshot: { content?: string; authorNickname?: string; anonymous?: boolean; hidden?: boolean; title?: string; ownerNickname?: string; nickname?: string };
  targetSeed: boolean;
  broadcastOwnerSeed: boolean;
  status: "pending" | "actioned" | "dismissed";
  createdAt: Timestamp;
};

const users = () => db().collection("users");
const when = (t: Stamp) => t?.toDate() ?? null;
const fmt = (d: Date) => d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export const toSanctionItem = (id: string, s: SanctionDoc, now: Date): SanctionItem => ({
  id,
  kind: s.kind,
  startAt: iso(s.startAt)!,
  endAt: iso(s.endAt),
  reason: s.reason,
  status: effectiveStatus({ kind: s.kind, status: s.status, endAt: when(s.endAt) }, now),
  revokeReason: s.revokeReason ?? null,
});

/** 운영 기록 한 줄. 운영자가 한 일은 모두 이 함수로 남긴다(4-15). */
export async function writeAdminLog(
  admin: Viewer,
  e: { action: string; targetType: string; targetId: string; targetNickname: string; targetSeed: boolean; reason: string; before: string; after: string },
) {
  await db().collection("adminLogs").add({ adminId: admin.uid, adminNickname: admin.user.nickname, ...e, createdAt: Timestamp.now() });
}

/** 적용 중인 제재에서 사용자 문서의 요약을 다시 만든다. 채팅·방송·로그인 확인은 이 요약만 본다(4-15). */
export async function syncSanctionSummary(uid: string) {
  const snap = await db().collection("sanctions").where("userId", "==", uid).get();
  const sum = summarize(
    snap.docs.map((d) => {
      const s = d.data() as SanctionDoc;
      return { kind: s.kind, status: s.status, endAt: when(s.endAt) };
    }),
    new Date(),
  );
  await users().doc(uid).update({
    chatBannedUntil: sum.chatBannedUntil ? Timestamp.fromDate(sum.chatBannedUntil) : null,
    broadcastBannedUntil: sum.broadcastBannedUntil ? Timestamp.fromDate(sum.broadcastBannedUntil) : null,
    suspended: sum.suspended,
    unseenWarning: sum.unseenWarning,
  });
}

const blockError = {
  SUSPENDED: () => new AppError(403, "SUSPENDED", "운영정책 위반으로 이용이 정지된 계정이에요"),
  CHAT_BANNED: () => new AppError(403, "CHAT_BANNED", "운영정책 위반으로 채팅을 쓸 수 없어요"),
  OWNER_BAN: () => new AppError(403, "OWNER_BAN", "이 방송에서 채팅이 제한됐어요"),
};
export const chatBlockError = (code: keyof typeof blockError) => blockError[code]();

/** 방송 만들기와 송출 권한 받기 앞에서 부른다. 영구 정지와 방송 금지면 거절한다(4-15). */
export async function assertCanBroadcast(uid: string) {
  const u = ((await users().doc(uid).get()).data() ?? {}) as SummaryDoc;
  if (u.suspended) throw blockError.SUSPENDED();
  const until = when(u.broadcastBannedUntil);
  if (until && stillBlocked(until, new Date())) throw new AppError(403, "BROADCAST_BANNED", `운영정책 위반으로 ${fmt(until)}까지 방송할 수 없어요`);
}

/**
 * 채팅 쓰기 앞에서 부른다. 영구 정지, 채팅 금지, 방송자의 활동 제한이면 거절한다(4-14, 4-15).
 * 활동 제한 기간이 끝났으면 기록을 지우고 통과시킨다. 예약 작업은 쓰지 않는다.
 */
export async function assertCanChat(uid: string, broadcastOwnerId: string) {
  const banRef = users().doc(broadcastOwnerId).collection("chatBans").doc(uid);
  const [u, ban] = await Promise.all([users().doc(uid).get(), uid === broadcastOwnerId ? null : banRef.get()]);
  const now = new Date();
  let ownerBan = ban?.exists ? { endAt: when((ban.data() as { endAt: Stamp }).endAt) } : null;
  if (ownerBan?.endAt && ownerBan.endAt <= now) {
    await banRef.delete();
    ownerBan = null;
  }
  const user = (u.data() ?? {}) as SummaryDoc;
  const code = chatBlock({ suspended: user.suspended, chatBannedUntil: when(user.chatBannedUntil) }, ownerBan, now);
  if (code) throw chatBlockError(code);
}

const snippet = (s: string) => (s.length > 30 ? `${s.slice(0, 30)}…` : s);

export function reportLabel(r: Pick<ReportDoc, "targetType" | "snapshot">) {
  const s = r.snapshot;
  if (r.targetType === "chat") return s.anonymous ? "익명 후원 메시지" : s.hidden ? `${s.authorNickname}의 숨긴 채팅` : `${s.authorNickname}의 채팅 “${snippet(s.content ?? "")}”`;
  return r.targetType === "broadcast" ? `방송 “${s.title}”` : `사용자 ${s.nickname}`;
}

export const reportTargetRef = (uid: string) => db().collection("reportTargets").doc(uid);

/** 신고 대상 요약을 그 사용자의 신고 전부에서 다시 만든다. 신고가 없으면 요약 문서도 지운다. 시드·보정 스크립트가 쓴다. */
export async function syncReportTarget(uid: string) {
  const snap = await db().collection("reports").where("targetUserId", "==", uid).get();
  const sum = reportTargetOf(snap.docs.map((d) => d.data() as ReportDoc & { processedAt?: Timestamp }));
  if (sum) await reportTargetRef(uid).set({ userId: uid, ...sum });
  else await reportTargetRef(uid).delete();
}

export function moderationUseCases() {
  const reports = () => db().collection("reports");
  return {
    /** 신고 저장(4-13). 신고 문서 ID로 같은 대상을 두 번 신고하지 못하게 막는다. */
    async report(viewer: Viewer, input: z.output<typeof createReportSchema>) {
      const fs = db();
      const seed = async (uid: string) => !!(await users().doc(uid).get()).data()?.seedKind;
      let targetUserId: string;
      let broadcastId: string | null = null;
      let ownerId: string | null = null;
      let snapshot: ReportDoc["snapshot"];

      if (input.targetType === "chat") {
        broadcastId = input.broadcastId!;
        const bref = fs.collection("broadcasts").doc(broadcastId);
        const [b, c] = await Promise.all([bref.get(), bref.collection("comments").doc(input.targetId).get()]);
        if (!b.exists || !c.exists) throw notFound("채팅을 찾을 수 없어요");
        ownerId = b.data()!.ownerId as string;
        const cd = c.data() as { authorId?: string | null; authorNickname: string; content: string; hidden: boolean };
        const anonymous = !cd.authorId;
        // 익명 후원 항목에는 작성자가 없다. 실제 후원자는 후원 기록에서만 찾는다(06 결정 27).
        const author = cd.authorId ?? ((await fs.collection("donations").doc(input.targetId).get()).data()?.donorId as string | undefined);
        if (!author) throw notFound("채팅을 찾을 수 없어요");
        targetUserId = author;
        const content = cd.hidden ? ((await fs.collection("hiddenComments").doc(input.targetId).get()).data()?.content as string | undefined) ?? "" : cd.content;
        snapshot = { content, authorNickname: anonymous ? "익명" : cd.authorNickname, anonymous, hidden: cd.hidden };
      } else if (input.targetType === "broadcast") {
        broadcastId = input.targetId;
        const b = await fs.collection("broadcasts").doc(input.targetId).get();
        if (!b.exists) throw notFound();
        targetUserId = ownerId = b.data()!.ownerId as string;
        snapshot = { title: b.data()!.title as string, ownerNickname: b.data()!.ownerNickname as string };
      } else {
        const u = await users().doc(input.targetId).get();
        if (!u.exists) throw notFound("사용자를 찾을 수 없어요");
        targetUserId = input.targetId;
        snapshot = { nickname: u.data()!.nickname as string };
      }
      if (targetUserId === viewer.uid) throw forbidden("나 자신은 신고할 수 없어요");

      const since = Timestamp.fromDate(kstDayStart(new Date()));
      const today = (await reports().where("reporterId", "==", viewer.uid).where("createdAt", ">=", since).count().get()).data().count;
      if (today >= REPORT_DAILY_LIMIT) throw new AppError(429, "REPORT_LIMIT", "오늘은 더 신고할 수 없어요");

      const doc: ReportDoc = {
        targetType: input.targetType,
        targetId: input.targetId,
        targetUserId,
        broadcastId,
        reporterId: viewer.uid,
        reporterNickname: viewer.user.nickname,
        reason: input.reason,
        detail: input.detail,
        snapshot,
        targetSeed: await seed(targetUserId),
        broadcastOwnerSeed: ownerId ? await seed(ownerId) : false,
        status: "pending",
        createdAt: Timestamp.now(),
      };
      try {
        // 신고와 대상 요약을 한 번에 쓴다. 같은 신고를 또 만들면 create가 code 6으로 실패한다.
        await fs.runTransaction(async (tx) => {
          const ref = reportTargetRef(targetUserId);
          const agg = (await tx.get(ref)).data();
          const pendingCount = (agg?.pendingCount ?? 0) + 1;
          tx.create(reports().doc(`${viewer.uid}_${input.targetType}_${input.targetId}`), doc);
          tx.set(ref, {
            userId: targetUserId,
            pendingCount,
            totalCount: (agg?.totalCount ?? 0) + 1,
            firstPendingAt: agg && agg.pendingCount > 0 ? agg.firstPendingAt : doc.createdAt,
            lastReportAt: doc.createdAt,
            latestReason: doc.reason,
            status: "pending",
            resolvedAt: null,
          });
        });
      } catch (e) {
        if ((e as { code?: number }).code === 6) throw conflict("ALREADY_REPORTED", "이미 신고했어요");
        throw e;
      }
    },

    async myReports(viewer: Viewer): Promise<MyReport[]> {
      const snap = await reports().where("reporterId", "==", viewer.uid).orderBy("createdAt", "desc").limit(100).get();
      return snap.docs.map((d) => {
        const r = d.data() as ReportDoc;
        return { id: d.id, targetType: r.targetType, label: reportLabel(r), reason: r.reason, createdAt: iso(r.createdAt)!, status: r.status };
      });
    },

    async mySanctions(viewer: Viewer): Promise<SanctionItem[]> {
      const snap = await db().collection("sanctions").where("userId", "==", viewer.uid).orderBy("startAt", "desc").limit(100).get();
      const now = new Date();
      const appeals = snap.docs.length ? await db().getAll(...snap.docs.map((d) => db().collection("appeals").doc(d.id))) : []; // 이의 제기 문서 ID가 제재 ID다
      return snap.docs.map((d, i) => {
        const a = appeals[i]?.data() as { status: "pending" | "accepted" | "rejected"; answer?: string | null } | undefined;
        return { ...toSanctionItem(d.id, d.data() as SanctionDoc, now), appeal: a ? { status: a.status, answer: a.answer ?? null } : null };
      });
    },

    /** 경고 안내를 본 것으로 처리한다. 경고는 안내를 한 번 보여주면 끝난다(4-15). */
    async ackWarnings(viewer: Viewer) {
      const snap = await db().collection("sanctions").where("userId", "==", viewer.uid).where("status", "==", "active").get();
      const warnings = snap.docs.filter((d) => d.data().kind === "warning");
      const batch = db().batch();
      warnings.forEach((d) => batch.update(d.ref, { status: "ended" }));
      batch.update(users().doc(viewer.uid), { unseenWarning: false });
      await batch.commit();
    },

    /** 방송자가 자기 방송에서 쓰는 활동 제한(4-14). 제한은 방송자 문서 아래에 두므로 그 방송자의 방송에서만 효력이 있다. */
    async banChat(viewer: Viewer, input: z.output<typeof chatBanInputSchema>) {
      if (input.userId === viewer.uid) throw forbidden("나 자신에게는 걸 수 없어요");
      const hasBroadcast = !(await db().collection("broadcasts").where("ownerId", "==", viewer.uid).limit(1).get()).empty;
      if (!hasBroadcast) throw forbidden();
      const t = await users().doc(input.userId).get();
      if (!t.exists) throw notFound("사용자를 찾을 수 없어요");
      if (t.data()!.isAdmin) throw forbidden("운영자에게는 걸 수 없어요");
      const end = chatBanEnd(input.duration, new Date());
      await users().doc(viewer.uid).collection("chatBans").doc(input.userId).set({
        nickname: t.data()!.nickname as string,
        duration: input.duration,
        endAt: end ? Timestamp.fromDate(end) : null,
        memo: input.memo,
        createdAt: Timestamp.now(),
      });
    },

    async listChatBans(viewer: Viewer): Promise<ChatBan[]> {
      const snap = await users().doc(viewer.uid).collection("chatBans").get();
      const now = new Date();
      return snap.docs
        .filter((d) => (d.data().endAt as Stamp) === null || (d.data().endAt as Timestamp).toDate() > now)
        .map((d) => {
          const b = d.data();
          return { userId: d.id, nickname: b.nickname, duration: b.duration, endAt: iso(b.endAt), memo: b.memo, createdAt: iso(b.createdAt)! };
        });
    },

    async unbanChat(viewer: Viewer, userId: string) {
      await users().doc(viewer.uid).collection("chatBans").doc(userId).delete();
    },
  };
}
