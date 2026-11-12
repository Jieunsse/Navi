"use client";
import { chatItemSchema } from "@nabi/shared/chat.ts";
import { cheerAmount, honeyApi, MISSION_STATUS_LABEL, missionStatusSchema, type MissionCard } from "@nabi/shared/honey.ts";
import { RoomEvent, type Room } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { formatElapsed } from "@/shared/lib/format";
import { Button, cx } from "@/shared/ui";

const won = (n: number) => n.toLocaleString("ko-KR");
const order = { active: 0, pending: 1 } as Record<string, number>;

/** 송출 화면의 미션 목록(4-8). 수락·거절, 남은 시간, 성공·실패. 상태가 바뀌면 LiveKit으로 새로 받는다. */
export function MissionList({ broadcastId, room }: { broadcastId: string; room: Room | null }) {
  const [items, setItems] = useState<Map<string, MissionCard>>(new Map());
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const expired = useRef(new Set<string>());

  const load = useCallback(async () => {
    const r = await apiFetch(honeyApi.listMissions, undefined, { id: broadcastId }).catch(() => null);
    if (r) setItems(new Map(r.items.map((i) => [i.id, i])));
  }, [broadcastId]);

  useEffect(() => {
    void apiFetch(honeyApi.listMissions, undefined, { id: broadcastId }).then((r) => setItems(new Map(r.items.map((i) => [i.id, i]))), () => undefined);
  }, [broadcastId]);

  useEffect(() => {
    if (!room) return;
    const onData = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic !== "mission") return;
      try {
        const p = chatItemSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
        const st = p.success ? missionStatusSchema.safeParse(p.data.missionStatus) : null;
        if (!p.success || !st?.success || p.data.amount == null) return;
        const d = p.data;
        setItems((prev) => {
          const next = new Map(prev);
          const old = prev.get(d.messageId);
          next.set(d.messageId, {
            id: d.messageId,
            content: d.missionContent ?? "",
            amount: d.amount!,
            cheer: cheerAmount(d.amount!),
            status: st.data,
            donor: d.authorNickname,
            limitMinutes: old?.limitMinutes ?? 0,
            deadlineAt: d.deadlineAt ?? null,
            createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
          });
          return next;
        });
      } catch {}
    };
    const onReconnected = () => void load();
    room.on(RoomEvent.DataReceived, onData).on(RoomEvent.Reconnected, onReconnected);
    return () => {
      room.off(RoomEvent.DataReceived, onData).off(RoomEvent.Reconnected, onReconnected);
    };
  }, [room, load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // 남은 시간이 0이 되면 서버에 마감 처리를 요청한다. 서버가 마감 시각을 확인한다(결정 27).
  useEffect(() => {
    for (const m of items.values()) {
      if (m.status !== "active" || !m.deadlineAt || expired.current.has(m.id) || now < new Date(m.deadlineAt).getTime()) continue;
      expired.current.add(m.id);
      void apiFetch(honeyApi.missionAction, undefined, { id: broadcastId, missionId: m.id, action: "expire" }).then(load, () => expired.current.delete(m.id));
    }
  }, [items, now, broadcastId, load]);

  async function act(id: string, action: "accept" | "reject" | "success" | "fail") {
    setBusy(id);
    try {
      const r = await apiFetch(honeyApi.missionAction, undefined, { id: broadcastId, missionId: id, action });
      if (action === "success" && r.status === "failed") toast.warning("제한 시간이 지나서 실패로 처리됐어요");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
    } finally {
      setBusy(null);
      await load();
    }
  }

  const list = [...items.values()].sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2) || a.createdAt.localeCompare(b.createdAt));

  return (
    <section className="flex min-h-full flex-col gap-2 p-2" aria-label="미션 목록">
      {list.length === 0 && <p className="m-auto text-body-16 text-subtle">받은 미션이 없어요</p>}
      {list.map((m) => {
        const left = m.deadlineAt ? new Date(m.deadlineAt).getTime() - now : null;
        const open = m.status === "pending" || m.status === "active";
        return (
          <div key={m.id} className={cx("flex flex-col gap-2 rounded-md border bg-raised p-3", open ? "border-live" : "border-line opacity-70")}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cx("shrink-0 rounded-xs px-2 py-0.5 text-badge-12", open ? "bg-live-bg text-live-ink" : "bg-surface text-muted")}>{MISSION_STATUS_LABEL[m.status]}</span>
                <span className="truncate text-caption-12 text-muted">{m.donor}</span>
              </div>
              <span className="shrink-0 text-number-12 text-live-ink">{won(m.amount)}꿀</span>
            </div>
            <p className="break-words text-body-16">{m.content}</p>
            <p className="text-caption-12 text-muted">
              {m.limitMinutes > 0 && m.status === "pending" && `제한 시간 ${m.limitMinutes}분 · `}
              {left !== null && m.status === "active" && `남은 시간 ${left > 0 ? formatElapsed(left) : "00:00:00"} · `}
              실패 시 응원금 {won(m.cheer)}꿀
            </p>
            {m.status === "pending" && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" disabled={!!busy} onClick={() => void act(m.id, "reject")}>거절</Button>
                <Button size="sm" className="flex-1" loading={busy === m.id} disabled={!!busy} onClick={() => void act(m.id, "accept")}>수락</Button>
              </div>
            )}
            {m.status === "active" && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" disabled={!!busy} onClick={() => void act(m.id, "fail")}>실패</Button>
                <Button size="sm" className="flex-1" loading={busy === m.id} disabled={!!busy} onClick={() => void act(m.id, "success")}>성공</Button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
