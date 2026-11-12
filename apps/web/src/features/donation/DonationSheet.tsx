"use client";
import {
  ANONYMOUS_NAME,
  cheerAmount,
  DONATION_MESSAGE_MAX,
  DONATION_MIN,
  honeyApi,
  MISSION_CONTENT_MAX,
  MISSION_DEFAULT_MINUTES,
  MISSION_MAX_MINUTES,
  MISSION_MIN_MINUTES,
  suggestChargeHoney,
  type Wallet,
} from "@nabi/shared/honey.ts";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/entities/session/session";
import { apiFetch, ApiError } from "@/shared/api/apiFetch";
import { Button, cx, IconButton, Input, Switch, XIcon } from "@/shared/ui";
import { AmountField } from "./AmountField";
import { ChargeBox, type PendingDonation } from "./ChargeBox";
import { NoticeDialog } from "./NoticeDialog";

const won = (n: number) => n.toLocaleString("ko-KR");
const pad = (n: number) => String(n).padStart(2, "0");

type Props = { broadcastId: string; ownerId: string; status: "ready" | "live" | "ended"; onClose: () => void };

/** 후원 창. 채팅 후원과 미션 후원 탭이 있다. 휴대폰은 아래에서 올라오고, PC도 같은 모양이다(4-8). */
export function DonationSheet({ broadcastId, ownerId, status, onClose }: Props) {
  const { me } = useSession();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  // 후원 창을 열 때 한 번씩 만든다. 버튼을 두 번 눌러도 서버가 한 번만 처리한다.
  const [chatRequestId] = useState(() => crypto.randomUUID());
  const [missionRequestId] = useState(() => crypto.randomUUID());
  const [tab, setTab] = useState<"chat" | "mission">("chat");
  const [anonymous, setAnonymous] = useState(false);
  const [amount, setAmount] = useState(0);
  const [message, setMessage] = useState("");
  const [prize, setPrize] = useState(0);
  const [content, setContent] = useState("");
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(MISSION_DEFAULT_MINUTES);
  const [step, setStep] = useState<"donate" | "charge">("donate");
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setWallet(await apiFetch(honeyApi.wallet).catch(() => null));
  }, []);
  useEffect(() => {
    if (me) void apiFetch(honeyApi.wallet).then(setWallet, () => undefined);
  }, [me]);

  if (status === "ended") return null; // 종료된 방송에는 후원 버튼이 없다. 서버도 거절한다.

  const mission = tab === "mission";
  const live = status === "live";
  const balance = wallet?.balance ?? 0;
  const own = me?.uid === ownerId;
  const sum = mission ? prize : amount;
  const short = Math.max(0, sum - balance);
  const lacking = sum >= DONATION_MIN && short > 0;
  const limitMinutes = Math.max(0, hours) * 60 + Math.max(0, minutes);
  const limitOk = limitMinutes >= MISSION_MIN_MINUTES && limitMinutes <= MISSION_MAX_MINUTES;
  const ready = mission ? !!content.trim() && prize >= DONATION_MIN && limitOk : amount >= DONATION_MIN;

  const pending = (): PendingDonation =>
    mission
      ? { kind: "mission", broadcastId, requestId: missionRequestId, amount: prize, content: content.trim(), limitMinutes, anonymous }
      : { kind: "chat", broadcastId, requestId: chatRequestId, amount, message, anonymous };

  async function donate() {
    setBusy(true);
    setError("");
    try {
      if (mission) {
        await apiFetch(honeyApi.donateMission, { requestId: missionRequestId, amount: prize, content: content.trim(), limitMinutes, anonymous }, { id: broadcastId });
        toast.success("미션을 보냈어요. 방송자가 수락하면 시작돼요");
      } else {
        await apiFetch(honeyApi.donate, { requestId: chatRequestId, amount, message, anonymous }, { id: broadcastId });
        toast.success(`${won(amount)}꿀을 후원했어요`);
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "잠시 뒤에 다시 시도해 주세요");
      if (e instanceof ApiError && e.code === "INSUFFICIENT") void reload(); // 다른 기기에서 먼저 쓴 경우 잔액을 새로 불러온다
    } finally {
      setBusy(false);
    }
  }

  function startCharge() {
    if (!wallet || suggestChargeHoney(short, wallet.todayRemaining) === null) {
      setError("오늘 충전할 수 있는 한도를 넘어서 충전하고 후원할 수 없어요");
      return;
    }
    setError("");
    setStep("charge");
  }

  const textarea = "w-full resize-none rounded-sm border border-line bg-base px-4 py-3 text-body-16 outline-none placeholder:text-subtle focus:border-[var(--color-focus-ring)]";

  return (
    // 휴대폰은 뒤 화면을 어둡게 덮고 아래에서 올라오고, PC는 채팅 영역 위로 올라온다(H-1, H-16).
    <div className="fixed inset-0 z-[var(--z-sheet)] flex items-end justify-center bg-scrim lg:pointer-events-none lg:justify-end lg:bg-transparent" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label="후원하기"
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-lg bg-surface px-4 pb-6 pt-2 shadow-overlay lg:w-[360px]"
      >
        <span aria-hidden className="mx-auto h-1 w-8 shrink-0 rounded-xs bg-line" />
        <div className="flex items-center justify-between">
          <h2 className="text-heading-20">후원하기</h2>
          <IconButton label="닫기" onClick={onClose}>
            <XIcon size={20} />
          </IconButton>
        </div>

        {!me ? (
          <p className="text-body-16 text-muted">로그인하면 후원할 수 있어요</p>
        ) : own ? (
          <p className="text-body-16 text-muted">내 방송에는 후원할 수 없어요</p>
        ) : !wallet ? (
          <p className="py-6 text-center text-body-16 text-subtle">불러오는 중…</p>
        ) : step === "charge" ? (
          <>
            <p className="text-body-16">{won(short)}꿀이 모자라서 충전하고 바로 후원해요. 충전할 꿀은 바꿀 수 있어요.</p>
            <ChargeBox
              wallet={wallet}
              reload={reload}
              returnTo={`/live/${broadcastId}`}
              initialHoney={suggestChargeHoney(short, wallet.todayRemaining) ?? undefined}
              donation={pending()}
              submitLabel="충전하고 후원하기"
            />
            <button className="self-center text-caption-12 text-muted underline" onClick={() => setStep("donate")}>돌아가기</button>
          </>
        ) : (
          <>
            <div role="tablist" className="flex border-b border-line">
              {(["chat", "mission"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => {
                    setTab(t);
                    setError("");
                  }}
                  className={cx("flex h-12 items-end border-b-2 px-4 pb-2 text-heading-16", tab === t ? "border-text text-text" : "border-transparent text-muted hover:text-text")}
                >
                  {t === "chat" ? "채팅" : "미션"}
                </button>
              ))}
            </div>

            {mission && !live ? (
              <p className="rounded-md bg-raised px-4 py-6 text-center text-body-16 text-muted">방송이 시작되면 미션을 보낼 수 있어요</p>
            ) : (
              <div className="flex flex-col gap-3 rounded-md bg-raised p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-heading-16">{anonymous ? ANONYMOUS_NAME : me.nickname}</span>
                  <span className="flex items-center gap-2 text-body-16">
                    익명
                    <Switch checked={anonymous} onChange={setAnonymous} label="익명으로 후원하기" />
                  </span>
                </div>
                {mission ? (
                  <>
                    <textarea value={content} maxLength={MISSION_CONTENT_MAX} rows={2} onChange={(e) => setContent(e.target.value)} placeholder="미션 내용을 입력해 주세요" className={textarea} />
                    <span className="self-end text-caption-12 text-subtle">{content.length}/{MISSION_CONTENT_MAX}</span>
                    <p className="text-caption-12 text-subtle">위험한 행동, 불법 행위, 선정적인 행동, 다른 사람을 괴롭히는 행동은 요구할 수 없어요</p>
                  </>
                ) : (
                  <>
                    <textarea value={message} maxLength={DONATION_MESSAGE_MAX} rows={2} onChange={(e) => setMessage(e.target.value)} placeholder="후원과 함께 채팅을 보내세요" className={textarea} />
                    <span className="self-end text-caption-12 text-subtle">{message.length}/{DONATION_MESSAGE_MAX}</span>
                  </>
                )}
              </div>
            )}

            {mission && live && (
              <div className="flex flex-col gap-2 rounded-md bg-raised p-4">
                <span className="text-heading-16">미션 제한 시간</span>
                <div className="flex items-center gap-2">
                  <Input inputMode="numeric" aria-label="시간" value={pad(hours)} className="w-16 text-center" onChange={(e) => setHours(Math.min(3, Number(e.target.value.replace(/\D/g, "")) || 0))} />
                  <span>:</span>
                  <Input inputMode="numeric" aria-label="분" value={pad(minutes)} className="w-16 text-center" onChange={(e) => setMinutes(Math.min(59, Number(e.target.value.replace(/\D/g, "")) || 0))} />
                </div>
                <p className={cx("text-caption-12", limitOk ? "text-subtle" : "text-danger")}>방송자가 수락한 때부터 재요. 5분부터 3시간까지 분 단위로 정해요</p>
              </div>
            )}

            {!(mission && !live) && (
              <>
                <AmountField
                  title={mission ? "성공 시 상금" : "후원 금액"}
                  help={mission ? "성공하면 상금 전부, 실패하면 응원금만 방송자에게 가요" : undefined}
                  amount={mission ? prize : amount}
                  onChange={mission ? setPrize : setAmount}
                  balance={balance}
                  onReload={reload}
                />
                {mission && <p className="text-caption-12 text-subtle">실패 시 응원금 {won(cheerAmount(prize))}꿀</p>}
              </>
            )}

            {error && <p className="text-caption-12 text-danger">{error}</p>}
            <div className="h-px bg-line" />
            {mission && !live ? null : lacking ? (
              <Button size="lg" variant="live" disabled={busy} onClick={startCharge}>충전하고 후원하기</Button>
            ) : (
              <Button size="lg" variant="live" loading={busy} disabled={!ready} onClick={donate}>
                {mission ? "후원하기" : amount >= DONATION_MIN ? `${won(amount)}꿀 후원하기` : "후원하기"}
              </Button>
            )}
            <p className="flex items-center justify-between text-caption-12 text-subtle">
              꿀 충전과 후원 유의사항에 동의합니다
              <button onClick={() => setNotice(true)} className="text-muted underline">안내 보기</button>
            </p>
          </>
        )}
      </div>
      {notice && <NoticeDialog onClose={() => setNotice(false)} />}
    </div>
  );
}
