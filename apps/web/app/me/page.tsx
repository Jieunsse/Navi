"use client";
import { api } from "@nabi/shared";
import { accountApi, type MyDonation } from "@nabi/shared/account.ts";
import { GRADE_LABEL, gradeApi } from "@nabi/shared/grade.ts";
import { honeyApi } from "@nabi/shared/honey.ts";
import { EmailAuthProvider, getRedirectResult, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, reauthenticateWithRedirect } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useRequireLogin, useSession } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { auth } from "@/shared/lib/firebase";
import { Button, buttonCls, EmptyState, HelpTip, Input, Notice, PasswordInput, Spinner, StatCard, Tabs } from "@/shared/ui";

const REDIRECT_KEY = "nabi:withdraw";
const won = (n: number) => n.toLocaleString("ko-KR");
const errText = (e: unknown) => (e instanceof ApiError ? e.message : "연결이 불안정해요. 다시 시도해 주세요");

export default function MePage() {
  const { me } = useRequireLogin();
  const [tab, setTab] = useState<"donations" | "account">("donations");
  const [balance, setBalance] = useState<number | null>(null);
  const [grade, setGrade] = useState<{ label: string; share: number } | null>(null);
  useEffect(() => {
    if (!me) return;
    void apiFetch(honeyApi.wallet).then((w) => setBalance(w.balance), () => undefined);
    void apiFetch(gradeApi.myGrade).then((g) => setGrade({ label: GRADE_LABEL[g.grade], share: g.sharePercent }), () => undefined);
  }, [me]);
  if (!me) return <div className="grid flex-1 place-items-center"><Spinner /></div>;
  return (
    <div className="flex w-full flex-col gap-8 px-4 py-6 md:p-8">
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
          <StatCard label="쓸 수 있는 꿀" value={balance === null ? "…" : `${won(balance)}꿀`} />
        </Link>
      </div>
      <Tabs label="내 정보" value={tab} onChange={setTab} items={[{ value: "donations", label: "내 후원 내역" }, { value: "account", label: "계정" }]} />
      {tab === "donations" ? (
        <DonationSection />
      ) : (
        <div className="flex flex-col gap-8">
          <NicknameSection />
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
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 md:p-8">
      <h2 className="text-heading-16">닉네임 변경</h2>
      <div className="flex flex-col gap-2 md:flex-row">
        <Input aria-label="새 닉네임" placeholder={changed ? "이미 한 번 바꿨어요" : "새 닉네임"} disabled={changed} value={nickname} onChange={(e) => { setNickname(e.target.value); setChecked(null); setMsg(null); }} />
        <Button type="button" variant="secondary" className="shrink-0" disabled={changed || !nickname.trim()} loading={busy === "check"} onClick={check}>
          중복 확인
        </Button>
        <Button type="button" variant="primary" className="shrink-0" disabled={changed || checked === null || checked !== nickname.trim()} loading={busy === "save"} onClick={save}>
          변경
        </Button>
      </div>
      {msg && <span className={`text-caption-12 ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
      {!changed && <span className="text-caption-12 text-subtle">닉네임은 한 번만 바꿀 수 있어요</span>}
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
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-4 md:p-8">
      <h2 className="flex items-center gap-1 text-heading-16">
        회원 탈퇴
        <HelpTip text="방송을 끝내고 녹화가 끝난 뒤에 탈퇴할 수 있어요" />
      </h2>
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
