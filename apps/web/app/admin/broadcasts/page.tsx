"use client";
import { adminOpsApi, type AdminBroadcast } from "@nabi/shared/adminOps.ts";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminGate } from "@/features/admin/AdminGate";
import { AdminTable, Card, fail, MoreButton, PageHead, useUrlState } from "@/features/admin/adminUi";
import { apiFetch } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, cx, EmptyState, Input, StatusBadge, Tabs } from "@/shared/ui";

type Tab = "live" | "ended" | "all";

function Detail({ b, onChanged }: { b: AdminBroadcast; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"end" | "replay" | null>(null);

  async function act(kind: "end" | "replay") {
    setBusy(kind);
    try {
      await apiFetch(kind === "replay" ? adminOpsApi.privateReplay : adminOpsApi.forceEndBroadcast, { reason }, { id: b.id });
      toast.success(kind === "replay" ? "다시보기를 비공개로 바꿨어요" : "방송을 끝냈어요");
      setReason("");
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const canEnd = b.status === "live";
  const canReplay = !!b.replayPublic;
  return (
    <Card>
      <div className="flex items-center gap-3">
        <StatusBadge status={b.status} />
        <Link href={`/live/${b.id}`} target="_blank" className="min-w-0 truncate text-heading-16 hover:underline">{b.title}</Link>
      </div>
      <p className="text-body-16">방송자 {b.ownerNickname}</p>
      <p className="text-caption-12 text-subtle">
        {formatTime(b.createdAt)} 만듦{b.startedAt && ` · ${formatTime(b.startedAt)} 시작`}{b.endedAt && ` · ${formatTime(b.endedAt)} 종료`}
      </p>
      <p className="text-caption-12 text-subtle">
        {b.status === "live" && `시청자 ${b.viewerCount}명 · `}
        <span className={cx(b.pendingReports > 0 && "text-danger")}>처리 안 된 신고 {b.pendingReports}건</span>
      </p>
      {(canEnd || canReplay) && (
        <div className="flex flex-col gap-2">
          <Input value={reason} maxLength={200} placeholder="사유 (운영 기록에 남아요)" aria-label="조치 사유" onChange={(e) => setReason(e.target.value)} />
          {canEnd && <Button variant="danger" loading={busy === "end"} disabled={!reason.trim() || !!busy} onClick={() => void act("end")}>강제 종료</Button>}
          {canReplay && <Button variant="danger" loading={busy === "replay"} disabled={!reason.trim() || !!busy} onClick={() => void act("replay")}>다시보기 비공개</Button>}
        </div>
      )}
    </Card>
  );
}

function Body() {
  const url = useUrlState();
  const status = (url.get("status") || "live") as Tab;
  const q = url.get("q");
  const id = url.get("id");
  const [text, setText] = useState(q);
  const [items, setItems] = useState<AdminBroadcast[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    () => apiFetch(adminOpsApi.adminBroadcasts, { status, q }).then((r) => {
      setItems(r.items);
      setNext(r.next);
      setLiveCount(r.counts.live);
    }, () => setItems([])),
    [status, q],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // 입력이 멈추고 0.3초 뒤에 주소의 검색어를 바꾼다
  useEffect(() => {
    if (text === q) return;
    const t = setTimeout(() => url.set({ q: text.trim() || null, id: null }), 300);
    return () => clearTimeout(t);
  }, [text, q, url]);

  async function loadMore() {
    setMore(true);
    try {
      const r = await apiFetch(adminOpsApi.adminBroadcasts, { status, q, cursor: next ?? undefined });
      setItems((prev) => [...(prev ?? []), ...r.items]);
      setNext(r.next);
    } catch (e) {
      fail(e);
    } finally {
      setMore(false);
    }
  }

  const selected = items?.find((b) => b.id === id);
  return (
    <div className="flex flex-col gap-6">
      <PageHead title="방송 관리" desc="방송 중인 방송은 사유를 적고 강제로 끝낼 수 있어요. 종료된 방송은 다시보기를 비공개로 바꿀 수 있어요. 두 조치 모두 방송자에게 알려요." />
      <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6">
        <div className="flex flex-col gap-3">
          <Tabs
            label="방송 상태"
            value={status}
            onChange={(v) => url.set({ status: v === "live" ? null : v, id: null })}
            items={[{ value: "live", label: liveCount == null ? "방송 중" : `방송 중 ${liveCount}` }, { value: "ended", label: "종료" }, { value: "all", label: "전체" }]}
          />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="방송자 닉네임이나 방송 제목으로 찾기" aria-label="방송 찾기" />
          {items?.length === 0 && <EmptyState title={q ? "찾는 방송이 없어요" : "방송이 없어요"} />}
          {items && items.length > 0 && (
            <AdminTable
              cols="56px minmax(0,1fr) 88px 96px 56px 56px"
              head={["상태", "제목", "방송자", "시작", "시청자", "대기 신고"]}
              rows={items}
              rowKey={(b) => b.id}
              selected={id}
              onSelect={(b) => url.set({ id: b.id })}
              cells={(b) => [
                <StatusBadge key="s" status={b.status} />,
                b.title,
                b.ownerNickname,
                formatTime(b.startedAt ?? b.createdAt),
                b.status === "live" ? `${b.viewerCount}명` : "-",
                <span key="r" className={cx(b.pendingReports > 0 && "text-danger")}>{b.pendingReports}건</span>,
              ]}
            />
          )}
          <MoreButton next={next} loading={more} onMore={() => void loadMore()} />
        </div>
        {selected ? <Detail key={selected.id} b={selected} onChanged={() => void load()} /> : <p className="text-body-16 text-muted">왼쪽에서 방송을 골라 주세요</p>}
      </div>
    </div>
  );
}

export default function AdminBroadcastsPage() {
  return (
    <AdminGate>
      <Suspense>
        <Body />
      </Suspense>
    </AdminGate>
  );
}
