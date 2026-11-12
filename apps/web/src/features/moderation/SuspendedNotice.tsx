"use client";

/** 영구 정지된 계정의 로그인 화면 안내(4-15). 로그인 화면은 로그인 실패가 SUSPENDED일 때 이 컴포넌트를 보여준다. */
export function SuspendedNotice({ contact = "support@nabi.example" }: { contact?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-3 text-sm">
      <p className="font-semibold">운영정책 위반으로 이용이 정지된 계정이에요</p>
      <p className="mt-1 text-muted">
        이의가 있으면 <a href={`mailto:${contact}`} className="underline">{contact}</a>로 알려 주세요.
      </p>
    </div>
  );
}
