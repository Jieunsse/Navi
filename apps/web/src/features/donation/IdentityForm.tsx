"use client";
import { honeyApi } from "@nabi/shared/honey.ts";
import { useState } from "react";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, Field, Input, Notice } from "@/shared/ui";

/** 본인인증 목업(4-8). 입력만 받고 실제로 확인하지 않는다. */
export function IdentityForm({ onDone }: { onDone: (adult: boolean) => void }) {
  const [v, setV] = useState({ name: "", birth: "", phone: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const { adult } = await apiFetch(honeyApi.verifyIdentity, v);
      onDone(adult);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="warn">테스트용 본인인증이라 실제로 확인하지 않아요</Notice>
      <Field label="이름"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoComplete="name" /></Field>
      <Field label="생년월일" hint="예: 2000-01-31"><Input value={v.birth} onChange={(e) => setV({ ...v, birth: e.target.value })} inputMode="numeric" placeholder="YYYY-MM-DD" maxLength={10} /></Field>
      <Field label="휴대폰 번호" hint="숫자만 입력해 주세요. 번호는 저장하지 않아요"><Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value.replace(/\D/g, "") })} inputMode="tel" maxLength={11} /></Field>
      {error && <p className="text-caption-12 text-danger">{error}</p>}
      <Button size="lg" onClick={submit} loading={busy} disabled={!v.name || !v.birth || !v.phone}>인증하기</Button>
    </div>
  );
}
