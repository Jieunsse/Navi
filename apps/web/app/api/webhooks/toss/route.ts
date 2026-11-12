import { honey } from "@nabi/core/application/honey.ts";

// 토스페이먼츠 결제 상태 알림(07 7장). 본문은 믿지 않고 결제 키로 다시 조회한다.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return new Response("bad request", { status: 400 });
  try {
    await honey().onTossWebhook(body);
  } catch (e) {
    console.error("toss webhook", e);
    return new Response("retry", { status: 500 }); // 토스가 다시 보낸다. 꿀은 한 번만 들어간다.
  }
  return new Response("ok");
}
