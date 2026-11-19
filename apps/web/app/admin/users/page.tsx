"use client";
import type { ApiRes } from "@nabi/shared";
import { SEED_KIND_LABEL } from "@nabi/shared/seed.ts";
import { settlementApi } from "@nabi/shared/settlement.ts";
import { moderationApi, USER_FILTERS } from "@nabi/shared/moderation.ts";
import { Suspense, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminTable, fail, MoreButton, PageHead, useUrlState } from "@/features/admin/adminUi";
import { SanctionForm, useSanctionGuard } from "@/features/admin/SanctionForm";
import { SanctionList } from "@/features/admin/SanctionList";
import { AdminGate } from "@/features/admin/AdminGate";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, cx, Input } from "@/shared/ui";

type Detail = ApiRes<typeof moderationApi.adminUserDetail>;
type Row = ApiRes<typeof moderationApi.adminUsers>["items"][number];
type Filter = (typeof USER_FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = { sanctioned: "제재 중", held: "정산 보류", reported: "신고 받음", test: "테스트 계정" };

/** 지금 걸려 있는 제재 중 가장 무거운 것 하나. */
function statusOf(u: Row) {
  const now = Date.now();
  if (u.suspended) return "정지";
  if (u.chatBannedUntil && Date.parse(u.chatBannedUntil) > now) return "채팅 금지";
  if (u.broadcastBannedUntil && Date.parse(u.broadcastBannedUntil) > now) return "방송 금지";
  return "일반";
}

function AdminUsersPageBody() {
  const url = useUrlState();
  const urlQ = url.get("q");
  const filter = url.get("filter") as Filter | "";
  const selected = url.get("id");
  const [text, setText] = useState(urlQ);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  // 검색어나 필터가 바뀌면 그리는 중에 목록을 '불러오는 중'으로 되돌린다(effect 안 setState 대신).
  const [loadedFor, setLoadedFor] = useState(`${urlQ}|${filter}`);
  if (loadedFor !== `${urlQ}|${filter}`) {
    setLoadedFor(`${urlQ}|${filter}`);
    setRows(null);
  }

  // 입력이 멈추고 0.3초 뒤에 주소의 검색어를 바꾼다.
  useEffect(() => {
    if (text === urlQ) return;
    const t = setTimeout(() => url.set({ q: text.trim() || null }), 300);
    return () => clearTimeout(t);
  }, [text, urlQ, url]);

  useEffect(() => {
    let stale = false;
    apiFetch(moderationApi.adminUsers, { q: urlQ, filter: filter || undefined }).then(
      (r) => !stale && (setRows(r.items), setNext(r.next)),
      () => !stale && (setRows([]), setNext(null)),
    );
    return () => {
      stale = true;
    };
  }, [urlQ, filter]);

  async function loadMore() {
    setMore(true);
    try {
      const r = await apiFetch(moderationApi.adminUsers, { q: urlQ, filter: filter || undefined, cursor: next ?? undefined });
      setRows((p) => [...(p ?? []), ...r.items]);
      setNext(r.next);
    } catch (e) {
      fail(e);
    } finally {
      setMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHead title="회원 관리" />
      <div className="grid grid-cols-[minmax(0,560px)_minmax(0,1fr)] items-start gap-6">
        <div className="flex flex-col gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="닉네임 앞부분, 이메일, 회원 ID로 찾기" aria-label="회원 검색" />
          <div className="flex flex-wrap gap-2" role="group" aria-label="회원 걸러 보기">
            {(["", ...USER_FILTERS] as const).map((k) => (
              <button key={k} aria-pressed={filter === k} onClick={() => url.set({ filter: k || null })} className={cx("h-8 rounded-full px-3 text-caption-12", filter === k ? "bg-raised text-text" : "bg-surface text-muted hover:bg-hover")}>
                {k ? FILTER_LABEL[k] : "전체"}
              </button>
            ))}
          </div>
          {urlQ && <p className="text-caption-12 text-subtle">검색 중에는 걸러 보기가 적용되지 않아요</p>}
          {rows === null ? (
            <p className="text-body-16 text-muted">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="text-body-16 text-muted">찾는 회원이 없어요</p>
          ) : (
            <AdminTable
              cols="1.4fr 1.4fr 0.9fr 0.8fr 0.7fr"
              head={["닉네임", "이메일", "가입일", "상태", "구분"]}
              rows={rows}
              rowKey={(u) => u.uid}
              selected={selected}
              onSelect={(u) => url.set({ id: u.uid })}
              cells={(u) => [
                <>
                  <b>{u.nickname}</b>
                  {u.formerNickname && <span className="block text-caption-12 text-subtle">예전 닉네임: {u.formerNickname}</span>}
                </>,
                u.email ?? "이메일 가림",
                u.createdAt ? formatTime(u.createdAt) : "-",
                statusOf(u),
                u.seedKind ? (SEED_KIND_LABEL[u.seedKind] ?? "테스트") : "일반",
              ]}
            />
          )}
          <MoreButton next={next} loading={more} onMore={() => void loadMore()} />
        </div>
        {selected ? <UserDetail key={selected} uid={selected} /> : <p className="text-body-16 text-muted">왼쪽에서 회원을 골라 주세요</p>}
      </div>
    </div>
  );
}

function UserDetail({ uid }: { uid: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => apiFetch(moderationApi.adminUserDetail, undefined, { userId: uid }).then(setD, (e) => setError(e instanceof ApiError ? e.message : "불러오지 못했어요")), [uid]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <p className="text-body-16 text-danger">{error}</p>;
  if (!d) return <p className="text-body-16 text-muted">불러오는 중…</p>;
  const u = d.user;
  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-lg bg-surface p-4 text-body-16">
        <p className="text-heading-16">{u.nickname}</p>
        <p className="text-caption-12 text-subtle">
          {u.email} · 등급 {u.grade} · 받은 신고 {d.reportCount}건
        </p>
        {u.chatBannedUntil && <p className="text-caption-12 text-danger">채팅 금지 {formatTime(u.chatBannedUntil)}까지</p>}
        {u.broadcastBannedUntil && <p className="text-caption-12 text-danger">방송 금지 {formatTime(u.broadcastBannedUntil)}까지</p>}
        {u.suspended && <p className="text-caption-12 text-danger">영구 정지</p>}
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-heading-16">제재 이력</h2>
        <SanctionList items={d.sanctions} onDone={load} />
      </section>
      <SanctionForm user={u} onDone={load} />
      <Extra d={d} onDone={load} />
    </div>
  );
}

const honey = (n: number) => `${n.toLocaleString("ko-KR")}꿀`;

/** 꿀 잔액, 받은 후원, 정산 정보, 본인인증, 같은 명의 후원과 정산 보류(O-13). 심사용 테스트 계정이면 보류 버튼이 눌리지 않는다. */
function Extra({ d, onDone }: { d: Detail; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const refusal = useSanctionGuard(d.user);
  const x = d.extra;

  async function hold() {
    setBusy(true);
    try {
      await apiFetch(settlementApi.adminHold, { reason }, { userId: d.user.uid });
      toast.success("정산을 보류했어요");
      setReason("");
      onDone();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg bg-surface p-4 text-body-16">
      <h2 className="text-heading-16">꿀과 정산</h2>
      <p>꿀 잔액 {honey(x.honeyBalance)}</p>
      <p>
        받은 후원 {x.receivedDonationCount}건 · 전달된 꿀 {honey(x.receivedHoney)}
      </p>
      <p>
        정산 정보 {x.hasPayoutAccount ? "있음" : "없음"} · 본인인증 {x.identityVerified ? "완료" : "안 함"}
        {x.settlementHold && <span className="text-danger"> · 정산 보류 중</span>}
      </p>
      {x.sameIdentityDonations.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-caption-12 text-danger">같은 명의 후원 {x.sameIdentityDonations.length}건</p>
          {x.sameIdentityDonations.map((s) => (
            <p key={s.id} className="text-caption-12 text-subtle">
              {formatTime(s.createdAt)} · {s.broadcastTitle} · {honey(s.amount)}
            </p>
          ))}
        </div>
      )}
      {!x.settlementHold && (
        <div className="flex gap-2">
          <Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="정산 보류 사유 (필수)" aria-label="정산 보류 사유" />
          <Button variant="danger" className="shrink-0" loading={busy} disabled={!!refusal || !reason.trim()} onClick={() => void hold()}>
            정산 보류
          </Button>
        </div>
      )}
      {!x.settlementHold && refusal && <p className="text-caption-12 text-danger">{refusal}</p>}
    </section>
  );
}

// 운영자 틀은 layout.tsx 대신 각 화면이 둘러싼다. 레이아웃이 둘 이상이면 Next 개발 서버가 만드는 타입 파일이 타입 검사를 깨뜨린다.
export default function AdminUsersPage() {
  return (
    <AdminGate>
      <Suspense>
        <AdminUsersPageBody />
      </Suspense>
    </AdminGate>
  );
}
