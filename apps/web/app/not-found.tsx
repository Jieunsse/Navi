"use client";
import Link from "next/link";
import { buttonCls, EmptyState } from "@/shared/ui";

export default function NotFound() {
  return (
    <EmptyState
      title="방송을 찾을 수 없어요"
      description="삭제되었거나 주소가 바뀌었어요"
      action={
        <Link href="/" className={buttonCls({ variant: "secondary" })}>
          다른 방송 보기
        </Link>
      }
    />
  );
}
