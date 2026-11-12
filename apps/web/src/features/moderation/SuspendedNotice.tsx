"use client";
import { Banner } from "@/shared/ui";

/** 영구 정지된 계정의 로그인 화면 안내(4-15). 로그인 화면은 로그인 실패가 SUSPENDED일 때 이 컴포넌트를 보여준다. */
export function SuspendedNotice({ contact = "support@nabi.example" }: { contact?: string }) {
  return (
    <div role="alert">
      <Banner tone="danger">
        <p className="text-heading-16">운영정책 위반으로 이용이 정지된 계정이에요</p>
        <p className="mt-1 text-caption-12 text-muted">
          이의가 있으면 <a href={`mailto:${contact}`} className="underline">{contact}</a>로 알려 주세요.
        </p>
      </Banner>
    </div>
  );
}
