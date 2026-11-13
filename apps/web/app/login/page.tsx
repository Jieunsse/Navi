"use client";
import { api } from "@nabi/shared";
import { getRedirectResult, signInWithCustomToken, signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useSession } from "@/entities/session/session";
import { GOOGLE_FAIL, signInWithGoogle } from "@/features/auth/google";
import { useNextPath } from "@/features/auth/next";
import { SuspendedNotice } from "@/features/moderation/SuspendedNotice";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { auth } from "@/shared/lib/firebase";
import { AuthCard, Button, buttonCls, Field, GoogleIcon, Input, PasswordInput, RadioIcon, UserIcon } from "@/shared/ui";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function loginError(e: unknown) {
  const code = (e as { code?: string }).code ?? "";
  if (code === "auth/too-many-requests") return "잠시 뒤에 다시 시도해 주세요";
  if (code === "auth/network-request-failed") return "연결이 불안정해요. 다시 시도해 주세요";
  if (e instanceof ApiError) return e.message;
  return "이메일 또는 비밀번호가 맞지 않아요";
}

function Login() {
  const router = useRouter();
  const next = useNextPath();
  const { me, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [googleError, setGoogleError] = useState("");
  const [suspended, setSuspended] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (me) router.replace(next);
  }, [me, next, router]);

  // 팝업이 막혀 페이지를 이동했다가 돌아온 경우 결과를 받는다.
  useEffect(() => {
    getRedirectResult(auth).catch(() => setGoogleError(GOOGLE_FAIL));
  }, []);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    setGoogleError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      // 영구 정지 계정(4-15)
      const code = (e as { code?: string }).code;
      if (code === "auth/user-disabled" || code === "SUSPENDED") return setSuspended(true);
      if (key === "google") setGoogleError(GOOGLE_FAIL);
      else setError(loginError(e));
    } finally {
      setBusy(null);
    }
  }

  const testLogin = (account: "broadcaster" | "viewer" | "admin") =>
    run(account, async () => signInWithCustomToken(auth, (await apiFetch(api.testLogin, { account })).token));

  return (
    <AuthCard logo>
      <h1 className="sr-only">로그인</h1>
      {suspended && <SuspendedNotice />}
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run("email", () => signInWithEmailAndPassword(auth, email.trim(), password));
        }}
      >
        <Field label="이메일">
          <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="비밀번호" error={error}>
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <div className="-my-2 flex justify-end">
          <Link href="/reset-password" className={buttonCls({ variant: "ghost", size: "sm" })}>
            비밀번호를 잊었어요
          </Link>
        </div>
        <Button type="submit" size="lg" loading={busy === "email"} disabled={!email || !password}>
          로그인
        </Button>
      </form>
      <Button variant="secondary" size="lg" loading={busy === "google"} onClick={() => run("google", signInWithGoogle)}>
        <GoogleIcon />
        Google로 계속하기
      </Button>
      {googleError && <p className="text-caption-12 text-danger">{googleError}</p>}
      <div className="flex items-center justify-center gap-1 text-body-16 text-muted">
        아직 계정이 없나요?
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className={buttonCls({ variant: "ghost", size: "sm" })}>
          회원가입
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-caption-12 text-subtle">심사용 테스트 계정</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="secondary" loading={busy === "broadcaster"} onClick={() => testLogin("broadcaster")}>
          <RadioIcon />
          테스트 방송자로 로그인
        </Button>
        <Button variant="secondary" loading={busy === "viewer"} onClick={() => testLogin("viewer")}>
          <UserIcon />
          테스트 시청자로 로그인
        </Button>
        <Button variant="secondary" loading={busy === "admin"} onClick={() => testLogin("admin")}>
          <UserIcon />
          테스트 운영자로 로그인
        </Button>
      </div>
    </AuthCard>
  );
}
