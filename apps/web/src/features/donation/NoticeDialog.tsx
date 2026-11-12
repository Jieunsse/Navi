"use client";
import { Button } from "@/shared/ui";

// 07 13장 후원 안내 문구. 미션 후원은 이번에 만들지 않아서 채팅 후원에 해당하는 줄만 싣는다.
const donationNotice = [
  "후원 메시지에 다른 사람의 권리를 침해하거나 법령, 나비 이용약관, 나비 운영정책을 어기는 내용이 있으면 그 내용의 일부나 전부를 숨길 수 있어요. 이런 후원을 한 사용자는 나비 이용이 제한될 수 있어요.",
  "위와 같은 후원으로 생긴 불이익과 법적 책임은 후원한 사용자에게 있어요.",
  "채팅 후원과 전달된 후원은 취소할 수 없어요.",
];

const chargeNotice = [
  "충전한 꿀로 준비 중이거나 방송 중인 방송자에게 후원할 수 있어요. 끝난 방송과 다시보기에서는 후원할 수 없어요.",
  "꿀 1개는 1원이에요. 결제할 때 부가가치세 10%가 더해져요. 예를 들어 1,000꿀은 1,100원이에요.",
  "꿀은 충전한 날부터 5년 동안 쓸 수 있어요.",
  "꿀은 나비에서 후원에만 쓰는 포인트예요. 다른 사람에게 넘길 수 없어요. 쓰지 않은 꿀은 환급 신청으로 돌려받을 수 있어요.",
  "꿀은 만 19세 이상만 충전할 수 있어요. 처음 충전할 때 본인인증을 한 번 해요.",
  "한 번에 1,000꿀부터 1,000,000꿀까지 충전하고 후원할 수 있어요.",
  "하루에 충전할 수 있는 꿀은 1,000,000꿀까지예요. 하루는 0시부터 세요. 결제를 기다리는 충전(30분 안)도 한도에 들어가요. 충전을 취소해도 그날 한도는 돌아오지 않아요.",
  "꿀은 먼저 충전한 것부터 써요.",
  "충전하고 7일 안에, 그 충전 건의 꿀을 하나도 쓰지 않았다면 내 정보 > 내 꿀에서 직접 충전을 취소할 수 있어요.",
  "후원에 쓴 꿀은 돌려받을 수 없어요. 일부라도 쓴 충전 건은 충전 취소를 할 수 없어요.",
  "충전 취소를 할 수 없는 꿀도, 쓰지 않았다면 내 정보 > 내 꿀에서 환급을 신청할 수 있어요. 결제 금액의 10%를 수수료로 빼고 본인 명의 계좌로 보내 드려요. 예를 들어 3,000꿀이면 2,970원이에요.",
  "환급은 7일 안에 취소할 수 있는 충전 건의 꿀을 뺀 남은 꿀 전부를 한 번에 신청해요. 1,000꿀 미만이면 신청할 수 없어요.",
  "환급을 신청하면 그 꿀은 후원에 쓸 수 없어요. 나비가 확인한 뒤 보내 드리고, 결과는 알림으로 알려 드려요.",
  "계좌이체처럼 현금으로 결제하면 충전할 때 현금영수증을 발급해요. 충전을 취소하면 현금영수증도 취소돼요.",
  "충전 내역과 사용 내역은 내 정보 > 내 꿀에서 볼 수 있어요.",
  "이용 목적 없이 충전과 취소를 되풀이하는 등 서비스 운영을 어렵게 하면 이용이 제한될 수 있어요.",
  "회원 탈퇴 전에 남은 꿀을 확인해 주세요. 환급을 신청하지 않고 탈퇴하면 남은 꿀은 사라지고 되살릴 수 없어요. 환급을 처리하는 중에는 탈퇴할 수 없어요.",
  "나비는 공모용 서비스라 모든 결제는 테스트 결제예요. 실제 돈이 나가지 않아요.",
];

/** "안내 보기"를 누르면 열리는 후원·꿀 충전 안내 창(07 13장) */
export function NoticeDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={(e) => { e.stopPropagation(); onClose(); }} role="dialog" aria-modal aria-label="후원 안내">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-bold">후원 안내</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">{donationNotice.map((t) => <li key={t}>{t}</li>)}</ul>
        <h2 className="mt-2 text-base font-bold">꿀 충전 안내</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">{chargeNotice.map((t) => <li key={t}>{t}</li>)}</ul>
        <Button onClick={onClose} className="mt-2">확인</Button>
      </div>
    </div>
  );
}
