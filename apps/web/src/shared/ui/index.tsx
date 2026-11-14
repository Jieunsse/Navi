"use client";
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// 시안의 Button: 주황(live)은 '켜는 것'(방송 시작, 후원하기)에만, primary는 흑백을 뒤집은 일반 주요 버튼, danger는 테두리형.
type Variant = "primary" | "live" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink",
  live: "bg-live text-on-accent active:bg-live-press",
  secondary: "border border-line bg-raised text-text",
  danger: "border border-danger bg-transparent text-danger",
  ghost: "bg-transparent text-text",
};
const sizes: Record<Size, string> = {
  sm: "h-8 gap-2 px-3 text-caption-12",
  md: "h-10 gap-2 px-5 text-heading-16",
  lg: "h-12 gap-2 px-6 text-heading-16",
};
// 마우스 올림·누름은 원래 색 위에 덮는 색(state/hover, state/pressed)을 얹는다.
const overlay = "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-hover after:opacity-0 hover:after:opacity-100 active:after:bg-pressed active:after:opacity-100";

/** 링크를 버튼 모양으로 그릴 때 쓰는 클래스(버튼 안에 링크, 링크 안에 버튼을 넣지 않기 위해). */
export function buttonCls({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cx(
    "relative inline-flex items-center justify-center whitespace-nowrap rounded-md transition-colors disabled:cursor-not-allowed disabled:border-transparent disabled:bg-raised disabled:text-subtle disabled:after:hidden",
    sizes[size],
    variants[variant],
    overlay,
    className,
  );
}

export function Button({ variant = "primary", size = "md", className, loading, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || loading} className={buttonCls({ variant, size, className })}>
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...p }, ref) {
  return (
    <input
      ref={ref}
      {...p}
      aria-invalid={invalid || undefined}
      className={cx(
        "h-12 w-full rounded-sm border bg-surface px-4 text-body-16 outline-none placeholder:text-subtle disabled:cursor-not-allowed disabled:bg-raised disabled:text-subtle",
        invalid ? "border-danger" : "border-line hover:border-strong focus:border-[var(--color-focus-ring)]",
        className,
      )}
    />
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function PasswordInput(p, ref) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} {...p} type={shown ? "text" : "password"} className="pr-12" />
      <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"} className="absolute inset-y-0 right-0 grid w-12 place-items-center text-subtle hover:text-text">
        {shown ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
});

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-caption-12 text-muted">{label}</span>
      {children}
      {error ? <span className="text-caption-12 text-danger">{error}</span> : hint ? <span className="text-caption-12 text-subtle">{hint}</span> : null}
    </label>
  );
}

// 주황은 '방송 중'에만. 색과 함께 글자로도 상태를 알린다. 시청자 수 칩(ViewerBadge)과 모양을 맞춘다.
export function StatusBadge({ status }: { status: "ready" | "live" | "ended" }) {
  const map = {
    live: ["LIVE", "bg-live text-on-accent"],
    ready: ["준비", "bg-raised text-muted"],
    ended: ["종료", "bg-raised text-muted"],
  } as const;
  const [label, cls] = map[status];
  return <span className={cx("inline-flex items-center rounded-xs px-2 py-1 text-badge-12 font-bold", cls)}>{label}</span>;
}

// 시안의 Banner. 안내 띠와 안내 상자 모두 이 컴포넌트를 쓴다.
export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  const tones = { info: "border-line bg-surface", warn: "border-live/40 bg-live-bg", danger: "border-danger/50 bg-danger/10" };
  return <div className={cx("rounded-md border px-4 py-3 text-body-16", tones[tone])}>{children}</div>;
}
export const Banner = Notice;

export function Center({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">{children}</div>;
}

export { cx };
export * from "./icons";
export { AuthCard, Avatar, Card, ConsentItem, EmptyState, HelpTip, IconButton, LinkTabs, Logo, Skeleton, Spinner, StatCard, Switch, Tabs, ThemeToggle } from "./parts";
export { Dialog } from "./Dialog";
