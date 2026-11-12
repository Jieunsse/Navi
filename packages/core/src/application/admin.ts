import { chatItemSchema } from "@nabi/shared/chat.ts";
import {
  MASKED_NICKNAME,
  TEST_ACCOUNT_PROTECTED_MESSAGE,
  TEST_ADMIN_SCOPE_MESSAGE,
  SANCTION_LABEL,
  type AdminUser,
  type resolveSchema,
  type sanctionInputSchema,
} from "@nabi/shared/moderation.ts";
import type { z } from "zod";
import type { Query } from "firebase-admin/firestore";
import { adminAuth, db, iso, Timestamp } from "../adapters/firebase.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { inTestAdminScope, kstDayStart, sanctionEnd, sanctionRefusal, summarize } from "../domain/moderation.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { requireUser, type UserDoc, type Viewer } from "./auth.ts";
import { reportLabel, toSanctionItem, type ReportDoc, type SanctionDoc, type SummaryDoc } from "./moderation.ts";

type FullUser = UserDoc & SummaryDoc;
const users = () => db().collection("users");
const when = (t: Timestamp | null | undefined) => t?.toDate() ?? null;
const isTest = (v: Viewer) => !!v.user.isTestAdmin;

/** 운영자 요청마다 부른다. 운영자 표시가 없으면 403이다(4-15). */
export async function requireAdmin(authHeader: string | null) {
  const v = await requireUser(authHeader);
  if (!v.user.isAdmin) throw forbidden();
  return v;
}

/** 테스트 운영자는 시드 계정만 보고 조치한다(결정 23, 25). */
const assertScope = (v: Viewer, inScope: boolean) => {
  if (isTest(v) && !inScope) throw forbidden(TEST_ADMIN_SCOPE_MESSAGE);
};

function toBrief(uid: string, u: FullUser, v: Viewer): AdminUser {
  const masked = isTest(v) && !inTestAdminScope(u.seedKind);
  return {
    uid,
    nickname: masked ? MASKED_NICKNAME : u.nickname,
    email: masked ? null : u.email,
    grade: u.grade,
    seedKind: u.seedKind ?? null,
    isAdmin: !!u.isAdmin,
    masked,
    suspended: !!u.suspended,
    chatBannedUntil: iso(u.chatBannedUntil as Timestamp | null),
    broadcastBannedUntil: iso(u.broadcastBannedUntil as Timestamp | null),
  };
}

