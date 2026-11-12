"use client";
import { chatApi, chatItemSchema, CHAT_MAX, type ChatItem } from "@nabi/shared/chat.ts";
import { honeyApi } from "@nabi/shared/honey.ts";
import { collection, getDocs, limit, orderBy, query, Timestamp } from "firebase/firestore";
import { RoomEvent, type Room } from "livekit-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "@/shared/api/apiFetch";
import { firestore } from "@/shared/lib/firebase";
import { loginHref, useSession } from "@/entities/session/session";
import { UserSheet } from "@/features/moderation/UserSheet";
import { Avatar, Button, cx, GiftIcon, IconButton, SendHorizontalIcon } from "@/shared/ui";

type Props = {
  broadcastId: string;
  ownerId: string;
  status: "ready" | "live" | "ended";
  room: Room | null;
  /** 있으면 입력줄 왼쪽에 선물 버튼을 둔다(후원 창 열기). */
  onDonate?: () => void;
  /** 후원할 수 없는 이유. 주면 선물 버튼을 누를 수 없게 하고 이유를 보여준다(내 방송). */
  donateBlockedReason?: string;
  donationTotal?: number;
  /** 입력줄에 덧붙일 클래스(휴대폰 송출 화면은 입력줄을 숨긴다). */
  inputClassName?: string;
  /** 목록 위 제목줄을 숨긴다(송출 화면의 탭이 제목을 대신할 때). */
  hideHeader?: boolean;
  /** 제목줄 글자(기본 "채팅"). */
  title?: string;
};

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

export function ChatPanel({ broadcastId, ownerId, status, room, onDonate, donateBlockedReason, donationTotal, inputClassName, hideHeader, title = "채팅" }: Props) {
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

  // 진행 중인 미션의 마감 시각이 지나면 서버에 마감 처리를 요청한다. 서버가 시각을 확인하고, 바뀌면 LiveKit으로 새 상태가 온다(4-8).
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (ended) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const i of items.values()) {
      if (i.kind !== "mission" || i.missionStatus !== "active" || !i.deadlineAt || asked.current.has(i.messageId)) continue;
      const wait = Math.max(0, new Date(i.deadlineAt).getTime() - Date.now()) + 500; // 시계 차이를 감안해 조금 늦게 부른다
      timers.push(
        setTimeout(() => {
          asked.current.add(i.messageId);
          void apiFetch(honeyApi.missionAction, undefined, { id: broadcastId, missionId: i.messageId, action: "expire" }).catch(() => asked.current.delete(i.messageId));
        }, wait),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [items, ended, broadcastId]);

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
    <section className="flex h-full min-h-0 flex-col bg-surface" aria-label="채팅">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-heading-16">{title}</h2>
          {donationTotal !== undefined && <span className="text-number-12 text-muted">후원 합계 {donationTotal.toLocaleString()}꿀</span>}
        </div>
      )}
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2"
        aria-live="polite"
      >
        {sorted.length === 0 && <p className="m-auto text-body-16 text-subtle">아직 채팅이 없어요</p>}
        {sorted.map((i) => (
          <Row key={keyOf(i)} item={i} ownerId={ownerId} mine={!!me && i.authorId === me.uid} onPick={() => (me ? setPicked(i) : toLogin())} />
        ))}
      </div>

      <form onSubmit={submit} className={cx("border-t border-line p-3", inputClassName)}>
        {ended ? (
          <p className="py-2 text-center text-body-16 text-subtle">방송이 끝나 채팅을 쓸 수 없어요</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {onDonate && (
                <IconButton label="후원하기" onClick={onDonate} disabled={!!donateBlockedReason} title={donateBlockedReason}>
                  <GiftIcon size={20} />
                </IconButton>
              )}
              {me ? (
                <input
                  value={text}
                  maxLength={CHAT_MAX}
                  onChange={(e) => change(e.target.value)}
                  disabled={!!blocked}
                  placeholder={blocked ?? "채팅 보내기"}
                  aria-label="채팅 입력"
                  aria-describedby={error ? "chat-error" : undefined}
                  aria-invalid={!!error || undefined}
                  className={cx("h-10 min-w-0 flex-1 rounded-full border bg-raised px-4 text-body-16 outline-none placeholder:text-subtle disabled:cursor-not-allowed disabled:text-subtle", error ? "border-danger" : "border-transparent focus:border-[var(--color-focus-ring)]")}
                />
              ) : (
                <Button type="button" variant="secondary" className="min-w-0 flex-1" onClick={toLogin}>
                  로그인하고 채팅하기
                </Button>
              )}
              {me && (
                <IconButton label="보내기" type="submit" disabled={sending || !!blocked || !text.trim()}>
                  <SendHorizontalIcon size={20} />
                </IconButton>
              )}
            </div>
            {(error || text.length > 0) && (
              <div className="mt-1 flex justify-between text-caption-12">
                <span id="chat-error" role="alert" className="text-danger">
                  {error}
                </span>
                <span className="text-subtle">
                  {text.length}/{CHAT_MAX}
                </span>
              </div>
            )}
          </>
        )}
      </form>
      {picked && <UserSheet item={picked} broadcastId={broadcastId} isOwner={me?.uid === ownerId} onClose={() => setPicked(null)} />}
    </section>
  );
}

