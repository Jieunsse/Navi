"use client";
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import { auth } from "@/shared/lib/firebase";
import { Button, Field, Input, Notice } from "@/shared/ui";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold">비밀번호 찾기</h1>
      {sent ? (
        <Notice>메일을 보냈어요. 메일의 링크에서 비밀번호를 다시 정해 주세요.</Notice>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await sendPasswordResetEmail(auth, email.trim());
              setSent(true);
            } catch (err) {
              const code = (err as { code?: string }).code;
              // 가입하지 않은 이메일도 똑같이 안내한다. 가입 여부를 알려주지 않기 위해서다(4-1).
              if (code === "auth/user-not-found") setSent(true);
              else if (code === "auth/invalid-email") setError("이메일 형식으로 입력해 주세요");
              else setError("연결이 불안정해요. 다시 시도해 주세요");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="가입한 이메일" error={error}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" loading={busy} disabled={!email}>
            메일 보내기
          </Button>
        </form>
      )}
    </div>
  );
}
