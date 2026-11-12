"use client";
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-110",
  secondary: "bg-surface-2 text-text hover:bg-line",
  danger: "bg-danger text-white hover:brightness-110",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
};

export function Button({ variant = "primary", className, loading, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cx("inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40", variants[variant], className)}
    >
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
      className={cx("h-11 w-full rounded-lg border bg-surface px-3 text-sm outline-none placeholder:text-muted focus:border-accent", invalid ? "border-danger" : "border-line", className)}
    />
  );
});

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function PasswordInput(p, ref) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} {...p} type={shown ? "text" : "password"} className="pr-11" />
      <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-text">
        {shown ? "🙈" : "👁"}
      </button>
    </div>
  );
});

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function StatusBadge({ status }: { status: "ready" | "live" | "ended" }) {
  const map = { live: ["LIVE", "bg-live text-white"], ready: ["준비 중", "bg-surface-2 text-muted"], ended: ["종료", "bg-surface-2 text-muted"] } as const;
  const [label, cls] = map[status];
  return <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-bold", cls)}>{label}</span>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger"; children: ReactNode }) {
  const tones = { info: "border-line bg-surface", warn: "border-accent/40 bg-accent/10", danger: "border-danger/50 bg-danger/10" };
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function Center({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">{children}</div>;
}

export { cx };
