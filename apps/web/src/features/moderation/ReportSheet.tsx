"use client";
import { moderationApi, REPORT_DETAIL_MAX, REPORT_REASONS, type createReportSchema } from "@nabi/shared/moderation.ts";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button } from "@/shared/ui";

type Reason = keyof typeof REPORT_REASONS;
export type ReportTarget = Pick<z.input<typeof createReportSchema>, "targetType" | "targetId" | "broadcastId">;

/** 아래에서 올라오는 시트. 바깥을 누르면 닫힌다. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label={title}>
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="닫기" />
      <div className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 sm:rounded-2xl">
        <h2 className="text-base font-bold">{title}</h2>
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
      <p className="text-sm text-muted">{label}</p>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">사유</legend>
        {(Object.keys(REPORT_REASONS) as Reason[]).map((r) => (
          <label key={r} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-2">
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
            {REPORT_REASONS[r]}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">설명{reason === "other" ? " (필수)" : " (선택)"}</span>
        <textarea
          value={detail}
          maxLength={REPORT_DETAIL_MAX}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          className="rounded-lg border border-line bg-surface p-3 text-sm outline-none focus:border-accent"
        />
        <span className="text-right text-xs text-muted">
          {detail.length}/{REPORT_DETAIL_MAX}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          뒤로
        </Button>
        <Button type="submit" loading={busy} disabled={!reason || (reason === "other" && !detail.trim())} className="flex-1">
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
