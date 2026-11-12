"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { accountApi } from "@nabi/shared/account.ts";
import { api, nicknameSchema } from "@nabi/shared";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSession } from "@/entities/session/session";
import { useNextPath } from "@/features/auth/next";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { AuthCard, Button, ConsentItem, Input } from "@/shared/ui";

const agreeItems = [
  { key: "age14", label: "만 14세 이상입니다", href: null },
  { key: "terms", label: "이용약관 동의", href: "/terms" },
  { key: "streamerTerms", label: "방송자 이용약관 동의", href: "/terms/streamer" },
  { key: "privacy", label: "개인정보 수집과 이용 동의", href: "/privacy" },
] as const;
type AgreeKey = (typeof agreeItems)[number]["key"];

const formSchema = z.object({ nickname: nicknameSchema });

export default function GoogleSignupPage() {
  return (
    <Suspense>
      <GoogleSignup />
    </Suspense>
  );
}

/** 구글로 처음 로그인한 사람의 가입 마무리. 닉네임과 필수 약관만 받는다(4-1). */
function GoogleSignup() {
  const router = useRouter();
  const next = useNextPath();
  const { user, me, loading, refresh } = useSession();
  const { register, handleSubmit, watch, formState, getValues, trigger } = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema), mode: "onBlur" });
  const [checkedNick, setCheckedNick] = useState<string | null>(null);
  const [nickMsg, setNickMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [agree, setAgree] = useState<Record<AgreeKey, boolean>>({ age14: false, terms: false, streamerTerms: false, privacy: false });
  const [submitError, setSubmitError] = useState("");
  const [checking, setChecking] = useState(false);

  // 로그인하지 않았거나 이미 가입한 사람은 이 화면이 필요 없다.
  useEffect(() => {
    if (loading) return;
    if (me) router.replace(next);
    else if (!user) router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [loading, me, user, next, router]);

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
      await apiFetch(accountApi.signupGoogle, { nickname: v.nickname, agreements: { age14: true, terms: true, streamerTerms: true, privacy: true } });
      await refresh();
      router.replace(next);
    } catch (e) {
      if (e instanceof ApiError && e.code.startsWith("NICKNAME")) {
        setCheckedNick(null);
        setNickMsg({ ok: false, text: e.message });
      } else setSubmitError(e instanceof ApiError ? e.message : "연결이 불안정해요. 다시 시도해 주세요");
    }
  });

  const nickHint = formState.errors.nickname?.message ?? nickMsg?.text ?? (nickname && !nickVerified ? "중복 확인을 해 주세요" : undefined);

  return (
    <AuthCard>
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-28">가입 마무리</h1>
        <p className="text-body-16 text-muted">{user?.email ?? "구글 계정"}으로 로그인했어요. 닉네임과 약관 동의만 하면 끝나요.</p>
      </div>
      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor="nickname" className="text-caption-12 text-muted">
            닉네임
          </label>
          <div className="flex gap-2">
            <Input id="nickname" invalid={!!formState.errors.nickname || nickMsg?.ok === false} {...register("nickname", { onChange: () => setNickMsg(null) })} />
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
        <Button type="submit" size="lg" loading={formState.isSubmitting} disabled={!nickVerified || !allAgreed}>
          가입하기
        </Button>
      </form>
    </AuthCard>
  );
}
