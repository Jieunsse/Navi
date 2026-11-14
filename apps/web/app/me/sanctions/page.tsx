"use client";
import { adminOpsApi, APPEAL_MAX, APPEAL_MIN, APPEAL_STATUS_LABEL } from "@nabi/shared/adminOps.ts";
import { moderationApi, SANCTION_LABEL, SANCTION_STATUS_LABEL, type SanctionItem } from "@nabi/shared/moderation.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useRequireLogin } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, EmptyState, Spinner } from "@/shared/ui";

function AppealForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const len = content.trim().length;

  async function submit() {
    setBusy(true);
    try {
      await apiFetch(adminOpsApi.createAppeal, { content }, { id });
      toast.success("이의 제기를 보냈어요");
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={content}
        maxLength={APPEAL_MAX}
        rows={4}
        placeholder={`이의를 제기하는 이유를 ${APPEAL_MIN}자 이상 적어 주세요`}
        onChange={(e) => setContent(e.target.value)}
        className="w-full resize-none rounded-sm border border-line bg-raised p-4 text-body-16 outline-none placeholder:text-subtle focus:border-[var(--color-focus-ring)]"
      />
      <div className="flex items-center justify-between">
        <span className="text-caption-12 text-subtle">{len}/{APPEAL_MAX} · 한 제재에 한 번만 제기할 수 있어요</span>
        <Button size="sm" loading={busy} disabled={len < APPEAL_MIN} onClick={() => void submit()}>이의 제기하기</Button>
      </div>
    </div>
  );
}

function Item({ s, onChanged }: { s: SanctionItem; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  // 영구 정지는 로그인할 수 없어 화면에서 이의를 제기하지 않는다. 이미 풀린 제재도 제기할 곳이 없다.
  const canAppeal = !s.appeal && s.kind !== "suspend" && (s.status === "active" || s.status === "ended");
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
      <span className="flex items-center justify-between">
        <b className="text-heading-16">{SANCTION_LABEL[s.kind]}</b>
        <span className={s.status === "active" ? "text-caption-12 text-danger" : "text-caption-12 text-muted"}>{SANCTION_STATUS_LABEL[s.status]}</span>
      </span>
      <span className="text-body-16 text-muted">사유: {s.reason}</span>
      <span className="text-caption-12 text-subtle">
        {formatTime(s.startAt)}
        {s.endAt && ` ~ ${formatTime(s.endAt)}`}
      </span>
      {s.revokeReason && <span className="text-caption-12 text-muted">해제 사유: {s.revokeReason}</span>}
      {s.appeal && (
        <span className="text-caption-12 text-muted">
          이의 제기: {APPEAL_STATUS_LABEL[s.appeal.status]}
          {s.appeal.answer && ` · 답변: ${s.appeal.answer}`}
        </span>
      )}
      {canAppeal && (open ? <AppealForm id={s.id} onDone={onChanged} /> : <Button variant="secondary" size="sm" className="self-start" onClick={() => setOpen(true)}>이의 제기</Button>)}
    </div>
  );
}

export default function MySanctionsPage() {
  const { me } = useRequireLogin();
  const [items, setItems] = useState<SanctionItem[] | null>(null);
  const load = useCallback(() => apiFetch(moderationApi.mySanctions).then((r) => setItems(r.items), () => setItems([])), []);
  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  if (!me || !items) return <div className="grid flex-1 place-items-center"><Spinner /></div>;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 md:p-8">
      <h1 className="text-heading-28">제재 내역</h1>
      {items.length === 0 && <EmptyState title="받은 제재가 없어요" />}
      <div className="flex flex-col gap-2">
        {items.map((s) => <Item key={s.id} s={s} onChanged={() => void load()} />)}
      </div>
    </div>
  );
}
