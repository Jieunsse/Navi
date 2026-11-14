"use client";
import { api } from "@nabi/shared";
import { accountApi, type MyDonation, type WithdrawPreview } from "@nabi/shared/account.ts";
import { GRADE_LABEL, gradeApi } from "@nabi/shared/grade.ts";
import { honeyApi, REFUND_MIN, type Wallet } from "@nabi/shared/honey.ts";
import { EmailAuthProvider, getRedirectResult, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, reauthenticateWithRedirect, sendPasswordResetEmail } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRequireLogin, useSession } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { auth } from "@/shared/lib/firebase";
import { IdentityForm } from "@/features/donation/IdentityForm";
import { Button, buttonCls, ConsentItem, Dialog, EmptyState, HelpTip, Input, Notice, PasswordInput, Spinner, StatCard, Tabs } from "@/shared/ui";

const REDIRECT_KEY = "nabi:withdraw";
const won = (n: number) => n.toLocaleString("ko-KR");
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "연결이 불안정해요. 다시 시도해 주세요");

export default function MePage() {
  const { me } = useRequireLogin();
  const [tab, setTab] = useState<"donations" | "account">("donations");
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [grade, setGrade] = useState<{ label: string; share: number } | null>(null);
  useEffect(() => {
    if (!me) return;
    void apiFetch(honeyApi.wallet).then(setWallet, () => undefined);
    void apiFetch(gradeApi.myGrade).then((g) => setGrade({ label: GRADE_LABEL[g.grade], share: g.sharePercent }), () => undefined);
  }, [me]);
  if (!me) return <div className="grid flex-1 place-items-center"><Spinner /></div>;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-heading-28">내 정보</h1>
        <Link href="/me/grade" className={buttonCls({ variant: "secondary" })}>
          내 등급 보기
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="닉네임" value={me.nickname} />
        <StatCard label="등급" value={grade ? `${grade.label} · 후원 배분 ${grade.share}%` : "…"} />
        <Link href="/me/honey" className="contents">
          <StatCard label="쓸 수 있는 꿀" value={wallet === null ? "…" : `${won(wallet.balance)}꿀`} />
        </Link>
      </div>
      <Tabs label="내 정보" value={tab} onChange={setTab} items={[{ value: "donations", label: "내 후원 내역" }, { value: "account", label: "계정" }]} />
      {tab === "donations" ? (
        <DonationSection />
      ) : (
        <div className="flex flex-col gap-8">
          <NicknameSection />
          <IdentitySection wallet={wallet} reload={() => apiFetch(honeyApi.wallet).then(setWallet, () => undefined)} />
          <PasswordSection />
          <WithdrawSection />
        </div>
      )}
    </div>
  );
}

