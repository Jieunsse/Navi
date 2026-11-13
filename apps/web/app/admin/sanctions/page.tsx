"use client";
import type { ApiRes } from "@nabi/shared";
import { moderationApi, type AdminUser } from "@nabi/shared/moderation.ts";
import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/features/admin/AdminGate";
import { PageHead } from "@/features/admin/adminUi";
import { SanctionForm } from "@/features/admin/SanctionForm";
import { SanctionList } from "@/features/admin/SanctionList";
import { apiFetch } from "@/shared/api/apiFetch";
import { cx, Input } from "@/shared/ui";

type Items = ApiRes<typeof moderationApi.adminSanctions>["items"];

function Body() {
  const [items, setItems] = useState<Items | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<AdminUser | null>(null);
  const load = useCallback(() => apiFetch(moderationApi.adminSanctions).then((r) => setItems(r.items), () => setItems([])), []);
  useEffect(() => {
    void load();
    void apiFetch(moderationApi.adminUsers).then((r) => setUsers(r.items), () => setUsers([]));
  }, [load]);

  const key = q.trim().toLowerCase();
  const found = key ? users.filter((u) => `${u.nickname} ${u.email ?? ""}`.toLowerCase().includes(key)).slice(0, 8) : [];
  const active = items?.filter((s) => s.status === "active") ?? [];
  const past = items?.filter((s) => s.status !== "active") ?? [];
  const done = () => {
    setPicked(null);
    setQ("");
    void load();
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHead title="제재 관리" desc="사용자를 찾아 제재를 걸고 풀 수 있어요. 같은 종류의 제재가 겹치면 더 늦게 끝나는 쪽을 따라요." />
      <section className="flex max-w-xl flex-col gap-2">
        <h2 className="text-heading-16">제재 걸기</h2>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="닉네임이나 이메일로 찾기" aria-label="사용자 검색" />
        {found.map((u) => (
          <button key={u.uid} onClick={() => setPicked(u)} className={cx("flex flex-col rounded-lg px-4 py-3 text-left text-body-16", picked?.uid === u.uid ? "bg-raised" : "bg-surface hover:bg-hover")}>
            <b>{u.nickname}</b>
            <span className="text-caption-12 text-subtle">{u.email ?? "이메일 가림"}</span>
          </button>
        ))}
        {key && found.length === 0 && <p className="text-body-16 text-muted">찾는 사용자가 없어요</p>}
        {picked && (
          <>
            <p className="text-body-16">
              <b>{picked.nickname}</b>에게 제재를 걸어요
            </p>
            <SanctionForm key={picked.uid} user={picked} onDone={done} />
          </>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-heading-16">적용 중인 제재</h2>
        <SanctionList items={active} onDone={() => void load()} empty="적용 중인 제재가 없어요" />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-heading-16">지난 제재</h2>
        <SanctionList items={past} onDone={() => void load()} empty="지난 제재가 없어요" />
      </section>
    </div>
  );
}

export default function AdminSanctionsPage() {
  return (
    <AdminGate>
      <Body />
    </AdminGate>
  );
}
