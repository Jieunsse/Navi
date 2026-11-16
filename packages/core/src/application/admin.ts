import { chatItemSchema } from "@nabi/shared/chat.ts";
import {
  MASKED_NICKNAME,
  TEST_ACCOUNT_PROTECTED_MESSAGE,
  TEST_ADMIN_SCOPE_MESSAGE,
  SANCTION_LABEL,
  type AdminUser,
  type USER_FILTERS,
  type resolveSchema,
  type sanctionInputSchema,
} from "@nabi/shared/moderation.ts";
import type { z } from "zod";
import { AggregateField, FieldPath, type Query } from "firebase-admin/firestore";
import { adminAuth, db, iso, Timestamp } from "../adapters/firebase.ts";
import type { LiveKitPort } from "../adapters/livekit.ts";
import { broadcastDuration, inTestAdminScope, kstDayStart, kstMonthStartOf, sanctionEnd, sanctionRefusal, summarize, userSearchKind } from "../domain/moderation.ts";
import { usageMonth } from "../domain/recording.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import { operatorAction, reportResolved } from "../domain/notification.ts";
import { nicknameKey } from "./account.ts";
import { requireUser, type UserDoc, type Viewer } from "./auth.ts";
import { notify, writeNotification } from "./notification.ts";
import { recordingRef } from "./recording.ts";
import { holdOpenSettlements } from "./settlement.ts";
import { reportLabel, reportTargetRef, toSanctionItem, type ReportDoc, type SanctionDoc, type SummaryDoc } from "./moderation.ts";

type UserFilter = (typeof USER_FILTERS)[number];
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

