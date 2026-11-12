"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { CheckIcon, HelpIcon, MoonIcon, SunIcon } from "./icons";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** 서비스 로고. on은 켜진 로고(주황 재생 삼각형), off는 전부 흐린 로고(빈 화면 안내용). */
export function Logo({ size = "md", off = false, className }: { size?: "md" | "lg"; off?: boolean; className?: string }) {
  const big = size === "lg";
  const ink = off ? "var(--color-text-tertiary)" : "var(--color-text-primary)";
  const live = off ? "var(--color-text-tertiary)" : "var(--color-live-default)";
  const px = big ? 40 : 28;
  return (
    <span className={cx("inline-flex items-center font-black", className)} style={{ gap: big ? 9.583 : 6.708, color: ink }}>
      <svg width={px} height={px} viewBox="0 0 28 28" fill="none" aria-hidden>
        <path
          d="M20.72 3.92C23.8127 3.92 26.3194 6.427 26.3196 9.5196V18.4796C26.3196 21.5724 23.8128 24.0801 20.72 24.0802H7.2796C4.187 24.0799 1.68 21.5722 1.68 18.4796V9.5196C1.6802 6.4271 4.1871 3.9202 7.2796 3.92H20.72ZM7.9251 10.3507C7.7118 10.1983 7.4307 10.178 7.1976 10.2979C6.9646 10.418 6.8177 10.6579 6.8177 10.92V17.0802C6.8178 17.3422 6.9646 17.5822 7.1976 17.7022C7.4307 17.8222 7.7118 17.8019 7.9251 17.6495L12.2366 14.5694C12.4206 14.438 12.5296 14.2261 12.5296 14.0001C12.5296 13.774 12.4205 13.5621 12.2366 13.4307L7.9251 10.3507Z"
          fill={ink}
        />
        <path d="M20.482 8.12V19.88L12.25 14L20.482 8.12Z" fill={live} stroke={live} strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx="22.96" cy="7" r="1.26" fill={live} />
      </svg>
      <span style={{ fontSize: big ? 30.417 : 21.292, lineHeight: 1.03, letterSpacing: "-0.07em" }}>나비</span>
    </span>
  );
}

/** 로그인·가입·비밀번호 찾기 화면의 가운데 카드. 휴대폰은 카드 없이 화면 전체를 쓴다. */
export function AuthCard({ children, logo = false }: { children: ReactNode; logo?: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-[440px] flex-col gap-5 md:rounded-lg md:bg-surface md:p-8">
        {logo && (
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span role="status" aria-label="불러오는 중" className={cx("inline-block size-5 animate-spin rounded-full border-2 border-subtle border-t-transparent", className)} />;
}

/** 아이콘만 있는 버튼. 화면 읽기 이름(label)이 꼭 필요하다. 휴대폰에서도 누르는 영역 40 이상. */
export function IconButton({ label, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      {...p}
      aria-label={label}
      className={cx("relative inline-grid size-10 shrink-0 place-items-center rounded-md text-text transition-colors hover:bg-hover active:bg-pressed disabled:cursor-not-allowed disabled:text-subtle", className)}
    >
      {children}
    </button>
  );
}

export function Avatar({ name, live = false, size = "md", className }: { name: string; live?: boolean; size?: "sm" | "md" | "lg"; className?: string }) {
  const px = { sm: "size-6", md: "size-8", lg: "size-10" }[size];
  return (
    <span
      aria-hidden
      className={cx("inline-grid shrink-0 place-items-center rounded-full bg-raised text-caption-12 text-muted", px, live && "border-2 border-live shadow-glow", className)}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("rounded-sm bg-raised", className)} />;
}

/** 빈 화면·오류 화면. 꺼진 로고, 제목, 한 줄 설명, 버튼 하나. */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <Logo off size="md" className="mb-1" />
      <p className="text-heading-16">{title}</p>
      {description && <p className="text-caption-12 text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** 켜짐·꺼짐 스위치. 켜짐은 흑백을 뒤집은 색을 쓴다(주황은 '켜는 것'에만). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-10 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40", checked ? "border-transparent bg-accent" : "border-strong bg-raised")}
    >
      <span className={cx("absolute top-0.5 size-4 rounded-full transition-all", checked ? "left-[calc(100%-1.125rem)] bg-accent-ink" : "left-0.5 bg-subtle")} />
    </button>
  );
}

