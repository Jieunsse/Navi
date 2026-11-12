"use client";
import { chatApi, chatItemSchema, CHAT_MAX, type ChatItem } from "@nabi/shared/chat.ts";
import { collection, getDocs, limit, orderBy, query, Timestamp } from "firebase/firestore";
import { RoomEvent, type Room } from "livekit-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/shared/api/apiFetch";
import { firestore } from "@/shared/lib/firebase";
import { loginHref, useSession } from "@/entities/session/session";
import { UserSheet } from "@/features/moderation/UserSheet";
import { Button, cx, Input } from "@/shared/ui";

type Props = { broadcastId: string; ownerId: string; status: "ready" | "live" | "ended"; room: Room | null };

const KEEP = 300; // 화면에 들고 있는 최대 개수
const TOPICS = new Set(["chat", "donation", "mission"]);
// 미션 상태 이름은 후원 쪽 코드와 맞춰야 한다. 모르는 값은 그대로 보여준다.
const MISSION_LABEL: Record<string, string> = {
  pending: "대기 중",
  active: "진행 중",
  rejected: "거절됨",
  success: "성공",
  failed: "실패",
  canceled: "취소됨",
};

const keyOf = (i: ChatItem) => i.messageId || `${i.kind}:${i.createdAt}:${i.authorNickname}`;
const draftKey = (id: string) => `nabi-chat-draft:${id}`;
const store = {
  get: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      if (v) sessionStorage.setItem(k, v);
      else sessionStorage.removeItem(k);
    } catch {}
  },
};

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : v == null ? undefined : String(v));

