import { MASKED_NICKNAME, TEST_ADMIN_SCOPE_MESSAGE } from "@nabi/shared/moderation.ts";
import type { AdminBroadcast, AdminCharge, JobRun } from "@nabi/shared/adminOps.ts";
import type { Timestamp } from "firebase-admin/firestore";
import { db, iso } from "../adapters/firebase.ts";
import { isStaleCancel } from "../domain/refund.ts";
import { operatorAction } from "../domain/notification.ts";
import { conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";
import { writeAdminLog } from "./moderation.ts";
import { notify } from "./notification.ts";
import { recordingRef } from "./recording.ts";

type Who = { nickname?: string; seedKind?: string | null };
const isTest = (v: Viewer) => !!v.user.isTestAdmin;

/** 사용자 ID들의 닉네임과 시드 여부. 테스트 운영자는 시드 계정만 보고 조치한다(결정 23, 25). */
async function whoMap(ids: string[]) {
  const uniq = [...new Set(ids)];
  const docs = uniq.length ? await db().getAll(...uniq.map((id) => db().collection("users").doc(id))) : [];
  return new Map(docs.map((d) => [d.id, (d.data() ?? {}) as Who]));
}

/**
 * 운영자 부가 화면(4-15): 충전·결제 내역, 예약 작업 기록, 방송 관리.
 * reconcileCancel은 honey 유스케이스의 것을, endBroadcast는 방송 종료 함수를 그대로 받는다.
 */
export function adminOpsUseCases(endBroadcast: (id: string) => Promise<boolean>, reconcileCancel: (chargeId: string) => Promise<"canceled" | "reverted" | "canceling">) {
  return {
    async charges(admin: Viewer): Promise<AdminCharge[]> {
      // 5분 넘게 "취소 중"에 멈춘 건은 열 때 조회로 먼저 정리한다(4-8, 결정 26). 결과를 못 알아내면 그대로 둔다.
      const stale = await db().collection("charges").where("status", "==", "canceling").limit(50).get();
      const now0 = Date.now();
      await Promise.all(
        stale.docs
          .filter((d) => isStaleCancel((d.data().cancelRequestedAt as Timestamp | null | undefined)?.toMillis() ?? null, now0))
          .map((d) => reconcileCancel(d.id).catch(() => undefined)),
      );
      const snap = await db().collection("charges").orderBy("createdAt", "desc").limit(200).get();
      const who = await whoMap(snap.docs.map((d) => d.data().userId as string));
      const now = Date.now();
      return snap.docs
        .map((d) => {
          const c = d.data();
          const req = (c.cancelRequestedAt as Timestamp | null | undefined) ?? null;
          const masked = isTest(admin) && !who.get(c.userId as string)?.seedKind; // 실제 사용자는 줄을 빼지 않고 가린다(4-15)
          return {
            id: d.id,
            masked,
            userNickname: masked ? MASKED_NICKNAME : (who.get(c.userId as string)?.nickname ?? "(탈퇴한 사용자)"),
            honey: c.honey as number,
            amount: c.amount as number,
            status: c.status as AdminCharge["status"],
            paymentKey: masked ? null : ((c.paymentKey as string | null | undefined) ?? null),
            createdAt: iso(c.createdAt as Timestamp)!,
            cancelRequestedAt: iso(req),
            stuck: c.status === "canceling" && isStaleCancel(req?.toMillis() ?? null, now),
          };
        });
    },

    /** 멈춘 "취소 중" 충전을 토스 조회로 정리한다. */
    async reconcileCharge(admin: Viewer, chargeId: string) {
      const c = (await db().collection("charges").doc(chargeId).get()).data();
      if (!c) throw notFound("충전 내역을 찾을 수 없어요");
      const owner = (await db().collection("users").doc(c.userId as string).get()).data() as Who | undefined;
      if (isTest(admin) && !owner?.seedKind) throw forbidden(TEST_ADMIN_SCOPE_MESSAGE);
      if (c.status !== "canceling") throw conflict("NOT_CANCELING", "취소 중인 충전이 아니에요");
      const status = await reconcileCancel(chargeId);
      await writeAdminLog(admin, { action: "충전 취소 정리", targetType: "charge", targetId: chargeId, targetNickname: owner?.nickname ?? "", targetSeed: !!owner?.seedKind, reason: "", before: "취소 중", after: status });
      return { status };
    },

    async jobs(): Promise<JobRun[]> {
      const snap = await db().collection("jobRuns").orderBy("startedAt", "desc").limit(100).get();
      return snap.docs.map((d) => {
        const j = d.data();
        return {
          id: d.id,
          jobName: j.jobName as string,
          mode: j.mode as string,
          adminNickname: (j.adminNickname as string | null | undefined) ?? null,
          startedAt: iso(j.startedAt as Timestamp)!,
          endedAt: iso(j.endedAt as Timestamp | null),
          streamerCount: (j.streamerCount as number | undefined) ?? 0,
          result: (j.result as string | undefined) ?? "",
        };
      });
    },

    async broadcasts(admin: Viewer): Promise<AdminBroadcast[]> {
      const snap = await db().collection("broadcasts").orderBy("createdAt", "desc").limit(100).get();
      const who = await whoMap(snap.docs.map((d) => d.data().ownerId as string));
      const recIds = [...new Set(snap.docs.filter((d) => d.data().status === "ended" && d.data().recordingId).map((d) => d.data().recordingId as string))];
      const recs = recIds.length ? await db().getAll(...recIds.map((id) => recordingRef(id))) : [];
      const isPublic = new Map(recs.map((r) => [r.id, r.exists ? !!r.data()?.isPublic : null]));
      return snap.docs
        .map((d) => {
          const b = d.data();
          const masked = isTest(admin) && !who.get(b.ownerId as string)?.seedKind; // 실제 사용자는 줄을 빼지 않고 가린다(4-15)
          return {
            id: d.id,
            masked,
            title: b.title as string,
            ownerNickname: masked ? MASKED_NICKNAME : (b.ownerNickname as string),
            status: b.status as AdminBroadcast["status"],
            replayPublic: b.status === "ended" && b.recordingId ? (isPublic.get(b.recordingId as string) ?? null) : null,
            createdAt: iso(b.createdAt as Timestamp)!,
            startedAt: iso(b.startedAt as Timestamp | null | undefined),
            endedAt: iso(b.endedAt as Timestamp | null | undefined),
          };
        });
    },

    /** 강제 종료는 기존 방송 종료 함수를 그대로 쓴다(07 3장). */
    async forceEnd(admin: Viewer, id: string, reason: string) {
      const b = (await db().collection("broadcasts").doc(id).get()).data();
      if (!b) throw notFound("방송을 찾을 수 없어요");
      const owner = (await db().collection("users").doc(b.ownerId as string).get()).data() as Who | undefined;
      if (isTest(admin) && !owner?.seedKind) throw forbidden(TEST_ADMIN_SCOPE_MESSAGE);
      if (b.status !== "live") throw conflict("NOT_LIVE", "방송 중인 방송만 강제로 끝낼 수 있어요");
      const ended = await endBroadcast(id);
      if (ended) await notify(b.ownerId as string, operatorAction(`운영정책 위반(${reason})으로 방송을 강제로 종료했어요`, id));
      await writeAdminLog(admin, { action: "방송 강제 종료", targetType: "broadcast", targetId: id, targetNickname: b.title as string, targetSeed: !!owner?.seedKind, reason, before: "방송 중", after: "종료" });
    },

    /** 종료된 방송의 다시보기를 비공개로 바꾸고 방송자에게 알린다(4-15, 결정 29). */
    async privateReplay(admin: Viewer, id: string, reason: string) {
      const b = (await db().collection("broadcasts").doc(id).get()).data();
      if (!b) throw notFound("방송을 찾을 수 없어요");
      const owner = (await db().collection("users").doc(b.ownerId as string).get()).data() as Who | undefined;
      if (isTest(admin) && !owner?.seedKind) throw forbidden(TEST_ADMIN_SCOPE_MESSAGE);
      if (b.status !== "ended") throw conflict("NOT_ENDED", "종료된 방송만 다시보기를 비공개로 바꿀 수 있어요");
      const recId = b.recordingId as string | null | undefined;
      const rec = recId ? await recordingRef(recId).get() : null;
      if (!recId || !rec?.exists) throw notFound("다시보기가 없어요");
      if (!rec.data()?.isPublic) throw conflict("ALREADY_PRIVATE", "이미 비공개인 다시보기예요");
      await recordingRef(recId).update({ isPublic: false });
      await notify(b.ownerId as string, operatorAction(`운영정책 위반(${reason})으로 다시보기를 비공개로 바꿨어요`, id));
      await writeAdminLog(admin, { action: "다시보기 비공개", targetType: "broadcast", targetId: id, targetNickname: b.title as string, targetSeed: !!owner?.seedKind, reason, before: "공개", after: "비공개" });
    },
  };
}