/** 제목 옆 "?" 도움말. 마우스를 올리거나 초점이 가면 말풍선이 뜬다. 한 화면에 한 곳만 둔다. */
export function HelpTip({ text, label = "도움말" }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={label} className="inline-grid size-5 place-items-center rounded-full text-subtle hover:text-text">
        <HelpIcon size={16} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-[var(--z-dropdown)] mt-2 hidden w-56 -translate-x-1/2 rounded-sm border border-line bg-raised px-3 py-2 text-left text-caption-12 text-text shadow-float group-focus-within:block group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

/** 약관 동의 한 줄. 상자와 글자, 오른쪽에 "보기" 링크. */
export function ConsentItem({ checked, onChange, label, href, invalid, strong, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; href?: string | null; invalid?: boolean; strong?: boolean; className?: string }) {
  return (
    <div className={cx("flex items-center justify-between gap-3", className)}>
      <label className={cx("flex min-h-6 cursor-pointer items-center gap-2", strong ? "text-heading-16" : "text-body-16", invalid && "text-danger")}>
        <span className="relative inline-grid size-4 shrink-0 place-items-center">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="peer absolute inset-0 size-4 cursor-pointer appearance-none rounded-xs border border-strong bg-surface checked:border-transparent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <CheckIcon size={12} className="pointer-events-none relative hidden text-accent-ink peer-checked:block" />
        </span>
        {label}
      </label>
      {href && (
        <Link href={href} target="_blank" className="text-caption-12 text-muted underline hover:text-text">
          보기
        </Link>
      )}
    </div>
  );
}

/** 주소로 가는 탭(약관 세 문서). 지금 주소와 같은 탭에 밑줄. */
export function LinkTabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex overflow-x-auto border-b border-line" aria-label="문서 선택">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={path === t.href ? "page" : undefined}
          className={cx("-mb-px shrink-0 border-b-2 px-4 py-3 text-heading-16", path === t.href ? "border-[var(--color-text-primary)] text-text" : "border-transparent text-subtle hover:text-text")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

const THEME_KEY = "nabi-theme";
const subscribe = (cb: () => void) => {
  window.addEventListener("nabi-theme", cb);
  return () => window.removeEventListener("nabi-theme", cb);
};
const read = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

/** 밝은 화면·어두운 화면 전환. 고른 값은 브라우저에 저장한다(07 4-16). 기본은 어두운 화면. */
export function ThemeToggle({ withLabel = false, className }: { withLabel?: boolean; className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => "dark");
  const toLight = theme === "dark";
  const label = toLight ? "밝은 화면으로" : "어두운 화면으로";
  function toggle() {
    const next = toLight ? "light" : "dark";
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 저장이 막힌 브라우저(사생활 보호 모드 등)에서는 이번 방문에만 적용한다.
    }
    window.dispatchEvent(new Event("nabi-theme"));
  }
  const Icon = toLight ? SunIcon : MoonIcon;
  if (withLabel)
    return (
      <button type="button" onClick={toggle} className={cx("flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-body-16 hover:bg-hover", className)}>
        <Icon size={20} className="text-muted" />
        {label}
      </button>
    );
  return (
    <IconButton label={label} onClick={toggle} className={className}>
      <Icon size={20} />
    </IconButton>
  );
}


/** 화면 안 탭(글자 탭, 선택한 탭에 밑줄). 주소가 바뀌지 않는 탭에 쓴다. */
export function Tabs<T extends string>({ items, value, onChange, label }: { items: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-line">
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx("-mb-px shrink-0 border-b-2 px-4 py-3 text-heading-16", value === t.value ? "border-[var(--color-text-primary)] text-text" : "border-transparent text-subtle hover:text-text")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** 요약 칸. 작은 글자 이름, 큰 숫자, 그 아래 보조 한 줄. */
export function StatCard({ label, value, sub, tone, children }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "live" | "success"; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface p-4">
      <p className="text-caption-12 text-subtle">{label}</p>
      <p className={cx("text-heading-20", tone === "live" && "text-live", tone === "success" && "text-success")}>{value}</p>
      {sub && <p className="text-caption-12 text-subtle">{sub}</p>}
      {children}
    </div>
  );
}

/** 목록의 한 줄 상자(바탕 surface, 둥근 모서리). */
export function Card({ className, children, ...p }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cx("rounded-lg bg-surface", className)}>
      {children}
    </div>
  );
}