const ago = (iso?: string) => {
  const m = iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 60000) : 0;
  return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
};

/** 닉네임 옆 등급. 알 등급은 표시하지 않는다. */
function GradeBadge({ grade }: { grade?: string | null }) {
  if (!grade || grade === "알") return null;
  const tone = grade === "애벌레" ? "bg-raised text-success" : grade === "번데기" ? "border border-strong bg-raised text-text" : grade === "나비" ? "bg-accent text-accent-ink" : "bg-raised text-muted";
  return <span className={cx("rounded-full px-2 py-0.5 text-badge-12", tone)}>{grade}</span>;
}

function Row({ item: i, ownerId, mine, onPick }: { item: ChatItem; ownerId: string; mine: boolean; onPick: () => void }) {
  const host = i.isHost || (!!i.authorId && i.authorId === ownerId);
  const name = mine ? (
    <span className="text-caption-12 text-muted">{i.authorNickname}</span>
  ) : (
    <button type="button" onClick={onPick} className="text-caption-12 text-muted hover:underline">
      {i.authorNickname}
    </button>
  );

  if (i.kind === "donation" || i.kind === "mission") {
    return (
      <div className={cx("flex flex-col gap-1 rounded-sm bg-live-bg p-3 break-words", i.amount != null && i.amount >= 100_000 && "border border-live")}>
        <div className="flex items-center gap-2">
          <GiftIcon size={16} className="shrink-0 text-live-ink" />
          {name}
          <GradeBadge grade={i.authorGrade} />
          {i.amount != null && <span className="text-badge-12 text-live-ink">{i.amount.toLocaleString()}꿀</span>}
        </div>
        {i.kind === "mission" && (
          <p className="text-body-16">
            <span className="mr-2 rounded-xs bg-raised px-2 py-0.5 text-badge-12 text-muted">
              미션{i.missionStatus ? ` · ${MISSION_LABEL[i.missionStatus] ?? i.missionStatus}` : ""}
            </span>
            {i.missionContent}
          </p>
        )}
        {i.hidden ? <Hidden /> : i.content && <p className="text-body-16">{i.content}</p>}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-sm p-2">
      <Avatar name={i.authorNickname} size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 break-words">
        <div className="flex items-center gap-2">
          {name}
          {host && <span className="rounded-xs bg-raised px-1 text-badge-12 text-muted">방송자</span>}
          <GradeBadge grade={i.authorGrade} />
          <span className="text-caption-12 text-subtle">{ago(i.createdAt)}</span>
        </div>
        {i.hidden ? <Hidden /> : <p className="text-body-16">{i.content}</p>}
      </div>
    </div>
  );
}

const Hidden = () => <span className="text-body-16 italic text-subtle">부적절한 표현이 감지되어 숨긴 채팅이에요</span>;
