"use client";
import { moderationApi, REPORT_DETAIL_MAX, REPORT_REASONS, type createReportSchema } from "@nabi/shared/moderation.ts";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, cx, IconButton, XIcon } from "@/shared/ui";

type Reason = keyof typeof REPORT_REASONS;
export type ReportTarget = Pick<z.input<typeof createReportSchema>, "targetType" | "targetId" | "broadcastId">;

/** 아래에서 올라오는 시트(PC는 오른쪽 아래). 바깥을 누르면 닫힌다. */
export function Sheet({ title, badge, onClose, children }: { title: string; badge?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[var(--z-sheet)] flex items-end justify-center lg:justify-end" role="dialog" aria-modal aria-label={title}>
      <button className="absolute inset-0 bg-scrim" onClick={onClose} aria-label="닫기" />
      <div className="relative flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-lg bg-raised px-4 pb-8 pt-4 shadow-overlay lg:w-[360px]">
        <span aria-hidden className="mx-auto h-1 w-8 shrink-0 rounded-full bg-strong" />
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-heading-20">{title}</h2>
          {badge}
          <IconButton label="닫기" onClick={onClose} className="ml-auto size-12">
            <XIcon size={24} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 신고 사유와 설명을 받아 서버에 보낸다(4-13). */
export function ReportForm({ target, label, onDone, onBack }: { target: ReportTarget; label: string; onDone: () => void; onBack: () => void }) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(moderationApi.createReport, { ...target, reason, detail });
      toast.success("신고했어요. 처리 결과는 내 정보의 신고 내역에서 볼 수 있어요");
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "잠시 뒤에 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-caption-12 text-muted">{label}</p>
      <fieldset className="flex flex-wrap gap-2" role="radiogroup" aria-label="사유">
        {(Object.keys(REPORT_REASONS) as Reason[]).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={cx("h-8 rounded-full px-3 text-caption-12", reason === r ? "bg-accent text-accent-ink" : "border border-line bg-raised text-muted hover:bg-hover")}
          >
            {REPORT_REASONS[r]}
          </button>
        ))}
      </fieldset>
      <label className="flex flex-col gap-2">
        <span className="text-caption-12 text-muted">설명({reason === "other" ? "필수" : "선택"}, {REPORT_DETAIL_MAX}자까지)</span>
        <textarea
          value={detail}
          maxLength={REPORT_DETAIL_MAX}
          onChange={(e) => setDetail(e.target.value)}
          className="h-[120px] resize-none rounded-sm border border-line bg-surface px-4 py-3 text-body-16 outline-none focus:border-[var(--color-focus-ring)]"
        />
        <span className="self-end text-caption-12 text-subtle">
          {detail.length}/{REPORT_DETAIL_MAX}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-caption-12 text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="lg" onClick={onBack} className="flex-1">
          뒤로
        </Button>
        <Button type="submit" variant="danger" size="lg" loading={busy} disabled={!reason || (reason === "other" && !detail.trim())} className="flex-1">
          신고하기
        </Button>
      </div>
    </form>
  );
}

/** 방송 신고처럼 시트 하나로 끝나는 신고. */
export function ReportSheet({ target, label, onClose }: { target: ReportTarget; label: string; onClose: () => void }) {
  return (
    <Sheet title="신고하기" onClose={onClose}>
      <ReportForm target={target} label={label} onDone={onClose} onBack={onClose} />
    </Sheet>
  );
}
