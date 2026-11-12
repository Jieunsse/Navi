"use client";
import type { ApiRes } from "@nabi/shared";
import { moderationApi } from "@nabi/shared/moderation.ts";
import { useCallback, useEffect, useState } from "react";
import { SanctionForm } from "@/features/admin/SanctionForm";
import { SanctionList } from "@/features/admin/SanctionList";
import { AdminGate } from "@/features/admin/AdminGate";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatTime } from "@/shared/lib/format";
import { cx, Input } from "@/shared/ui";

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
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">회원과 제재</h1>
      <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-6">
        <div className="flex flex-col gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임이나 이메일로 찾기" aria-label="회원 검색" />
          {shown?.map((u) => (
            <button key={u.uid} onClick={() => setSelected(u.uid)} className={cx("flex flex-col rounded-lg border px-3 py-2 text-left text-sm", selected === u.uid ? "border-accent" : "border-line hover:bg-surface-2")}>
              <span className="flex justify-between">
                <b>{u.nickname}</b>
                {u.suspended && <span className="text-danger">정지</span>}
              </span>
              <span className="text-xs text-muted">
                {u.email ?? "이메일 가림"} · {u.seedKind ?? "일반"}
              </span>
            </button>
          ))}
        </div>
        {selected ? <UserDetail key={selected} uid={selected} /> : <p className="text-sm text-muted">왼쪽에서 회원을 골라 주세요</p>}
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
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!d) return <p className="text-sm text-muted">불러오는 중…</p>;
  const u = d.user;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-line bg-surface p-4 text-sm">
        <p className="font-bold">{u.nickname}</p>
        <p className="text-xs text-muted">
          {u.email} · 등급 {u.grade} · 받은 신고 {d.reportCount}건
        </p>
        {u.chatBannedUntil && <p className="text-xs text-danger">채팅 금지 {formatTime(u.chatBannedUntil)}까지</p>}
        {u.broadcastBannedUntil && <p className="text-xs text-danger">방송 금지 {formatTime(u.broadcastBannedUntil)}까지</p>}
        {u.suspended && <p className="text-xs text-danger">영구 정지</p>}
      </div>
      <SanctionForm user={u} onDone={load} />
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">제재 이력</h2>
        <SanctionList items={d.sanctions} onDone={load} />
      </section>
    </div>
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
