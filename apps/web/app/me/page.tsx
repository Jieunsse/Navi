"use client";
import { api } from "@nabi/shared";
import { accountApi, type MyDonation } from "@nabi/shared/account.ts";
import { honeyApi } from "@nabi/shared/honey.ts";
import { EmailAuthProvider, getRedirectResult, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, reauthenticateWithRedirect } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRequireLogin, useSession } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { auth } from "@/shared/lib/firebase";
import { Button, Center, Input, Notice, PasswordInput } from "@/shared/ui";

const REDIRECT_KEY = "nabi:withdraw";
const won = (n: number) => n.toLocaleString("ko-KR");
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "연결이 불안정해요. 다시 시도해 주세요");

export default function MePage() {
  const { me } = useRequireLogin();
  if (!me) return <Center><p className="text-muted">불러오는 중…</p></Center>;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 py-8">
      <h1 className="text-2xl font-bold">내 정보</h1>
      <NicknameSection />
      <HoneySection />
      <DonationSection />
      <WithdrawSection />
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
    if (!confirm("닉네임은 한 번만 바꿀 수 있어요")) return;
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
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-bold">닉네임</h2>
      <p className="text-sm">
        지금 닉네임: <b>{me?.nickname}</b>
      </p>
      <div className="flex gap-2">
        <Input aria-label="새 닉네임" placeholder={changed ? "이미 한 번 바꿨어요" : "새 닉네임"} disabled={changed} value={nickname} onChange={(e) => { setNickname(e.target.value); setChecked(null); setMsg(null); }} />
        <Button type="button" variant="secondary" className="shrink-0" disabled={changed || !nickname.trim()} loading={busy === "check"} onClick={check}>
          중복 확인
        </Button>
        <Button type="button" className="shrink-0" disabled={changed || checked === null || checked !== nickname.trim()} loading={busy === "save"} onClick={save}>
          변경
        </Button>
      </div>
      {msg && <span className={`text-xs ${msg.ok ? "text-accent" : "text-danger"}`}>{msg.text}</span>}
      {!changed && <span className="text-xs text-muted">닉네임은 한 번만 바꿀 수 있어요</span>}
    </section>
  );
}

function HoneySection() {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    void apiFetch(honeyApi.wallet).then((w) => setBalance(w.balance), () => undefined);
  }, []);
  return (
    <section className="flex items-center justify-between rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">내 꿀</span>
        <span className="text-2xl font-black text-accent">{balance === null ? "…" : won(balance)}</span>
      </div>
      <Link href="/me/honey" className="text-sm underline">
        충전하고 내역 보기
      </Link>
    </section>
  );
}

function DonationSection() {
  const [data, setData] = useState<{ items: MyDonation[]; total: number } | null>(null);
  useEffect(() => {
    void apiFetch(accountApi.myDonations).then(setData, () => undefined);
  }, []);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold">내 후원 내역</h2>
        {data && <span className="text-sm text-muted">합계 {won(data.total)}꿀</span>}
      </div>
      {data && data.items.length === 0 && <p className="text-sm text-muted">후원 내역이 없어요</p>}
      {data?.items.map((d) => (
        <div key={d.id} className="flex flex-col gap-1 rounded-lg border border-line px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">
              {d.broadcastTitle}
              {d.broadcastDeleted && <span className="text-xs text-muted"> (지운 방송)</span>}
            </span>
            <b className="shrink-0 text-accent">{won(d.amount)}꿀</b>
          </div>
          <span className="text-xs text-muted">
            {d.streamerNickname} · {d.kind === "mission" ? "미션" : "채팅"} · {formatTime(d.createdAt)}
            {d.anonymous && " · 익명으로 후원함"}
          </span>
          {d.message && <span className="text-xs">{d.message}</span>}
        </div>
      ))}
    </section>
  );
}

function WithdrawSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const usesPassword = !!auth.currentUser?.providerData.some((p) => p.providerId === "password");

  const fail = (e: unknown) => {
    const code = (e as { code?: string }).code ?? "";
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return; // 창을 닫으면 안내하지 않는다
    if (code.startsWith("auth/")) setError(usesPassword ? "비밀번호가 맞지 않아요" : "구글 로그인 확인에 실패했어요");
    else setError(errText(e));
  };

  // 서버는 방금 다시 확인한 로그인인지 본다(4-11).
  async function finish() {
    await auth.currentUser?.getIdToken(true);
    if (!confirm("정말 탈퇴할까요? 남은 꿀은 사라지고, 내 방송과 계정은 되살릴 수 없어요.")) return;
    await apiFetch(accountApi.withdraw);
    await auth.signOut();
    router.replace("/");
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
    <section className="flex flex-col gap-2 border-t border-line pt-6">
      <h2 className="flex items-center gap-1 text-base font-bold">
        회원 탈퇴
        <span title="방송을 끝내고 녹화가 끝난 뒤에 탈퇴할 수 있어요" aria-label="방송을 끝내고 녹화가 끝난 뒤에 탈퇴할 수 있어요" className="inline-flex size-5 cursor-help items-center justify-center rounded-full border border-line text-xs text-muted">
          ?
        </span>
      </h2>
      {!open ? (
        <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
          탈퇴하기
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Notice tone="warn">탈퇴하면 내 방송이 지워지고 남은 꿀이 사라져요. 채팅과 후원 기록에는 닉네임이 &quot;탈퇴한 사용자&quot;로 남아요.</Notice>
          {usesPassword ? (
            <PasswordInput aria-label="비밀번호" autoComplete="current-password" placeholder="비밀번호를 한 번 더 입력해 주세요" value={password} onChange={(e) => setPassword(e.target.value)} />
          ) : (
            <p className="text-sm text-muted">구글 로그인 창으로 한 번 더 확인해요.</p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
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
