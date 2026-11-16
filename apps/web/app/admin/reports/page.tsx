"use client";
import type { ApiRes } from "@nabi/shared";
import { moderationApi, REPORT_REASONS, REPORT_STATUS_LABEL } from "@nabi/shared/moderation.ts";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { SanctionForm, useSanctionGuard } from "@/features/admin/SanctionForm";
import { SanctionList } from "@/features/admin/SanctionList";
import { AdminGate } from "@/features/admin/AdminGate";
import { AdminTable, fail, MoreButton, PageHead, useUrlState } from "@/features/admin/adminUi";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, Input, Tabs } from "@/shared/ui";

type Status = "pending" | "actioned" | "dismissed";
type List = ApiRes<typeof moderationApi.adminReports>;
type Detail = ApiRes<typeof moderationApi.adminReportDetail>;

function AdminReportsPageBody() {
  const url = useUrlState();
  const status = (["actioned", "dismissed"] as const).find((k) => k === url.get("status")) ?? "pending";
  const selected = url.get("id");
  const [list, setList] = useState<List | null>(null);
  const [more, setMore] = useState(false);
  const load = useCallback(() => apiFetch(moderationApi.adminReports, { status }).then(setList, (e) => (fail(e), setList({ items: [], next: null, counts: { pending: 0 } }))), [status]);
  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!list?.next) return;
    setMore(true);
    try {
      const r = await apiFetch(moderationApi.adminReports, { status, cursor: list.next });
      setList({ ...r, items: [...list.items, ...r.items] });
    } catch (e) {
      fail(e);
    } finally {
      setMore(false);
    }
  }
  // 처리가 끝나면 방금 처리한 줄 아래 줄을(없으면 맨 위 줄을) 이어서 연다.
  function resolved(userId: string) {
    const rest = list?.items.filter((g) => g.userId !== userId) ?? [];
    const at = list?.items.findIndex((g) => g.userId === userId) ?? -1;
    if (status === "pending") url.set({ id: (rest[at] ?? rest[0])?.userId ?? null });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHead title="신고 처리" />
      <Tabs
        label="신고 상태"
        value={status}
        onChange={(v: Status) => url.set({ status: v === "pending" ? null : v, id: null })}
        items={[
          { value: "pending", label: `처리 대기${list ? ` ${list.counts.pending}` : ""}` },
          { value: "actioned", label: "조치함" },
          { value: "dismissed", label: "기각" },
        ]}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-6">
        <div className="flex flex-col gap-3">
          {list?.items.length === 0 && <p className="text-body-16 text-muted">신고가 없어요</p>}
          {!!list?.items.length && (
            <AdminTable
              cols="minmax(0,1.4fr) 48px minmax(0,1.2fr) minmax(0,1fr)"
              head={["대상", "대기", "최근 사유", "처음 신고"]}
              rows={list.items}
              rowKey={(g) => g.userId}
              selected={selected}
              onSelect={(g) => url.set({ id: g.userId })}
              cells={(g) => [<b key="n">{g.nickname}</b>, g.pendingCount, REPORT_REASONS[g.latestReason], g.firstPendingAt ? formatTime(g.firstPendingAt) : "-"]}
            />
          )}
          <MoreButton next={list?.next} loading={more} onMore={loadMore} />
        </div>
        {selected ? <ReportDetail key={selected} userId={selected} onChanged={load} onResolved={() => resolved(selected)} /> : <p className="text-body-16 text-muted">왼쪽에서 대상을 골라 주세요</p>}
      </div>
    </div>
  );
}

function ReportDetail({ userId, onChanged, onResolved }: { userId: string; onChanged: () => void; onResolved: () => void }) {
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

  const done = (resolved?: boolean) => {
    void load();
    onChanged();
    if (resolved) onResolved();
  };
  async function resolve(body: { action: "hide" | "dismiss"; reportId?: string }) {
    try {
      await apiFetch(moderationApi.adminResolve, { ...body, reason }, { userId });
      toast.success(body.action === "dismiss" ? "기각했어요" : "조치했어요");
      setReason("");
      done(true);
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
            onDone={() => done(true)}
            submit={(v) => apiFetch(moderationApi.adminResolve, { action: "sanction", reason: v.reason, sanction: { kind: v.kind, days: v.days } }, { userId })}
          />
        </section>
      )}
      {!pending && refusal && <p className="text-caption-12 text-subtle">{refusal}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-heading-16">지난 제재</h2>
        <SanctionList items={d.sanctions} onDone={() => done()} />
      </section>
    </div>
  );
}

// 운영자 틀은 layout.tsx 대신 각 화면이 둘러싼다. 레이아웃이 둘 이상이면 Next 개발 서버가 만드는 타입 파일이 타입 검사를 깨뜨린다.
export default function AdminReportsPage() {
  return (
    <AdminGate>
      <Suspense>
        <AdminReportsPageBody />
      </Suspense>
    </AdminGate>
  );
}
