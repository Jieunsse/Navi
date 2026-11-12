import { APPEAL_STATUS_LABEL, type AdminAppeal, type resolveAppealSchema } from "@nabi/shared/adminOps.ts";
import { SANCTION_LABEL, TEST_ADMIN_SCOPE_MESSAGE } from "@nabi/shared/moderation.ts";
import type { z } from "zod";
import { db, iso, Timestamp } from "../adapters/firebase.ts";
import { appealRefusal } from "../domain/appeal.ts";
import { effectiveStatus } from "../domain/moderation.ts";
import { appealResolved } from "../domain/notification.ts";
import { badRequest, conflict, forbidden, notFound } from "../errors.ts";
import type { Viewer } from "./auth.ts";
import { writeNotification } from "./notification.ts";
import { syncSanctionSummary, writeAdminLog, type SanctionDoc } from "./moderation.ts";

type AppealDoc = {
  userId: string;
  userNickname: string;
  userSeed: boolean;
  sanctionKind: SanctionDoc["kind"];
  sanctionReason: string;
  content: string;
  status: "pending" | "accepted" | "rejected";
  answer: string | null;
  adminId: string | null;
  createdAt: Timestamp;
  processedAt: Timestamp | null;
};

const appeals = () => db().collection("appeals");
const sanctions = () => db().collection("sanctions");

export const appealUseCases = {
  /** 이의 제기. 문서 ID를 제재 ID로 써서 한 제재에 한 번만 받는다(4-15). */
  async create(viewer: Viewer, sanctionId: string, content: string) {
    const snap = await sanctions().doc(sanctionId).get();
    const s = snap.data() as SanctionDoc | undefined;
    if (!s || s.userId !== viewer.uid) throw notFound("제재를 찾을 수 없어요");
    const refusal = appealRefusal({ kind: s.kind, status: effectiveStatus({ kind: s.kind, status: s.status, endAt: s.endAt?.toDate() ?? null }, new Date()) });
    if (refusal) throw conflict("APPEAL_NOT_ALLOWED", refusal);
    const doc: AppealDoc = {
      userId: viewer.uid,
      userNickname: viewer.user.nickname,
      userSeed: !!viewer.user.seedKind,
      sanctionKind: s.kind,
      sanctionReason: s.reason,
      content,
      status: "pending",
      answer: null,
      adminId: null,
      createdAt: Timestamp.now(),
      processedAt: null,
    };
    try {
      await appeals().doc(sanctionId).create(doc);
    } catch (e) {
      if ((e as { code?: number }).code === 6) throw conflict("ALREADY_APPEALED", "이미 이의를 제기했어요");
      throw e;
    }
  },

  /** 처리할 것이 앞에 오게 한다. 테스트 운영자는 시드 계정 것만 본다(결정 25). */
  async adminList(admin: Viewer): Promise<AdminAppeal[]> {
    const snap = await appeals().orderBy("createdAt", "desc").limit(200).get();
    const rows = snap.docs.map((d) => ({ id: d.id, a: d.data() as AppealDoc })).filter((x) => !admin.user.isTestAdmin || x.a.userSeed);
    rows.sort((x, y) => Number(y.a.status === "pending") - Number(x.a.status === "pending"));
    return rows.map(({ id, a }) => ({
      id,
      userNickname: a.userNickname,
      masked: false,
      sanctionKind: a.sanctionKind,
      sanctionReason: a.sanctionReason,
      content: a.content,
      status: a.status,
      answer: a.answer,
      createdAt: iso(a.createdAt)!,
    }));
  },

  /** 받아들이면 제재를 "이의로 취소"로 바꿔 효과를 바로 푼다. 거절하면 답변만 남긴다(4-15). */
  async resolve(admin: Viewer, id: string, input: z.output<typeof resolveAppealSchema>) {
    if (!input.accept && !input.answer) throw badRequest("ANSWER_REQUIRED", "거절할 때는 답변을 적어 주세요");
    const aref = appeals().doc(id);
    const sref = sanctions().doc(id);
    const out = await db().runTransaction(async (tx) => {
      const [as, ss] = await Promise.all([tx.get(aref), tx.get(sref)]);
      const a = as.data() as AppealDoc | undefined;
      if (!a) throw notFound("이의 제기를 찾을 수 없어요");
      if (admin.user.isTestAdmin && !a.userSeed) throw forbidden(TEST_ADMIN_SCOPE_MESSAGE);
      if (a.status !== "pending") throw conflict("ALREADY_RESOLVED", "이미 처리한 이의 제기예요");
      const s = ss.data() as SanctionDoc | undefined;
      const cancel = input.accept && s?.status === "active";
      tx.update(aref, { status: input.accept ? "accepted" : "rejected", answer: input.answer || null, adminId: admin.uid, processedAt: Timestamp.now() });
      if (cancel) tx.update(sref, { status: "appealCanceled", revokeReason: "이의 제기를 받아들였어요" });
      writeNotification(tx, a.userId, appealResolved(input.accept, id)); // 처리 결과 알림(4-17)
      return { a, cancel };
    });
    if (out.cancel) await syncSanctionSummary(out.a.userId);
    await writeAdminLog(admin, {
      action: `이의 제기 ${input.accept ? "받아들임" : "거절"}: ${SANCTION_LABEL[out.a.sanctionKind]}`,
      targetType: "user",
      targetId: out.a.userId,
      targetNickname: out.a.userNickname,
      targetSeed: out.a.userSeed,
      reason: input.answer,
      before: APPEAL_STATUS_LABEL.pending,
      after: out.cancel ? "제재 이의로 취소" : input.accept ? "받아들임(이미 풀린 제재)" : "거절",
    });
  },
};
