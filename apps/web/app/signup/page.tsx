"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, nicknameSchema } from "@nabi/shared";
import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSession } from "@/entities/session/session";
import { useNextPath } from "@/features/auth/next";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { auth } from "@/shared/lib/firebase";
import { Button, Field, Input, PasswordInput } from "@/shared/ui";

const agreeItems = [
  { key: "age14", label: "만 14세 이상입니다", href: null },
  { key: "terms", label: "이용약관 동의", href: "/terms" },
  { key: "streamerTerms", label: "방송자 이용약관 동의", href: "/terms/streamer" },
  { key: "privacy", label: "개인정보 수집과 이용 동의", href: "/privacy" },
] as const;
type AgreeKey = (typeof agreeItems)[number]["key"];

// 비밀번호 확인 비교는 브라우저에서만 한다(4-1).
const formSchema = z
  .object({
    email: z.email("이메일 형식으로 입력해 주세요"),
    password: z.string().min(6, "비밀번호는 6자 이상이어야 해요"),
    passwordConfirm: z.string(),
    nickname: nicknameSchema,
  })
  .refine((v) => v.password === v.passwordConfirm, { path: ["passwordConfirm"], message: "비밀번호가 같지 않아요" });
type Form = z.infer<typeof formSchema>;

export default function SignupPage() {
  return (
    <Suspense>
      <Signup />
    </Suspense>
  );
}

function Signup() {
  const router = useRouter();
  const next = useNextPath();
  const { refresh } = useSession();
  const { register, handleSubmit, watch, formState, setError, getValues, trigger } = useForm<Form>({ resolver: zodResolver(formSchema), mode: "onBlur" });
  const [checkedNick, setCheckedNick] = useState<string | null>(null);
  const [nickMsg, setNickMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [agree, setAgree] = useState<Record<AgreeKey, boolean>>({ age14: false, terms: false, streamerTerms: false, privacy: false });
  const [submitError, setSubmitError] = useState("");
  const [checking, setChecking] = useState(false);

  const nickname = watch("nickname") ?? "";
  const nickVerified = checkedNick !== null && checkedNick === nickname;
  const allAgreed = Object.values(agree).every(Boolean);

  async function checkNick() {
    if (!(await trigger("nickname"))) return;
    setChecking(true);
    try {
      await apiFetch(api.checkNickname, { nickname: getValues("nickname") });
      setCheckedNick(getValues("nickname"));
      setNickMsg({ ok: true, text: "쓸 수 있는 닉네임이에요" });
    } catch (e) {
      setCheckedNick(null);
      setNickMsg({ ok: false, text: e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요" });
    } finally {
      setChecking(false);
    }
  }

  const onSubmit = handleSubmit(async (v) => {
    setSubmitError("");
    try {
      await apiFetch(api.signup, { email: v.email, password: v.password, nickname: v.nickname, agreements: { age14: true, terms: true, streamerTerms: true, privacy: true } });
      await signInWithEmailAndPassword(auth, v.email, v.password);
      await refresh();
      router.replace(next);
    } catch (e) {
      if (e instanceof ApiError && e.code === "EMAIL_TAKEN") setError("email", { message: e.message });
      else if (e instanceof ApiError && e.code.startsWith("NICKNAME")) {
        setCheckedNick(null);
        setNickMsg({ ok: false, text: e.message });
      } else setSubmitError(e instanceof ApiError ? e.message : "연결이 불안정해요. 다시 시도해 주세요");
    }
  });

  const err = formState.errors;
  const nickHint = err.nickname?.message ?? nickMsg?.text ?? (nickname && !nickVerified ? "중복 확인을 해 주세요" : undefined);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">회원가입</h1>
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field label="이메일" error={err.email?.message}>
          <Input type="email" autoComplete="email" invalid={!!err.email} {...register("email")} />
        </Field>
        <Field label="비밀번호" error={err.password?.message}>
          <PasswordInput autoComplete="new-password" invalid={!!err.password} {...register("password")} />
        </Field>
        <Field label="비밀번호 확인" error={err.passwordConfirm?.message}>
          <PasswordInput autoComplete="new-password" invalid={!!err.passwordConfirm} {...register("passwordConfirm")} />
        </Field>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="nickname" className="font-medium">
            닉네임
          </label>
          <div className="flex gap-2">
            <Input id="nickname" invalid={!!err.nickname || nickMsg?.ok === false} {...register("nickname", { onChange: () => setNickMsg(null) })} />
            <Button type="button" variant="secondary" className="shrink-0" disabled={!nickname} loading={checking} onClick={checkNick}>
              중복 확인
            </Button>
          </div>
          {nickHint && <span className={`text-xs ${nickVerified && nickMsg?.ok ? "text-accent" : "text-danger"}`}>{nickHint}</span>}
        </div>

        <fieldset className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm">
          <label className="flex items-center gap-2 border-b border-line pb-2 font-semibold">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={allAgreed} onChange={(e) => setAgree({ age14: e.target.checked, terms: e.target.checked, streamerTerms: e.target.checked, privacy: e.target.checked })} />
            전체 동의
          </label>
          {agreeItems.map((it) => (
            <div key={it.key} className="flex items-center justify-between">
              <label className={`flex items-center gap-2 ${formState.isSubmitted && !agree[it.key] ? "text-danger" : ""}`}>
                <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={agree[it.key]} onChange={(e) => setAgree((a) => ({ ...a, [it.key]: e.target.checked }))} />
                {it.label}(필수)
              </label>
              {it.href && (
                <Link href={it.href} target="_blank" className="text-xs text-muted underline">
                  보기
                </Link>
              )}
            </div>
          ))}
        </fieldset>

        {submitError && <p className="text-sm text-danger">{submitError}</p>}
        <Button type="submit" loading={formState.isSubmitting} disabled={!nickVerified || !allAgreed}>
          가입하기
        </Button>
      </form>
    </div>
  );
}