const REPORT_PAGE = 50;
type ReportTargetDoc = { pendingCount: number; totalCount: number; latestReason: ReportDoc["reason"]; firstPendingAt: Timestamp | null; lastReportAt: Timestamp; status: ReportDoc["status"] };
const REPORT_KIND = { chat: "채팅", broadcast: "방송", user: "사용자" } as const;

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
      const holdReason = "운영 조치(영구 정지)";
      await users().doc(uid).update({ settlementHold: true, settlementHoldReason: holdReason, settlementHeldBy: admin.uid });
      await holdOpenSettlements(uid, holdReason, admin.uid); // 이미 있는 지급 대기 기록도 보류로 바꾼다(4-12)
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

  /** 이미 끝난 방송이면 다시보기를 비공개로 바꾸고 알림 문구를 돌려준다(4-15). */
  async function privateReplay(broadcastId: string, reason: string) {
    const recId = (await db().collection("broadcasts").doc(broadcastId).get()).data()?.recordingId as string | null | undefined;
    if (recId) await recordingRef(recId).update({ isPublic: false });
    return `운영정책 위반(${reason})으로 다시보기를 비공개로 바꿨어요`;
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
      await notify(r.targetUserId, operatorAction(`운영정책 위반(${reason})으로 채팅을 숨겼어요`, r.targetId));
    }
    await log(admin, { action: "채팅 숨기기", targetType: "chat", targetId: r.targetId, targetNickname: r.snapshot.authorNickname ?? "", targetSeed: r.targetSeed, reason, before: "표시", after: "숨김" });
  }

  return {
    async dashboard(admin: Viewer) {
      const nowDate = new Date();
      const today = Timestamp.fromDate(kstDayStart(nowDate));
      const bs = () => db().collection("broadcasts");
      const count = async (q: Query) => (await q.count().get()).data().count;
      const [broadcastsToday, liveNow, pendingReports, pendingRefunds, pendingAppeals, donations, usage, monthBroadcasts] = await Promise.all([
        count(bs().where("createdAt", ">=", today)),
        count(bs().where("status", "==", "live")),
        count(db().collection("reports").where("status", "==", "pending")),
        count(db().collection("refunds").where("status", "in", ["pending", "failed"])),
        count(db().collection("appeals").where("status", "==", "pending")),
        db().collection("donations").where("createdAt", ">=", today).get(),
        db().collection("usage").doc(usageMonth(nowDate)).get(),
        bs().where("startedAt", ">=", Timestamp.fromDate(kstMonthStartOf(nowDate))).get(),
      ]);
      // 후원 합계는 요청 금액이 아니라 실제로 전달된 꿀이다. 나비 몫은 전달된 꿀에서 방송자 몫을 뺀 값이다.
      let donationToday = 0;
      let nabiShareToday = 0;
      for (const d of donations.docs) {
        const x = d.data() as { delivered?: number; streamerEarning?: number };
        donationToday += x.delivered ?? 0;
        nabiShareToday += (x.delivered ?? 0) - (x.streamerEarning ?? 0);
      }
      const broadcastMsThisMonth = broadcastDuration(
        monthBroadcasts.docs.map((d) => ({ startedAt: when(d.data().startedAt as Timestamp | null), endedAt: when(d.data().endedAt as Timestamp | null) })),
        nowDate,
      );
      const recordedMsThisMonth = (usage.data()?.usedMs as number | undefined) ?? 0;
      return { isTestAdmin: isTest(admin), broadcastsToday, liveNow, donationToday, nabiShareToday, pendingReports, pendingRefunds, pendingAppeals, recordedMsThisMonth, broadcastMsThisMonth };
    },

    /** 신고를 대상 사용자별로 보여준다(4-15). reportTargets 요약을 쪽 단위로 읽는다. */
    async reportGroups(admin: Viewer, input: { status: "pending" | "actioned" | "dismissed"; cursor?: string }) {
      const base = db().collection("reportTargets").where("status", "==", input.status);
      let q = (input.status === "pending" ? base.orderBy("pendingCount", "desc").orderBy("firstPendingAt", "asc") : base.orderBy("resolvedAt", "desc")).limit(REPORT_PAGE);
      if (input.cursor) {
        const c = await db().collection("reportTargets").doc(input.cursor).get();
        if (c.exists) q = q.startAfter(c);
      }
      const [snap, pending] = await Promise.all([q.get(), db().collection("reportTargets").where("status", "==", "pending").count().get()]);
      const docs = snap.docs.length ? await db().getAll(...snap.docs.map((d) => users().doc(d.id))) : [];
      const items = snap.docs.map((d, i) => {
        const t = d.data() as ReportTargetDoc;
        const u = docs[i]?.data() as FullUser | undefined;
        const masked = isTest(admin) && !inTestAdminScope(u?.seedKind); // 열 수 있어도 실제 사용자 이름은 가린다
        return {
          userId: d.id,
          nickname: masked ? MASKED_NICKNAME : (u?.nickname ?? "(탈퇴한 사용자)"),
          masked,
          pendingCount: t.pendingCount,
          totalCount: t.totalCount,
          latestReason: t.latestReason,
          firstPendingAt: iso(t.firstPendingAt),
          lastReportAt: iso(t.lastReportAt)!,
          status: t.status,
        };
      });
      return { items, next: snap.docs.length === REPORT_PAGE ? snap.docs[snap.docs.length - 1]!.id : null, counts: { pending: pending.data().count } };
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
          await notify(r.targetUserId, operatorAction(ended ? `운영정책 위반(${input.reason})으로 방송을 강제로 종료했어요` : await privateReplay(r.targetId, input.reason), r.targetId));
          await log(admin, { action: "방송 강제 종료", targetType: "broadcast", targetId: r.targetId, targetNickname: r.snapshot.title ?? "", targetSeed: r.targetSeed, reason: input.reason, before: ended ? "방송 중" : "방송 중 아님", after: "종료" });
        } else throw badRequest("INVALID", "사용자 신고는 숨길 콘텐츠가 없어요");
      } else {
        assertScope(admin, userScope || pending.some((d) => (d.data() as ReportDoc).broadcastOwnerSeed));
      }

      const status = input.action === "dismiss" ? "dismissed" : "actioned";
      const now = Timestamp.now();
      // 처리하는 사이에 들어온 신고를 지우지 않도록, 접수 신고를 다시 읽고 요약을 같은 트랜잭션에서 고친다.
      const done = await db().runTransaction(async (tx) => {
        const [fresh, agg] = await Promise.all([tx.get(db().collection("reports").where("targetUserId", "==", uid).where("status", "==", "pending")), tx.get(reportTargetRef(uid))]);
        fresh.docs.forEach((d) => {
          tx.update(d.ref, { status, processedBy: admin.uid, processReason: input.reason, processedAt: now });
          const r = d.data() as ReportDoc;
          writeNotification(tx, r.reporterId, reportResolved(REPORT_KIND[r.targetType], status === "actioned", d.id));
        });
        if (agg.exists) {
          const left = Math.max(0, (agg.data()!.pendingCount as number) - fresh.size);
          tx.update(agg.ref, left > 0 ? { pendingCount: left } : { pendingCount: 0, firstPendingAt: null, status, resolvedAt: now });
        }
        return fresh.size;
      });
      await log(admin, {
        action: input.action === "dismiss" ? "신고 기각" : "신고 조치",
        targetType: "user",
        targetId: uid,
        targetNickname: user.nickname,
        targetSeed: !!user.seedKind,
        reason: input.reason,
        before: `접수 ${done}건`,
        after: status === "dismissed" ? "기각" : "조치함",
      });
    },

    /** 회원 목록. 검색어가 있으면 filter는 무시한다. cursor는 마지막 줄의 문서 ID다. */
    async users(admin: Viewer, input: { q?: string; filter?: UserFilter; cursor?: string }) {
      // 테스트 운영자에게도 실제 사용자 줄은 빼지 않고 "심사용이 아닌 계정"으로 가려서 보여준다(4-15).
      const row = (id: string, d: FullUser, formerNickname?: string) => ({ ...toBrief(id, d, admin), createdAt: iso((d as { createdAt?: Timestamp }).createdAt ?? null), ...(formerNickname && { formerNickname }) });
      const byIds = async (ids: string[]) => {
        const docs = ids.length ? await db().getAll(...ids.map((id) => users().doc(id))) : [];
        return docs.filter((d) => d.exists);
      };
      const q = input.q?.trim();
      if (q) {
        const kind = userSearchKind(q);
        if (kind === "email") {
          const snap = await users().where("email", "==", q).limit(20).get();
          return { items: snap.docs.map((d) => row(d.id, d.data() as FullUser)), next: null };
        }
        if (kind === "id") {
          const d = await users().doc(q).get();
          if (d.exists) return { items: [row(d.id, d.data() as FullUser)], next: null };
        }
        // 닉네임 문서 ID(소문자 닉네임)의 앞부분 일치. 예전 닉네임(reserved)도 찾는다.
        const key = nicknameKey(q);
        const hits = await db().collection("nicknames").orderBy(FieldPath.documentId()).startAt(key).endAt(`${key}\uf8ff`).limit(20).get();
        const seen = new Map<string, string | undefined>();
        for (const h of hits.docs) {
          const x = h.data() as { uid: string; status: string };
          if (!seen.has(x.uid) || x.status === "active") seen.set(x.uid, x.status === "reserved" ? h.id : undefined);
        }
        const found = new Map((await byIds([...seen.keys()])).map((d) => [d.id, d]));
        return { items: [...seen].flatMap(([uid, former]) => (found.has(uid) ? [row(uid, found.get(uid)!.data() as FullUser, former)] : [])), next: null };
      }

      const PAGE = 50;
      if (input.filter === "sanctioned") {
        // shortcut: 종류별 100명까지만 보여주고 페이지 넘김은 없다. 제재 중인 사람이 수백 명이 되면 제재 문서 기준 페이지로 바꾼다.
        const now = Timestamp.now();
        const snaps = await Promise.all([
          users().where("suspended", "==", true).limit(100).get(),
          users().where("chatBannedUntil", ">", now).limit(100).get(),
          users().where("broadcastBannedUntil", ">", now).limit(100).get(),
        ]);
        const all = new Map(snaps.flatMap((s) => s.docs).map((d) => [d.id, d]));
        return { items: [...all.values()].map((d) => row(d.id, d.data() as FullUser)), next: null };
      }
      if (input.filter === "reported") {
        let rq = db().collection("reportTargets").orderBy("lastReportAt", "desc").limit(PAGE);
        if (input.cursor) rq = rq.startAfter(await db().collection("reportTargets").doc(input.cursor).get());
        const snap = await rq.get();
        const found = new Map((await byIds(snap.docs.map((d) => d.id))).map((d) => [d.id, d]));
        return { items: snap.docs.flatMap((d) => (found.has(d.id) ? [row(d.id, found.get(d.id)!.data() as FullUser)] : [])), next: snap.size === PAGE ? snap.docs[PAGE - 1]!.id : null };
      }
      // held는 문서 ID 순, test는 seedKind 순이다(색인을 더 만들지 않으려고). 최신순은 전체 목록만 지킨다.
      let uq: Query =
        input.filter === "held" ? users().where("settlementHold", "==", true) : input.filter === "test" ? users().where("seedKind", "!=", null).orderBy("seedKind") : users().orderBy("createdAt", "desc");
      if (input.cursor) uq = uq.startAfter(await users().doc(input.cursor).get());
      const snap = await uq.limit(PAGE).get();
      return { items: snap.docs.map((d) => row(d.id, d.data() as FullUser)), next: snap.size === PAGE ? snap.docs[PAGE - 1]!.id : null };
    },

    async userDetail(admin: Viewer, uid: string) {
      const user = await loadUser(uid);
      assertScope(admin, inTestAdminScope(user.seedKind));
      const [sanc, reports] = await Promise.all([
        sanctions().where("userId", "==", uid).orderBy("startAt", "desc").get(),
        db().collection("reports").where("targetUserId", "==", uid).count().get(),
      ]);
      const now = new Date();
      const [wallet, identity, account, received, same] = await Promise.all([
        db().collection("wallets").doc(uid).get(),
        db().collection("identityVerifications").doc(uid).get(),
        db().collection("payoutAccounts").doc(uid).get(),
        db().collection("donations").where("streamerId", "==", uid).aggregate({ count: AggregateField.count(), honey: AggregateField.sum("delivered") }).get(),
        db().collection("donations").where("streamerId", "==", uid).where("sameIdentity", "==", true).limit(20).get(),
      ]);
      const extra = {
        honeyBalance: (wallet.data()?.balance as number | undefined) ?? 0,
        receivedDonationCount: received.data().count,
        receivedHoney: received.data().honey ?? 0,
        hasPayoutAccount: account.exists,
        identityVerified: identity.exists,
        settlementHold: !!(user as { settlementHold?: boolean }).settlementHold,
        sameIdentityDonations: same.docs.map((d) => {
          const x = d.data();
          return { id: d.id, amount: (x.amount as number | undefined) ?? 0, broadcastTitle: (x.broadcastTitle as string | undefined) ?? "", createdAt: iso(x.createdAt as Timestamp)! };
        }),
      };
      return { user: toBrief(uid, user, admin), sanctions: sanc.docs.map((d) => toSanctionItem(d.id, d.data() as SanctionDoc, now)), reportCount: reports.data().count, extra };
    },

    /** 전체 제재 목록(O-6). 테스트 운영자에게는 실제 사용자 이름을 가린다(4-15). */
    async sanctionList(admin: Viewer) {
      const snap = await sanctions().orderBy("startAt", "desc").limit(200).get();
      const ids = [...new Set(snap.docs.map((d) => (d.data() as SanctionDoc).userId))];
      const docs = ids.length ? await db().getAll(...ids.map((id) => users().doc(id))) : [];
      const who = new Map(docs.map((u) => [u.id, u.data() as FullUser | undefined]));
      const now = new Date();
      return snap.docs.map((d) => {
        const s = d.data() as SanctionDoc;
        const u = who.get(s.userId);
        const masked = isTest(admin) && !inTestAdminScope(u?.seedKind);
        return { ...toSanctionItem(d.id, s, now), userId: s.userId, userNickname: masked ? MASKED_NICKNAME : (u?.nickname ?? "(탈퇴한 사용자)"), masked };
      });
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
