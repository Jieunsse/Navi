"use client";
import type { ApiRes } from "@nabi/shared";
import { moderationApi, REPORT_REASONS, REPORT_STATUS_LABEL } from "@nabi/shared/moderation.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SanctionForm, useSanctionGuard } from "@/features/admin/SanctionForm";
import { SanctionList } from "@/features/admin/SanctionList";
import { AdminGate } from "@/features/admin/AdminGate";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, cx, Input } from "@/shared/ui";

type Status = keyof typeof REPORT_CHIP;
const REPORT_CHIP = { pending: "접수", actioned: "조치함", dismissed: "기각" } as const;
type Groups = ApiRes<typeof moderationApi.adminReports>["items"];
type Detail = ApiRes<typeof moderationApi.adminReportDetail>;

function AdminReportsPageBody() {
  const [groups, setGroups] = useState<Groups | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");
  const loadGroups = useCallback(() => apiFetch(moderationApi.adminReports).then((r) => setGroups(r.items), () => setGroups([])), []);
  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-heading-28">신고 처리</h1>
      <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2" role="group" aria-label="신고 상태">
            {(["all", "pending", "actioned", "dismissed"] as const).map((k) => (
              <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)} className={cx("h-8 rounded-full px-3 text-caption-12", filter === k ? "bg-raised text-text" : "bg-surface text-muted hover:bg-hover")}>
                {k === "all" ? "전체" : REPORT_CHIP[k]}
              </button>
            ))}
          </div>
          {groups?.length === 0 && <p className="text-body-16 text-muted">신고가 없어요</p>}
          {groups?.filter((g) => filter === "all" || g.status === filter).map((g) => (
            <button
              key={g.userId}
              onClick={() => setSelected(g.userId)}
              className={cx("flex flex-col gap-0.5 rounded-lg px-4 py-3 text-left text-body-16", selected === g.userId ? "bg-raised" : "bg-surface hover:bg-hover")}
            >
              <span className="flex justify-between">
                <b>{g.nickname}</b>
                <span className={g.status === "pending" ? "text-text" : "text-subtle"}>{REPORT_CHIP[g.status]}</span>
              </span>
              <span className="text-caption-12 text-subtle">
                신고 {g.count}건 · {REPORT_REASONS[g.latestReason]} · {formatTime(g.firstAt)}부터
              </span>
            </button>
          ))}
        </div>
        {selected ? <ReportDetail key={selected} userId={selected} onChanged={loadGroups} /> : <p className="text-body-16 text-muted">왼쪽에서 대상을 골라 주세요</p>}
      </div>
    </div>
  );
}

function ReportDetail({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const load = useCallback(() => apiFetch(moderationApi.adminReportDetail, undefined, { userId }).then(setD, (e) => setError(e instanceof ApiError ? e.message : "불러오지 못했어요")), [userId]);
  useEffect(() => {
    void load();
  }, [load]);
  const refusal = useSanctionGuard(d?.user ?? { uid: "", nickname: "", email: null, grade: "", seedKind: null, isAdmin: false, masked: false, suspended: false, chatBannedUntil: null, broadcastBannedUntil: null });

  if (error) return <p className="text-body-16 text-danger">{error}</p>;
  if (!d) return <p className="text-body-16 text-muted">불러오는 중…</p>;

  const done = () => {
    void load();
    onChanged();
  };
  async function resolve(body: { action: "hide" | "dismiss"; reportId?: string }) {
    try {
      await apiFetch(moderationApi.adminResolve, { ...body, reason }, { userId });
      toast.success(body.action === "dismiss" ? "기각했어요" : "조치했어요");
      setReason("");
      done();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    }
  }
  const pending = d.reports.some((r) => r.status === "pending");

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-lg bg-surface p-4">
        <p className="text-heading-16">
          {d.user.nickname} <span className="text-caption-12 text-subtle">{d.user.grade}</span>
        </p>
        <p className="text-caption-12 text-subtle">받은 신고 {d.reports.length}건 · 지난 제재 {d.sanctions.length}건</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-heading-16">신고 목록</h2>
        {d.reports.map((r) => (
          <div key={r.id} className="flex flex-col gap-1 rounded-lg bg-surface p-4 text-body-16">
            <p className="break-words">{r.targetLabel}</p>
            <p className="text-caption-12 text-subtle">
              {REPORT_REASONS[r.reason]}
              {r.detail && ` · ${r.detail}`} · 신고자 {r.reporterNickname} · {formatTime(r.createdAt)} · {REPORT_STATUS_LABEL[r.status]}
            </p>
            {pending && r.canHide && (
              <button onClick={() => resolve({ action: "hide", reportId: r.id })} disabled={!reason.trim()} className="w-fit text-caption-12 text-text underline disabled:opacity-40">
                {r.targetType === "chat" ? "이 채팅만 숨기기" : "이 방송 강제 종료"}
              </button>
            )}
          </div>
        ))}
      </section>

      {pending && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-lg bg-surface p-4">
            <h3 className="text-heading-16">콘텐츠 숨기기 · 기각</h3>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유 (필수)" aria-label="처리 사유" />
            <p className="text-caption-12 text-subtle">사유를 적으면 위 신고의 “숨기기” 링크와 아래 “기각”을 쓸 수 있어요.</p>
            <Button variant="secondary" disabled={!reason.trim()} onClick={() => resolve({ action: "dismiss" })}>
              기각
            </Button>
          </div>
          <SanctionForm
            user={d.user}
            onDone={done}
            submit={(v) => apiFetch(moderationApi.adminResolve, { action: "sanction", reason: v.reason, sanction: { kind: v.kind, days: v.days } }, { userId })}
          />
        </section>
      )}
      {!pending && refusal && <p className="text-caption-12 text-subtle">{refusal}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-heading-16">지난 제재</h2>
        <SanctionList items={d.sanctions} onDone={done} />
      </section>
    </div>
  );
}

// 운영자 틀은 layout.tsx 대신 각 화면이 둘러싼다. 레이아웃이 둘 이상이면 Next 개발 서버가 만드는 타입 파일이 타입 검사를 깨뜨린다.
export default function AdminReportsPage() {
  return (
    <AdminGate>
      <AdminReportsPageBody />
    </AdminGate>
  );
}
