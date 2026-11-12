"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./index";

/** 확인 창(시안의 Dialog). 처음 초점은 취소, Esc로 닫힘, 닫히면 연 버튼으로 초점이 돌아간다. */
export function Dialog({ title, description, confirmLabel, danger = false, onConfirm, onClose }: { title: string; description?: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector("button")?.focus(); // 첫 버튼이 취소
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] grid place-items-center bg-scrim p-4" onClick={onClose}>
      <div ref={box} role="alertdialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()} className="flex w-full max-w-[400px] flex-col gap-4 rounded-lg bg-raised p-6 shadow-overlay">
        <h2 className="text-heading-20">{title}</h2>
        {description && <p className="text-body-16 text-muted">{description}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
