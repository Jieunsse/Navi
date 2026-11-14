"use client";
import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";
import { useStored } from "@/shared/lib/stored";
import { AwardIcon, buttonCls, HelpTip, HistoryIcon, HoneyIcon, RadioIcon, UserIcon } from "@/shared/ui";
import { hueBg } from "./category";

export function SectionHead({ title, more }: { title: ReactNode; more?: { href: string; label?: string } }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-heading-20">{title}</h2>
      {more && (
        <Link href={more.href} className="text-caption-12 text-muted hover:text-text">
          {more.label ?? "전체보기"}
        </Link>
      )}
    </div>
  );
}

const promos: { href: string; title: string; sub: string; hue: number; Icon: ComponentType<{ size?: number }> }[] = [
  { href: "/studio/new", title: "설치 없이 첫 방송 켜기", sub: "브라우저에서 바로 시작해요", hue: 40, Icon: RadioIcon },
  { href: "/me/honey?charge=1", title: "꿀 충전하고 후원하기", sub: "충전한 꿀로 방송자를 응원해요", hue: 80, Icon: HoneyIcon },
  { href: "/replays", title: "다시보기로 남기기", sub: "방송을 켜면 다시보기가 남아요", hue: 250, Icon: HistoryIcon },
  { href: "/me/grade", title: "등급이 오르면 수익 배분이 커져요", sub: "등급별 후원 배분을 확인해요", hue: 160, Icon: AwardIcon },
  { href: "/login", title: "심사용 테스트 계정 안내", sub: "방송자·시청자·운영자 계정으로 둘러봐요", hue: 300, Icon: UserIcon },
];

/** 맨 위 안내 카드 줄. 나비 자체 안내만 담는다. */
export function PromoRow() {
  return (
    <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      {promos.map((p) => (
        <li key={p.href} className="w-56 shrink-0 md:w-auto md:flex-1 md:basis-0 md:min-w-44">
          <Link href={p.href} style={hueBg(p.hue)} className="flex h-32 flex-col justify-between rounded-md p-4 text-on-video">
            <span className="opacity-80">
              <p.Icon size={24} />
            </span>
            <span className="flex flex-col gap-1">
              <span className="line-clamp-2 text-heading-16">{p.title}</span>
              <span className="line-clamp-1 text-caption-12 opacity-80">{p.sub}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 가로 광고 배너. 나비의 수익 모델(광고)을 보여주는 자리라서 내용은 나비 자체 프로모션이다. */
export function AdBanner() {
  return (
    <section aria-label="광고 예시" style={hueBg(20)} className="relative flex flex-col gap-3 rounded-md p-5 text-on-video md:flex-row md:items-center md:justify-between md:p-8">
      <span className="absolute right-3 top-3 flex items-center gap-1 text-badge-12 opacity-90">
        광고 예시
        <HelpTip label="광고 예시 안내" text="나비는 광고를 수익 모델의 하나로 보고 있어요. 이 자리는 광고가 들어갈 위치를 보여주는 예시예요." />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-heading-20">첫 방송을 켜면 다시보기가 남아요</p>
        <p className="text-caption-12 opacity-80">프로그램 설치 없이 브라우저에서 바로 시작해 보세요</p>
      </div>
      <Link href="/studio/new" className={buttonCls({ variant: "live", className: "md:mr-16" })}>
        <RadioIcon />
        방송하기
      </Link>
    </section>
  );
}

const HIDE_KEY = "nabi-event-hide-until";
const DAY = 24 * 60 * 60 * 1000;
const stillHidden = (until: string | null) => Number(until ?? 0) > Date.now();

/** 오른쪽 아래 이벤트 팝업. "1일간 보지 않기"는 브라우저에 저장한다. 닫기만 누르면 다음에 또 보인다. */
export function EventPopup() {
  const [until, setUntil] = useStored(HIDE_KEY, String(Number.MAX_SAFE_INTEGER)); // 서버 그림에서는 숨긴다
  const [closed, setClosed] = useState(false);
  if (closed || stillHidden(until)) return null;
  return (
    <aside
      aria-label="이벤트"
      className="fixed inset-x-3 bottom-3 z-[var(--z-dropdown)] flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-overlay md:inset-x-auto md:bottom-6 md:right-6 md:w-80"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-caption-12 text-subtle">이벤트</p>
          <p className="text-heading-16">첫 방송을 켜면 다시보기를 남겨 드려요</p>
          <p className="hidden text-caption-12 text-muted md:block">방송을 끝내면 녹화가 다시보기로 남아요. 지금 첫 방송을 켜 보세요.</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-3 text-caption-12 text-muted">
          <button type="button" className="hover:text-text" onClick={() => setUntil(String(Date.now() + DAY))}>
            1일간 보지 않기
          </button>
          <button type="button" className="hover:text-text" onClick={() => setClosed(true)}>
            닫기
          </button>
        </div>
        <Link href="/studio/new" className={buttonCls({ variant: "live", size: "sm" })}>
          방송하기
        </Link>
      </div>
    </aside>
  );
}
