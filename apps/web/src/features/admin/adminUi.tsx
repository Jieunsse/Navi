import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/apiFetch";
import { Button, cx, HelpTip } from "@/shared/ui";

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

/**
 * 목록 화면의 탭·검색어·고른 대상을 주소(?status=...&id=...)에 둔다. 새로고침하거나 링크를 나눠도 같은 화면이 열린다.
 * useSearchParams를 쓰므로 이 훅을 쓰는 화면은 <Suspense> 안에 있어야 한다.
 */
export function useUrlState() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const get = useCallback((k: string) => sp.get(k) ?? "", [sp]);
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const q = next.toString();
      router.replace(q ? `${path}?${q}` : path, { scroll: false });
    },
    [sp, router, path],
  );
  return { get, set };
}

/** 운영자 목록 표. 줄을 누르면 오른쪽 상세가 열린다. cols는 칸 너비(grid-template-columns 값)다. */
export function AdminTable<T>({ cols, head, rows, rowKey, selected, onSelect, cells }: { cols: string; head: string[]; rows: T[]; rowKey: (r: T) => string; selected?: string; onSelect: (r: T) => void; cells: (r: T) => ReactNode[] }) {
  return (
    <div role="table" className="flex flex-col text-body-16">
      <div role="row" className="grid gap-3 border-b border-line px-3 py-2 text-caption-12 text-subtle" style={{ gridTemplateColumns: cols }}>
        {head.map((h) => (
          <span role="columnheader" key={h} className="truncate">{h}</span>
        ))}
      </div>
      {rows.map((r) => (
        <button
          role="row"
          type="button"
          key={rowKey(r)}
          aria-selected={selected === rowKey(r)}
          onClick={() => onSelect(r)}
          className={cx("grid items-center gap-3 border-b border-line px-3 py-2.5 text-left", selected === rowKey(r) ? "bg-raised" : "hover:bg-hover")}
          style={{ gridTemplateColumns: cols }}
        >
          {cells(r).map((c, i) => (
            <span role="cell" key={i} className="min-w-0 truncate">{c}</span>
          ))}
        </button>
      ))}
    </div>
  );
}

/** "더 보기" 단추. 서버가 다음 페이지 위치(next)를 주면 보인다. */
export function MoreButton({ next, loading, onMore }: { next: string | null | undefined; loading?: boolean; onMore: () => void }) {
  if (!next) return null;
  return (
    <Button variant="secondary" loading={loading} onClick={onMore} className="self-center">
      더 보기
    </Button>
  );
}