function NicknameSection() {
  const { me, refresh } = useSession();
  const [changed, setChanged] = useState(true); // 확인하기 전에는 막아 둔다
  const [nickname, setNickname] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void apiFetch(accountApi.profile).then((p) => setChanged(p.nicknameChanged), () => undefined);
  }, [me?.nickname]);

  async function check() {
    setBusy("check");
    try {
      await apiFetch(api.checkNickname, { nickname });
      setChecked(nickname.trim());
      setMsg({ ok: true, text: "쓸 수 있는 닉네임이에요" });
    } catch (e) {
      setChecked(null);
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setAsking(false);
    setBusy("save");
    try {
      await apiFetch(accountApi.changeNickname, { nickname });
      await refresh();
      setNickname("");
      setChecked(null);
      setMsg({ ok: true, text: "닉네임을 바꿨어요" });
    } catch (e) {
      setChecked(null);
      setMsg({ ok: false, text: errText(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 md:p-8">
      <h2 className="text-heading-16">닉네임 변경</h2>
      <div className="flex flex-col gap-2 md:flex-row">
        <Input aria-label="새 닉네임" placeholder={changed ? "이미 한 번 바꿨어요" : "새 닉네임"} disabled={changed} value={nickname} onChange={(e) => { setNickname(e.target.value); setChecked(null); setMsg(null); }} />
        <Button type="button" variant="secondary" className="shrink-0" disabled={changed || !nickname.trim()} loading={busy === "check"} onClick={check}>
          중복 확인
        </Button>
        <Button type="button" variant="primary" className="shrink-0" disabled={changed || checked === null || checked !== nickname.trim()} loading={busy === "save"} onClick={() => setAsking(true)}>
          변경
        </Button>
      </div>
      {msg && <span className={`text-caption-12 ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
      {!changed && <span className="text-caption-12 text-subtle">닉네임은 한 번만 바꿀 수 있어요</span>}
      {asking && <Dialog title="닉네임을 바꿀까요?" description="한 번 바꾸면 다시 바꿀 수 없어요" confirmLabel="변경" onConfirm={() => void save()} onClose={() => setAsking(false)} />}
    </section>
  );
}

/** 본인인증(4-11). 목업이라 실제로 확인하지 않는다. */
function IdentitySection({ wallet, reload }: { wallet: Wallet | null; reload: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 md:p-8">
      <h2 className="text-heading-16">본인인증</h2>
      {!wallet ? (
        <Spinner />
      ) : wallet.verified ? (
        <p className="text-body-16">본인인증 완료(테스트) · {wallet.identityName}</p>
      ) : open ? (
        <IdentityForm onDone={async () => { setOpen(false); await reload(); }} />
      ) : (
        <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
          본인인증하기
        </Button>
      )}
    </section>
  );
}

/** 비밀번호 변경(4-11). 비밀번호 찾기와 같은 메일을 보낸다. 구글로만 가입한 사람에게는 보여주지 않는다. */
function PasswordSection() {
  const { me } = useSession();
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  if (!auth.currentUser?.providerData.some((p) => p.providerId === "password") || !me?.email) return null;
  const email = me.email;
  async function send() {
    setState("busy");
    setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      setState("sent");
    } catch {
      setError("연결이 불안정해요. 다시 시도해 주세요");
      setState("idle");
    }
  }
  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 md:p-8">
      <h2 className="text-heading-16">비밀번호 변경</h2>
      {state === "sent" ? (
        <p className="text-body-16 text-muted">{email}로 비밀번호를 다시 정하는 링크를 보냈어요. 메일이 오지 않으면 스팸함을 확인해 주세요.</p>
      ) : (
        <Button variant="secondary" className="self-start" loading={state === "busy"} onClick={send}>
          비밀번호 변경 메일 보내기
        </Button>
      )}
      {error && <p className="text-caption-12 text-danger">{error}</p>}
    </section>
  );
}

function DonationSection() {
  const [data, setData] = useState<{ items: MyDonation[]; total: number } | null>(null);
  useEffect(() => {
    void apiFetch(accountApi.myDonations).then(setData, () => undefined);
  }, []);
  if (!data) return <Spinner />;
  return (
    <section className="flex flex-col gap-4">
      {data.items.length === 0 && <EmptyState title="후원 내역이 없어요" />}
      <ul className="flex flex-col gap-2">
        {data.items.map((d) => (
          <li key={d.id} className="flex flex-col gap-1 rounded-lg bg-surface p-4">
            <p className="text-heading-16">
              {won(d.amount)}꿀 · {d.kind === "mission" ? "미션 후원" : "채팅 후원"}
              {d.anonymous && " · 익명으로 후원함"}
            </p>
            <p className="text-caption-12 text-subtle">
              {formatTime(d.createdAt)} · {d.broadcastDeleted ? "지운 방송" : d.broadcastTitle} · {d.streamerNickname}
              {d.message && ` · "${d.message}"`}
            </p>
          </li>
        ))}
      </ul>
      {data.items.length > 0 && <p className="text-caption-12 text-subtle">합계 {won(data.total)}꿀</p>}
    </section>
  );
}

function WithdrawSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<WithdrawPreview | null>(null);
  const [giveUpHoney, setGiveUpHoney] = useState(false);
  const [giveUpEarnings, setGiveUpEarnings] = useState(false);
  const usesPassword = !!auth.currentUser?.providerData.some((p) => p.providerId === "password");

  const fail = (e: unknown) => {
    const code = (e as { code?: string }).code ?? "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return; // 창을 닫으면 안내하지 않는다
    if (code.startsWith("auth/")) setError(usesPassword ? "비밀번호가 맞지 않아요" : "구글 로그인 확인에 실패했어요");
    else setError(errText(e));
  };

  async function submit(agree: { abandonHoney: boolean; abandonEarnings: boolean }) {
    await apiFetch(accountApi.withdraw, agree);
    await auth.signOut();
    router.replace("/");
  }

  // 서버는 방금 다시 확인한 로그인인지 본다(4-11). 남은 꿀이나 수익 배분금이 있으면 확인 창을 먼저 띄운다.
  async function finish() {
    await auth.currentUser?.getIdToken(true);
    const p = await apiFetch(accountApi.withdrawPreview);
    if (p.honey.balance > 0 || p.earnings.amount > 0) {
      setGiveUpHoney(false);
      setGiveUpEarnings(false);
      setPreview(p);
      return;
    }
    if (!confirm("정말 탈퇴할까요? 내 방송과 계정은 되살릴 수 없어요.")) return;
    await submit({ abandonHoney: false, abandonEarnings: false });
  }

  async function confirmGiveUp() {
    setBusy(true);
    setError("");
    try {
      await submit({ abandonHoney: giveUpHoney, abandonEarnings: giveUpEarnings });
    } catch (e) {
      setPreview(null);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  // 팝업이 막혀 구글 페이지로 이동했다가 돌아왔으면 이어서 탈퇴한다.
  useEffect(() => {
    if (sessionStorage.getItem(REDIRECT_KEY)) {
      sessionStorage.removeItem(REDIRECT_KEY);
      getRedirectResult(auth)
        .then((r) => r && finish())
        .catch((e) => {
          setOpen(true);
          fail(e);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    const u = auth.currentUser;
    if (!u) return;
    setError("");
    setBusy(true);
    try {
      if (usesPassword) await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email!, password));
      else {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(u, provider).catch((e) => {
          if ((e as { code?: string }).code !== "auth/popup-blocked") throw e;
          sessionStorage.setItem(REDIRECT_KEY, "1");
          return reauthenticateWithRedirect(u, provider);
        });
      }
      await finish();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 md:p-8">
      <h2 className="flex items-center gap-1 text-heading-16">
        회원 탈퇴
        <HelpTip text="방송을 끝내고 녹화가 끝난 뒤에 탈퇴할 수 있어요" />
      </h2>
      {preview && (
        <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center bg-scrim p-4" onClick={() => setPreview(null)}>
          <div role="alertdialog" aria-modal aria-label="탈퇴 전에 확인해 주세요" onClick={(e) => e.stopPropagation()} className="flex max-h-[90dvh] w-full max-w-[400px] flex-col gap-4 overflow-y-auto rounded-lg bg-raised p-6 shadow-overlay">
            <h2 className="text-heading-20">탈퇴 전에 확인해 주세요</h2>
            {preview.honey.balance > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-body-16 text-muted">
                  {preview.honey.refundable >= REFUND_MIN
                    ? `남은 꿀 ${won(preview.honey.refundable)}은 환급 신청으로 ${won(preview.honey.payout)}원을 돌려받을 수 있어요. 취소할 수 있는 충전은 충전 취소로 전액 돌려받을 수 있어요`
                    : `남은 꿀 ${won(preview.honey.balance)}이 있어요. 취소할 수 있는 충전은 충전 취소로 전액 돌려받을 수 있어요`}
                </p>
                <Link href="/me/honey" className={buttonCls({ variant: "secondary", className: "self-start" })}>
                  환급 신청
                </Link>
                <ConsentItem checked={giveUpHoney} onChange={setGiveUpHoney} label="남은 꿀을 포기하고 탈퇴합니다" />
              </div>
            )}
            {preview.earnings.amount > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-body-16 text-muted">
                  아직 받지 못한 수익 배분금 {won(preview.earnings.amount)}원이 있어요. 다음 지급일은 {new Date(preview.earnings.payoutDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}이에요. 탈퇴를 그만두고 지급일 뒤에 다시 탈퇴하거나, 포기하고 바로 탈퇴할 수 있어요.
                </p>
                <ConsentItem checked={giveUpEarnings} onChange={setGiveUpEarnings} label="남은 수익 배분금을 포기하고 탈퇴합니다" />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>
                탈퇴 그만두기
              </Button>
              <Button variant="danger" loading={busy} disabled={(preview.honey.balance > 0 && !giveUpHoney) || (preview.earnings.amount > 0 && !giveUpEarnings)} onClick={confirmGiveUp}>
                탈퇴하기
              </Button>
            </div>
          </div>
        </div>
      )}
      {!open ? (
        <Button variant="danger" className="self-start" onClick={() => setOpen(true)}>
          탈퇴하기
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">탈퇴하면 내 방송이 지워지고 남은 꿀이 사라져요. 채팅과 후원 기록에는 닉네임이 &quot;탈퇴한 사용자&quot;로 남아요.</Notice>
          {usesPassword ? (
            <PasswordInput aria-label="비밀번호" autoComplete="current-password" placeholder="비밀번호를 한 번 더 입력해 주세요" value={password} onChange={(e) => setPassword(e.target.value)} />
          ) : (
            <p className="text-caption-12 text-subtle">구글 로그인 창으로 한 번 더 확인해요.</p>
          )}
          {error && <p className="text-caption-12 text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button variant="danger" loading={busy} disabled={usesPassword && !password} onClick={run}>
              탈퇴하기
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              그만두기
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
