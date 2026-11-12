import type { ReactNode } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/apiFetch";
import { cx, HelpTip } from "@/shared/ui";

export const fail = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");

/** 운영자 화면 공통 제목 영역. 설명 문장은 화면에 쓰지 않고 "?" 도움말에 넣는다. */
export function PageHead({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="flex items-center gap-2">
      <h1 className="text-heading-28">{title}</h1>
      {desc && <HelpTip text={desc} />}
    </div>
  );
}

export function Card({ children, dim }: { children: ReactNode; dim?: boolean }) {
  return <div className={cx("flex flex-col gap-2 rounded-lg bg-surface p-4", dim && "opacity-60")}>{children}</div>;
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-xs bg-raised px-2 py-1 text-caption-12 text-muted">{children}</span>;
}
