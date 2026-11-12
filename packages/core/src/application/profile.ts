import { WITHDRAWN_NICKNAME, type MyDonation } from "@nabi/shared/account.ts";
import { adminAuth, db, iso, Timestamp } from "../adapters/firebase.ts";
import { isBlockingCharge, isRecentLogin } from "../domain/account.ts";
import { AppError, conflict, forbidden, unauthorized } from "../errors.ts";
import { assertNicknameAllowed, createUserDocs, nicknameKey } from "./account.ts";
import type { Viewer } from "./auth.ts";
import { recordings } from "../container.ts";

/** 구글 가입 마무리(4-1). 사용자 문서가 아직 없는 로그인 토큰이라 requireUser를 쓰지 않는다. */
export async function signupGoogle(authHeader: string | null, nickname: string) {
  const token = authHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw unauthorized();
  const decoded = await adminAuth().verifyIdToken(token).catch(() => { throw unauthorized(); });
  if ((await db().collection("users").doc(decoded.uid).get()).exists) throw conflict("ALREADY_SIGNED_UP", "이미 가입했어요");
  await createUserDocs(decoded.uid, nickname, decoded.email ?? null);
}

export async function myProfile(v: Viewer) {
  return { nicknameChanged: !!(v.user as { nicknameChanged?: boolean }).nicknameChanged };
}

const isSeed = (v: Viewer) => !!v.user.seedKind;

/** 닉네임 한 번 변경(4-11). 예전 닉네임은 붙잡아 둬서 다른 사람이 흉내 내지 못하게 한다. */
export async function changeNickname(v: Viewer, nickname: string) {
  if (isSeed(v)) throw forbidden("테스트 계정은 닉네임을 바꿀 수 없어요");
  assertNicknameAllowed(nickname);
  const fs = db();
  const userRef = fs.collection("users").doc(v.uid);
  const newRef = fs.collection("nicknames").doc(nicknameKey(nickname));
  await fs.runTransaction(async (tx) => {
    const user = (await tx.get(userRef)).data();
    if (user?.nicknameChanged) throw conflict("NICKNAME_ALREADY_CHANGED", "닉네임은 한 번만 바꿀 수 있어요");
    if ((await tx.get(newRef)).exists) throw conflict("NICKNAME_TAKEN", "이미 쓰고 있는 닉네임이에요");
    tx.create(newRef, { uid: v.uid, status: "active" });
    tx.update(fs.collection("nicknames").doc(nicknameKey(user!.nickname as string)), { status: "reserved" });
    tx.update(userRef, { nickname, nicknameChanged: true, nicknameChangedAt: Timestamp.now() });
  });
}

/** 내가 한 후원, 최근 순(4-11). */
export async function myDonations(v: Viewer): Promise<{ items: MyDonation[]; total: number }> {
  const snap = await db().collection("donations").where("donorId", "==", v.uid).orderBy("createdAt", "desc").get();
  const exists = new Map<string, boolean>();
  const items = await Promise.all(
    snap.docs.map(async (d): Promise<MyDonation> => {
      const x = d.data();
      const bid = x.broadcastId as string;
      if (!exists.has(bid)) exists.set(bid, (await db().collection("broadcasts").doc(bid).get()).exists);
      return {
        id: d.id,
        kind: x.kind === "mission" ? "mission" : "chat",
        broadcastId: bid,
        broadcastTitle: x.broadcastTitle as string,
        broadcastDeleted: !exists.get(bid),
        streamerNickname: x.streamerNickname as string,
        amount: x.amount as number,
        message: (x.messageHidden ? "" : (x.message as string | undefined)) ?? "",
        anonymous: !!x.anonymous,
        createdAt: iso(x.createdAt as Timestamp)!,
      };
    }),
  );
  return { items, total: items.reduce((s, i) => s + i.amount, 0) };
}

/**
 * 회원 탈퇴(4-11). 조건 확인 → 계정 정지 → 기록 정리 → 계정 삭제.
 * 기록 정리 중 실패하면 같은 요청을 다시 보내면 된다(바꾸고 지우는 일이라 결과가 같다).
 * 아직 없는 기능(제재, 녹화, 미션, 정산, 환급)에 걸린 조건은 넣지 않았다.
 */
export async function withdraw(v: Viewer) {
  const fs = db();
  const uid = v.uid;
  if (isSeed(v)) throw forbidden("테스트 계정은 탈퇴할 수 없어요");
  if (!isRecentLogin(v.authTime, Date.now())) throw new AppError(401, "REAUTH_REQUIRED", "비밀번호를 한 번 더 확인해 주세요");

  const [live, pending] = await Promise.all([
    fs.collection("broadcasts").where("ownerId", "==", uid).where("status", "==", "live").limit(1).get(),
    fs.collection("charges").where("userId", "==", uid).where("status", "==", "pending").get(),
  ]);
  if (!live.empty) throw conflict("WITHDRAW_BLOCKED", "방송을 끝낸 뒤에 탈퇴할 수 있어요");
  if (pending.docs.some((d) => isBlockingCharge({ status: "pending", createdAtMs: (d.data().createdAt as Timestamp).toMillis() }, Date.now())))
    throw conflict("WITHDRAW_BLOCKED", "결제를 처리하는 중이라 잠시 뒤에 탈퇴할 수 있어요");

  // 녹화 파일을 먼저 지운다. 처리 중인 녹화가 있으면 여기서 거절된다(4-9).
  for (const r of (await fs.collection("recordings").where("ownerId", "==", uid).get()).docs) await recordings().removeForBroadcast(r.id);

  // 정지: 새 채팅, 후원, 방송이 들어오지 않게 한다.
  await adminAuth().updateUser(uid, { disabled: true });
  await adminAuth().revokeRefreshTokens(uid);

  const w = fs.bulkWriter();
  const gone = { authorNickname: WITHDRAWN_NICKNAME };
  for (const d of (await fs.collectionGroup("comments").where("authorId", "==", uid).get()).docs) void w.update(d.ref, gone);
  for (const d of (await fs.collection("donations").where("donorId", "==", uid).get()).docs) void w.update(d.ref, { donorNickname: WITHDRAWN_NICKNAME });
  for (const d of (await fs.collection("donations").where("streamerId", "==", uid).get()).docs) void w.update(d.ref, { streamerNickname: WITHDRAWN_NICKNAME });
  await w.close();

  for (const b of (await fs.collection("broadcasts").where("ownerId", "==", uid).get()).docs) await fs.recursiveDelete(b.ref);

  // 남은 꿀은 사라진다(13장). 꿀 내역에 포기로 남긴다.
  const wallet = await fs.collection("wallets").doc(uid).get();
  const balance = (wallet.data()?.balance as number | undefined) ?? 0;
  if (balance > 0) await fs.collection("honeyLedger").add({ userId: uid, type: "withdrawAbandon", amount: -balance, createdAt: Timestamp.now() });
  await Promise.all([wallet.ref.delete(), fs.collection("identityVerifications").doc(uid).delete(), fs.collection("payoutAccounts").doc(uid).delete()]);

  // 닉네임 문서(붙잡아 둔 옛 닉네임 포함)를 지우고, 사용자 문서는 마지막에 지운다.
  for (const d of (await fs.collection("nicknames").where("uid", "==", uid).get()).docs) await d.ref.delete();
  await fs.recursiveDelete(fs.collection("users").doc(uid));

  await adminAuth().deleteUser(uid);
}
