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
import { AuthCard, Button, buttonCls, ConsentItem, Field, Input, PasswordInput } from "@/shared/ui";

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
  // 가입 버튼 조건(4-1): 이메일 형식, 비밀번호 6자 이상, 확인 일치, 닉네임 중복 확인, 필수 약관
  const formOk = formSchema.safeParse(watch()).success;

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
    <AuthCard>
      <h1 className="text-heading-28">회원가입</h1>
      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <Field label="이메일" error={err.email?.message}>
          <Input type="email" autoComplete="email" invalid={!!err.email} {...register("email")} />
        </Field>
        <Field label="비밀번호" error={err.password?.message} hint="6자 이상으로 만들어 주세요">
          <PasswordInput autoComplete="new-password" invalid={!!err.password} {...register("password")} />
        </Field>
        <Field label="비밀번호 확인" error={err.passwordConfirm?.message}>
          <PasswordInput autoComplete="new-password" invalid={!!err.passwordConfirm} {...register("passwordConfirm")} />
        </Field>
        <div className="flex flex-col gap-2">
          <label htmlFor="nickname" className="text-caption-12 text-muted">
            닉네임
          </label>
          <div className="flex gap-2">
            <Input id="nickname" invalid={!!err.nickname || nickMsg?.ok === false} {...register("nickname", { onChange: () => setNickMsg(null) })} />
            <Button type="button" variant="secondary" size="lg" className="shrink-0" disabled={!nickname} loading={checking} onClick={checkNick}>
              중복 확인
            </Button>
          </div>
          {nickHint && <span className={`text-caption-12 ${nickVerified && nickMsg?.ok ? "text-success" : "text-danger"}`}>{nickHint}</span>}
        </div>

        <fieldset className="flex flex-col gap-3">
          <ConsentItem
            strong
            label="전체 동의"
            checked={allAgreed}
            onChange={(v) => setAgree({ age14: v, terms: v, streamerTerms: v, privacy: v })}
            className="border-b border-line pb-3"
          />
          {agreeItems.map((it) => (
            <ConsentItem key={it.key} label={`${it.label} (필수)`} href={it.href} checked={agree[it.key]} invalid={formState.isSubmitted && !agree[it.key]} onChange={(v) => setAgree((a) => ({ ...a, [it.key]: v }))} />
          ))}
        </fieldset>

        {submitError && <p className="text-caption-12 text-danger">{submitError}</p>}
        <Button type="submit" size="lg" loading={formState.isSubmitting} disabled={!formOk || !nickVerified || !allAgreed}>
          가입하기
        </Button>
      </form>
      <div className="flex items-center justify-center gap-1 text-body-16 text-muted">
        이미 계정이 있나요?
        <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonCls({ variant: "ghost", size: "sm" })}>
          로그인
        </Link>
      </div>
    </AuthCard>
  );
}
