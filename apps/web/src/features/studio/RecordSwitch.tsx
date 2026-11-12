"use client";
import { HelpTip, Switch } from "@/shared/ui";

const HELP = "켜면 방송이 끝난 뒤 다시보기가 만들어져요. 한 번에 3분까지 녹화되고, 처음에는 나만 볼 수 있어요";

/** "이 방송 녹화하기" 스위치와 "?" 도움말(4-4의 5번). 방송을 시작하면 바꿀 수 없다. */
export function RecordSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex w-80 max-w-full items-center justify-between gap-3">
        <span className="text-body-16">이 방송 녹화하기</span>
        <Switch checked={checked} onChange={onChange} label="이 방송 녹화하기" disabled={disabled} />
      </div>
      <HelpTip text={HELP} label="녹화 도움말" />
    </div>
  );
}
