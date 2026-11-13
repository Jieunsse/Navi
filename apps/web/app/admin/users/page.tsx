"use client";
import type { ApiRes } from "@nabi/shared";
import { SEED_KIND_LABEL } from "@nabi/shared/seed.ts";
import { settlementApi } from "@nabi/shared/settlement.ts";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fail } from "@/features/admin/adminUi";
import { SanctionForm, useSanctionGuard } from "@/features/admin/SanctionForm";
import { SanctionList } from "@/features/admin/SanctionList";
import { AdminGate } from "@/features/admin/AdminGate";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { Button, cx, Input } from "@/shared/ui";

type Detail = ApiRes<typeof moderationApi.adminUserDetail>;

function AdminUsersPageBody() {
  const [users, setUsers] = useState<ApiRes<typeof moderationApi.adminUsers>["items"] | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    void apiFetch(moderationApi.adminUsers).then((r) => setUsers(r.items), () => setUsers([]));
  }, []);
  const shown = users?.filter((u) => `${u.nickname} ${u.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-heading-28">회원 관리</h1>
      <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-6">
        <div className="flex flex-col gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임이나 이메일로 찾기" aria-label="회원 검색" />
          {shown?.map((u) => (
            <button key={u.uid} onClick={() => setSelected(u.uid)} className={cx("flex flex-col rounded-lg px-4 py-3 text-left text-body-16", selected === u.uid ? "bg-raised" : "bg-surface hover:bg-hover")}>
              <span className="flex justify-between">
                <b>{u.nickname}</b>
                {u.suspended && <span className="text-danger">정지</span>}
              </span>
              <span className="text-caption-12 text-subtle">
                {u.email ?? "이메일 가림"} · {u.seedKind ? (SEED_KIND_LABEL[u.seedKind] ?? "테스트") : "일반"}
              </span>
            </button>
          ))}
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
      <Extra d={d} onDone={load} />
      <SanctionForm user={u} onDone={load} />
      <section className="flex flex-col gap-2">
        <h2 className="text-heading-16">제재 이력</h2>
        <SanctionList items={d.sanctions} onDone={load} />
      </section>
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
      <AdminUsersPageBody />
    </AdminGate>
  );
}
