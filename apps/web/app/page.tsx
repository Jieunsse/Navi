"use client";
import { asCategory, CATEGORIES, type CategoryId } from "@nabi/shared";
import { recordingApi, type Recording } from "@nabi/shared/recording.ts";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useHomeBroadcasts } from "@/entities/broadcast/model";
import { apiFetch } from "@/shared/api/apiFetch";
import { buttonCls, EmptyState, RadioIcon, Skeleton, Tabs } from "@/shared/ui";
import { BroadcastCard, CardRow, ReplayCard } from "@/widgets/home/cards";
import { AdBanner, EventPopup, PromoRow, SectionHead } from "@/widgets/home/sections";

const gridCls = "grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 2xl:grid-cols-5 min-[1100px]:grid-cols-4";

export default function HomePage() {
  // useSearchParams는 Suspense 안에서만 쓸 수 있다.
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

function Home() {
  const { live, ready, loading } = useHomeBroadcasts();
  const router = useRouter();
  const raw = useSearchParams().get("category");
  const category: CategoryId | "전체" = raw ? asCategory(raw) : "전체";
  const [expanded, setExpanded] = useState(false);
  const [replays, setReplays] = useState<Recording[] | null>(null);
  useEffect(() => {
    apiFetch(recordingApi.listReplays).then(
      (r) => setReplays(r.items.slice(0, 12)),
      () => setReplays([]),
    );
  }, []);

  // 방송 중(최근 시작순) 뒤에 곧 시작하는 방송을 잇는다.
  const all = [...(live ?? []), ...(ready ?? [])];
  const picked = category === "전체" ? all : all.filter((b) => b.category === category);
  const [main, ...rest] = all;
  const tabs = [{ value: "전체" as const, label: "전체" }, ...CATEGORIES.map((c) => ({ value: c.id, label: c.id }))];

  return (
    <div className="flex w-full flex-1 flex-col gap-10 px-4 py-6 md:p-8">
      <PromoRow />

      <section className="flex flex-col gap-4" aria-label="지금 방송">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-heading-20">지금 방송</h2>
          <Link href="/studio/new" className={buttonCls({ variant: "live", size: "sm" })}>
            <RadioIcon size={16} />
            방송하기
          </Link>
        </div>
        {loading ? (
          <FeaturedSkeleton />
        ) : !main ? (
          <EmptyState
            title="지금 방송 중인 사람이 없어요"
            action={
              <Link href="/studio/new" className={buttonCls({ variant: "live" })}>
                <RadioIcon />
                방송하기
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <BroadcastCard b={main} big />
            <ul className="grid grid-cols-2 gap-4">
              {rest.slice(0, 4).map((b) => (
                <li key={b.id} className="min-w-0">
                  <BroadcastCard b={b} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <AdBanner />

      <section id="category" className="flex scroll-mt-20 flex-col gap-4" aria-label="카테고리별 방송">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-heading-20">카테고리별 방송</h2>
          {picked.length > 0 && (
            <button type="button" className="text-caption-12 text-muted hover:text-text" onClick={() => setExpanded(!expanded)}>
              {expanded ? "접기" : "전체보기"}
            </button>
          )}
        </div>
        <Tabs
          label="카테고리"
          items={tabs}
          value={category}
          onChange={(v) => {
            setExpanded(false);
            router.replace(v === "전체" ? "/" : `/?category=${encodeURIComponent(v)}`, { scroll: false });
          }}
        />
        {loading ? null : picked.length === 0 ? (
          <p className="py-10 text-center text-caption-12 text-muted">{category === "전체" ? "지금 방송 중인 사람이 없어요" : `${category} 방송이 아직 없어요`}</p>
        ) : expanded ? (
          <ul className={gridCls}>
            {picked.map((b) => (
              <li key={b.id} className="min-w-0">
                <BroadcastCard b={b} />
              </li>
            ))}
          </ul>
        ) : (
          <CardRow>
            {picked.map((b) => (
              <li key={b.id}>
                <BroadcastCard b={b} />
              </li>
            ))}
          </CardRow>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-label="다시보기">
        <SectionHead title="다시보기" more={{ href: "/replays" }} />
        {replays === null ? null : replays.length === 0 ? (
          <p className="py-10 text-center text-caption-12 text-muted">아직 공개된 다시보기가 없어요</p>
        ) : (
          <CardRow>
            {replays.map((r) => (
              <li key={r.id}>
                <ReplayCard r={r} />
              </li>
            ))}
          </CardRow>
        )}
      </section>

      <EventPopup />
    </div>
  );
}

// 320ms 안에 끝나면 아무것도 보여주지 않고, 더 걸리면 카드 자리만 잡은 뼈대를 보여준다(B-5). 뼈대는 움직이지 않는다.
function FeaturedSkeleton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 320);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" aria-hidden>
      <Skeleton className="aspect-video w-full" />
      <div className="grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-video w-full" />
        ))}
      </div>
    </div>
  );
}
