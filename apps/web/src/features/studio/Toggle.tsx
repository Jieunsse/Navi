"use client";
import { cx } from "@/shared/ui";

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-accent" : "bg-surface-2 ring-1 ring-line")}
    >
      <span className={cx("absolute left-0.5 top-0.5 size-5 rounded-full bg-white transition-transform", checked && "translate-x-5")} />
    </button>
  );
}