export function adminUseCases(livekit: LiveKitPort, endBroadcast: (id: string) => Promise<boolean>) {
  const sanctions = () => db().collection("sanctions");

  async function log(
    admin: Viewer,
    e: { action: string; targetType: string; targetId: string; targetNickname: string; targetSeed: boolean; reason: string; before: string; after: string },
  ) {
    await db().collection("adminLogs").add({ adminId: admin.uid, adminNickname: admin.user.nickname, ...e, createdAt: Timestamp.now() });
  }

  async function loadUser(uid: string) {
    const snap = await users().doc(uid).get();
    if (!snap.exists) throw notFound("사용자를 찾을 수 없어요");
    return snap.data() as FullUser;
  }

  /** 적용 중인 제재에서 사용자 문서의 요약을 다시 만든다. 채팅·방송·로그인 확인은 이 요약만 본다(4-15). */
  async function syncSummary(uid: string) {
    const snap = await sanctions().where("userId", "==", uid).get();
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

  async function endLiveBroadcasts(uid: string) {
    const live = await db().collection("broadcasts").where("ownerId", "==", uid).where("status", "==", "live").get();
    for (const d of live.docs) await endBroadcast(d.id);
  }

  async function applySanction(admin: Viewer, uid: string, input: z.output<typeof sanctionInputSchema>, reportId: string | null) {
    const target = await loadUser(uid);
    const refusal = sanctionRefusal(admin.user, target);
    if (refusal === "ADMIN_TARGET") throw forbidden("운영자에게는 제재를 걸 수 없어요");
    if (refusal === "NOT_SEED") throw forbidden(TEST_ADMIN_SCOPE_MESSAGE);
    if (refusal === "PROTECTED_TEST") throw forbidden(TEST_ACCOUNT_PROTECTED_MESSAGE);
    const now = new Date();
    const end = sanctionEnd(input.kind, input.days, now);
    if (end === undefined) throw badRequest("INVALID_DAYS", "제재 기간을 확인해 주세요");

    const doc: SanctionDoc = {
      userId: uid,
      kind: input.kind,
      startAt: Timestamp.fromDate(now),
      endAt: end ? Timestamp.fromDate(end) : null,
      reason: input.reason,
      reportId,
      adminId: admin.uid,
      status: "active",
    };
    const ref = await sanctions().add(doc);
    await syncSummary(uid);
    if (input.kind === "broadcastBan" || input.kind === "suspend") await endLiveBroadcasts(uid);
    if (input.kind === "suspend") {
      // 계정을 끄고 로그인 토큰을 무효로 만든다. 정산 보류는 해제해도 따로 풀어야 한다(4-15).
      await adminAuth().updateUser(uid, { disabled: true });
      await adminAuth().revokeRefreshTokens(uid);
      await users().doc(uid).update({ settlementHold: true, settlementHoldReason: "운영 조치(영구 정지)" });
    }
    await log(admin, {
      action: `제재: ${SANCTION_LABEL[input.kind]}${input.days ? ` ${input.days}일` : ""}`,
      targetType: "user",
      targetId: uid,
      targetNickname: target.nickname,
      targetSeed: !!target.seedKind,
      reason: input.reason,
      before: "제재 없음",
      after: ref.id,
    });
  }

  async function hideChat(admin: Viewer, r: ReportDoc, reason: string) {
    const cref = db().collection("broadcasts").doc(r.broadcastId!).collection("comments").doc(r.targetId);
    const snap = await cref.get();
    if (!snap.exists) throw notFound("채팅을 찾을 수 없어요");
    const c = snap.data() as { kind?: string; content: string; hidden: boolean; createdAt: Timestamp };
    if (!c.hidden) {
      const hidden = db().collection("hiddenComments").doc(r.targetId);
      await hidden.set({ broadcastId: r.broadcastId, content: c.content, word: "운영자 숨김", createdAt: Timestamp.now() });
      await cref.update({ hidden: true, content: "" });
      if (c.kind === "donation") await db().collection("donations").doc(r.targetId).update({ messageHidden: true });
      const item = chatItemSchema.safeParse({ ...c, kind: c.kind ?? "chat", content: "", hidden: true, createdAt: iso(c.createdAt) });
      if (item.success) await livekit.send(r.broadcastId!, item.data.kind === "donation" ? "donation" : "chat", item.data);
    }
    await log(admin, { action: "채팅 숨기기", targetType: "chat", targetId: r.targetId, targetNickname: r.snapshot.authorNickname ?? "", targetSeed: r.targetSeed, reason, before: "표시", after: "숨김" });
  }

  return {
    async dashboard(admin: Viewer) {
      const today = Timestamp.fromDate(kstDayStart(new Date()));
      const bs = () => db().collection("broadcasts");
      const count = async (q: Query) => (await q.count().get()).data().count;
      const [broadcastsToday, liveNow, pendingReports, donations] = await Promise.all([
        count(bs().where("createdAt", ">=", today)),
        count(bs().where("status", "==", "live")),
        count(db().collection("reports").where("status", "==", "pending")),
        db().collection("donations").where("createdAt", ">=", today).get(),
      ]);
      const donationToday = donations.docs.reduce((n, d) => n + ((d.data().amount as number | undefined) ?? 0), 0);
      return { isTestAdmin: isTest(admin), broadcastsToday, liveNow, donationToday, pendingReports };
    },

    /** 신고를 대상 사용자별로 묶는다(4-15). */
    async reportGroups(admin: Viewer) {
      const snap = await db().collection("reports").orderBy("createdAt", "desc").limit(500).get();
      const by = new Map<string, { id: string; r: ReportDoc }[]>();
      for (const d of snap.docs) {
        const r = d.data() as ReportDoc;
        by.set(r.targetUserId, [...(by.get(r.targetUserId) ?? []), { id: d.id, r }]);
      }
      const ids = [...by.keys()];
      const docs = ids.length ? await db().getAll(...ids.map((id) => users().doc(id))) : [];
      return ids.map((uid, i) => {
        const rows = by.get(uid)!; // 최근 것이 앞
        const u = docs[i]?.data() as FullUser | undefined;
        const masked = isTest(admin) && !inTestAdminScope(u?.seedKind); // 열 수 있어도 실제 사용자 이름은 가린다
        return {
          userId: uid,
          nickname: masked ? MASKED_NICKNAME : (u?.nickname ?? "(탈퇴한 사용자)"),
          masked,
          count: rows.length,
          latestReason: rows[0]!.r.reason,
          firstAt: iso(rows[rows.length - 1]!.r.createdAt)!,
          status: rows.some((x) => x.r.status === "pending") ? ("pending" as const) : ("done" as const),
        };
      });
    },

    async reportDetail(admin: Viewer, uid: string) {
      const [user, snap, sanc] = await Promise.all([
        loadUser(uid),
        db().collection("reports").where("targetUserId", "==", uid).get(),
        sanctions().where("userId", "==", uid).orderBy("startAt", "desc").get(),
      ]);
      const rows = snap.docs.map((d) => ({ id: d.id, r: d.data() as ReportDoc })).sort((a, b) => b.r.createdAt.toMillis() - a.r.createdAt.toMillis());
      if (!rows.length) throw notFound("신고를 찾을 수 없어요");
      assertScope(admin, inTestAdminScope(user.seedKind) || rows.some((x) => x.r.broadcastOwnerSeed));
      const reporters = await db().getAll(...[...new Set(rows.map((x) => x.r.reporterId))].map((id) => users().doc(id)));
      const reporterSeed = new Map(reporters.map((s) => [s.id, !!s.data()?.seedKind]));
      const now = new Date();
      return {
        user: toBrief(uid, user, admin),
        reports: rows.map(({ id, r }) => ({
          id,
          targetType: r.targetType,
          targetLabel: r.targetType === "chat" ? `${r.snapshot.anonymous ? "익명 후원 메시지" : toBrief(uid, user, admin).nickname}: ${r.snapshot.content ?? ""}` : reportLabel(r),
          broadcastId: r.broadcastId,
          reason: r.reason,
          detail: r.detail,
          reporterNickname: isTest(admin) && !reporterSeed.get(r.reporterId) ? MASKED_NICKNAME : r.reporterNickname,
          createdAt: iso(r.createdAt)!,
          status: r.status,
          canHide: r.targetType !== "user",
        })),
        sanctions: sanc.docs.map((d) => toSanctionItem(d.id, d.data() as SanctionDoc, now)),
      };
    },

    /** 신고 처리. 이 사용자에게 걸린 접수 상태의 신고가 모두 같은 결과가 된다(06 결정 27). */
    async resolve(admin: Viewer, uid: string, input: z.output<typeof resolveSchema>) {
      const [user, snap] = await Promise.all([loadUser(uid), db().collection("reports").where("targetUserId", "==", uid).get()]);
      const pending = snap.docs.filter((d) => d.data().status === "pending");
      if (!pending.length) throw conflict("NO_PENDING", "처리할 신고가 없어요");
      const userScope = inTestAdminScope(user.seedKind);

      if (input.action === "sanction") {
        if (!input.sanction) throw badRequest("INVALID", "제재 종류를 골라 주세요");
        await applySanction(admin, uid, { ...input.sanction, reason: input.reason }, pending[0]!.id);
      } else if (input.action === "hide") {
        const target = pending.find((d) => d.id === input.reportId) ?? snap.docs.find((d) => d.id === input.reportId);
        if (!target) throw badRequest("INVALID", "숨길 신고를 골라 주세요");
        const r = target.data() as ReportDoc;
        assertScope(admin, r.targetSeed || r.broadcastOwnerSeed);
        if (r.targetType === "chat") await hideChat(admin, r, input.reason);
        else if (r.targetType === "broadcast") {
          const ended = await endBroadcast(r.targetId);
          await log(admin, { action: "방송 강제 종료", targetType: "broadcast", targetId: r.targetId, targetNickname: r.snapshot.title ?? "", targetSeed: r.targetSeed, reason: input.reason, before: ended ? "방송 중" : "방송 중 아님", after: "종료" });
        } else throw badRequest("INVALID", "사용자 신고는 숨길 콘텐츠가 없어요");
      } else {
        assertScope(admin, userScope || pending.some((d) => (d.data() as ReportDoc).broadcastOwnerSeed));
      }

      const status = input.action === "dismiss" ? "dismissed" : "actioned";
      const batch = db().batch();
      const now = Timestamp.now();
      pending.forEach((d) => batch.update(d.ref, { status, processedBy: admin.uid, processReason: input.reason, processedAt: now }));
      await batch.commit();
      await log(admin, {
        action: input.action === "dismiss" ? "신고 기각" : "신고 조치",
        targetType: "user",
        targetId: uid,
        targetNickname: user.nickname,
        targetSeed: !!user.seedKind,
        reason: input.reason,
        before: `접수 ${pending.length}건`,
        after: status === "dismissed" ? "기각" : "조치함",
      });
    },

    async users(admin: Viewer) {
      const snap = await users().orderBy("nickname").limit(300).get();
      return snap.docs.map((d) => ({ uid: d.id, u: d.data() as FullUser })).filter((x) => !isTest(admin) || x.u.seedKind).map((x) => toBrief(x.uid, x.u, admin));
    },

    async userDetail(admin: Viewer, uid: string) {
      const user = await loadUser(uid);
      assertScope(admin, inTestAdminScope(user.seedKind));
      const [sanc, reports] = await Promise.all([
        sanctions().where("userId", "==", uid).orderBy("startAt", "desc").get(),
        db().collection("reports").where("targetUserId", "==", uid).count().get(),
      ]);
      const now = new Date();
      return { user: toBrief(uid, user, admin), sanctions: sanc.docs.map((d) => toSanctionItem(d.id, d.data() as SanctionDoc, now)), reportCount: reports.data().count };
    },

    sanction: (admin: Viewer, uid: string, input: z.output<typeof sanctionInputSchema>) => applySanction(admin, uid, input, null),

    async revoke(admin: Viewer, id: string, reason: string) {
      const ref = sanctions().doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw notFound("제재를 찾을 수 없어요");
      const s = snap.data() as SanctionDoc;
      const target = await loadUser(s.userId);
      assertScope(admin, inTestAdminScope(target.seedKind));
      if (toSanctionItem(id, s, new Date()).status !== "active") throw conflict("NOT_ACTIVE", "적용 중인 제재가 아니에요");
      await ref.update({ status: "revoked", revokeReason: reason });
      await syncSummary(s.userId);
      if (s.kind === "suspend") await adminAuth().updateUser(s.userId, { disabled: false });
      await log(admin, { action: `제재 해제: ${SANCTION_LABEL[s.kind]}`, targetType: "user", targetId: s.userId, targetNickname: target.nickname, targetSeed: !!target.seedKind, reason, before: "적용 중", after: "해제" });
    },

    async logs(admin: Viewer) {
      const snap = await db().collection("adminLogs").orderBy("createdAt", "desc").limit(100).get();
      return snap.docs.map((d) => {
        const l = d.data();
        const masked = isTest(admin) && !l.targetSeed;
        return {
          id: d.id,
          adminNickname: l.adminNickname as string,
          action: l.action as string,
          targetLabel: masked ? MASKED_NICKNAME : (l.targetNickname as string),
          reason: masked ? "" : (l.reason as string),
          before: l.before as string,
          after: l.after as string,
          createdAt: iso(l.createdAt as Timestamp)!,
        };
      });
    },
  };
}