export function ChatPanel({ broadcastId, ownerId, status, room }: Props) {
  const { me } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<Map<string, ChatItem>>(new Map());
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null); // 채팅 금지, 활동 제한이면 서버가 준 안내
  const [picked, setPicked] = useState<ChatItem | null>(null);
  const textRef = useRef(""); // 보내는 동안 새로 친 글자를 지우지 않으려고 최신 값을 따로 들고 있다
  const pending = useRef<{ id: string; content: string } | null>(null); // 네트워크 실패 뒤 같은 번호로 다시 보내려고 기억한다
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const ended = status === "ended";

  const add = useCallback((incoming: ChatItem[]) => {
    setItems((prev) => {
      const next = new Map(prev);
      for (const i of incoming) next.set(keyOf(i), i); // 같은 번호는 덮어쓴다(미션 상태 변화)
      if (next.size <= KEEP) return next;
      const sorted = [...next].sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt));
      return new Map(sorted.slice(sorted.length - KEEP));
    });
  }, []);

  // 최근 50개를 Firestore에서 읽는다. 방이 바뀌거나 다시 연결될 때 다시 불러와 빠진 것을 채운다.
  const load = useCallback(async () => {
    const snap = await getDocs(query(collection(firestore, "broadcasts", broadcastId, "comments"), orderBy("createdAt", "desc"), limit(50))).catch(() => null);
    if (!snap) return [];
    const out: ChatItem[] = [];
    for (const d of snap.docs) {
      const x = d.data();
      const p = chatItemSchema.safeParse({ ...x, messageId: x.messageId ?? d.id, kind: x.kind ?? "chat", createdAt: iso(x.createdAt), deadlineAt: iso(x.deadlineAt) });
      if (p.success) out.push(p.data);
    }
    return out;
  }, [broadcastId]);

  useEffect(() => {
    void load().then(add);
  }, [load, add, room]);

  useEffect(() => {
    if (!room || ended) return;
    const onData = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (!topic || !TOPICS.has(topic)) return;
      try {
        const p = chatItemSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
        if (p.success) add([p.data]);
      } catch {}
    };
    const onReconnected = () => void load().then(add);
    room.on(RoomEvent.DataReceived, onData).on(RoomEvent.Reconnected, onReconnected);
    return () => {
      room.off(RoomEvent.DataReceived, onData).off(RoomEvent.Reconnected, onReconnected);
    };
  }, [room, ended, add, load]);

  // 쓰던 내용은 sessionStorage에 남겨 로그인하고 돌아와도 채운다.
  useEffect(() => {
    const d = store.get(draftKey(broadcastId));
    if (d) {
      textRef.current = d;
      setText(d); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [broadcastId]);

  const sorted = [...items.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  const change = (v: string) => {
    textRef.current = v;
    setText(v);
    setError(null);
    store.set(draftKey(broadcastId), v);
  };

  const toLogin = () => router.push(loginHref(`/live/${broadcastId}`));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!me) return toLogin();
    const content = text.trim();
    if (!content || sending) return;
    if (pending.current?.content !== content) pending.current = { id: crypto.randomUUID(), content };
    setSending(true);
    setError(null);
    try {
      const item = await apiFetch(chatApi.sendChat, { messageId: pending.current.id, content }, { id: broadcastId });
      pending.current = null;
      stick.current = true;
      add([item]);
      // 보내는 사이에 글자를 더 쳤으면 그대로 둔다(4-7). 같은 글자일 때만 비운다.
      if (textRef.current.trim() === content) change("");
    } catch (err) {
      // 도배 거절이면 쓰던 내용을 그대로 둔다. 다시 보낼 때는 새 번호를 쓴다.
      if (err instanceof ApiError && err.code !== "NETWORK") pending.current = null;
      if (err instanceof ApiError && ["CHAT_BANNED", "OWNER_BAN", "SUSPENDED"].includes(err.code)) setBlocked(err.message);
      setError(err instanceof ApiError ? err.message : "잠시 뒤에 다시 시도해 주세요");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex h-full min-h-80 flex-col rounded-lg border border-line bg-surface" aria-label="채팅">
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 space-y-2 overflow-y-auto p-3"
        aria-live="polite"
      >
        {sorted.length === 0 && <p className="py-6 text-center text-sm text-muted">아직 채팅이 없어요</p>}
        {sorted.map((i) => (
          <Row key={keyOf(i)} item={i} ownerId={ownerId} mine={!!me && i.authorId === me.uid} onPick={() => (me ? setPicked(i) : toLogin())} />
        ))}
      </div>

      <form onSubmit={submit} className="border-t border-line p-3">
        {ended ? (
          <p className="py-2 text-center text-sm text-muted">방송이 끝나 채팅을 쓸 수 없어요</p>
        ) : (
          <>
            <div className="flex gap-2">
              <Input
                value={text}
                maxLength={CHAT_MAX}
                onChange={(e) => change(e.target.value)}
                onFocus={() => !me && toLogin()}
                disabled={!!blocked}
                placeholder={blocked ?? (me ? "채팅을 입력해 주세요" : "로그인하고 채팅에 참여해 보세요")}
                aria-label="채팅 입력"
                aria-describedby={error ? "chat-error" : undefined}
                invalid={!!error}
                className="min-w-0 flex-1"
              />
              <Button type="submit" loading={sending} disabled={!!blocked || (!!me && !text.trim())} className="h-11 shrink-0">
                보내기
              </Button>
            </div>
            <div className="mt-1 flex justify-between text-xs">
              <span id="chat-error" role="alert" className="text-danger">
                {error}
              </span>
              <span className="text-muted">
                {text.length}/{CHAT_MAX}
              </span>
            </div>
          </>
        )}
      </form>
      {picked && <UserSheet item={picked} broadcastId={broadcastId} isOwner={me?.uid === ownerId} onClose={() => setPicked(null)} />}
    </section>
  );
}

function Row({ item: i, ownerId, mine, onPick }: { item: ChatItem; ownerId: string; mine: boolean; onPick: () => void }) {
  const host = i.isHost || (!!i.authorId && i.authorId === ownerId);
  const name = (
    <span className="mr-1.5 inline-flex items-center gap-1 align-baseline">
      {mine ? (
        <span className="font-semibold text-text">{i.authorNickname}</span>
      ) : (
        <button type="button" onClick={onPick} className="font-semibold text-text hover:underline">
          {i.authorNickname}
        </button>
      )}
      {host && <span className="rounded bg-accent px-1 text-[10px] font-bold text-accent-ink">방송자</span>}
      {i.authorGrade && <span className="text-[11px] text-muted">{i.authorGrade}</span>}
    </span>
  );

  if (i.kind === "donation" || i.kind === "mission") {
    return (
      <div className={cx("rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm break-words")}>
        <div className="flex items-center justify-between gap-2">
          <span>{name}</span>
          {i.amount != null && <span className="font-bold text-accent">{i.amount.toLocaleString()}꿀</span>}
        </div>
        {i.kind === "mission" && (
          <p className="mt-1">
            <span className="mr-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
              미션{i.missionStatus ? ` · ${MISSION_LABEL[i.missionStatus] ?? i.missionStatus}` : ""}
            </span>
            {i.missionContent}
          </p>
        )}
        {i.hidden ? <Hidden /> : i.content && <p className="mt-1 text-text">{i.content}</p>}
      </div>
    );
  }
  return (
    <p className="text-sm break-words text-muted">
      {name}
      {i.hidden ? <Hidden /> : <span className="text-text">{i.content}</span>}
    </p>
  );
}

const Hidden = () => <span className="text-muted italic">부적절한 표현이 감지되어 숨긴 채팅이에요</span>;
