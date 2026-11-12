// (node 타입이 필요해 shared의 tsc 검사에서는 뺐다.) 모든 `*Api` 약속을 모아 OpenAPI 3.1 문서를 만든다(결정 18). `pnpm openapi`로 실행한다.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createDocument } from "zod-openapi";
import * as contracts from "../src/contracts.ts";
import * as chat from "../src/chat.ts";
import * as account from "../src/account.ts";
import * as grade from "../src/grade.ts";
import * as honey from "../src/honey.ts";
import * as moderation from "../src/moderation.ts";
import * as recording from "../src/recording.ts";
import * as settlement from "../src/settlement.ts";
import * as notification from "../src/notification.ts";
import * as adminOps from "../src/adminOps.ts";
import * as seed from "../src/seed.ts";

type AnyContract = { method: string; path: string; req: never; res: never };
const modules: Record<string, unknown>[] = [contracts, chat, account, grade, honey, moderation, recording, settlement, notification, adminOps, seed];

// 이름이 api 또는 Api로 끝나는 내보내기를 전부 모은다. 새 약속 파일은 위 목록에만 더하면 된다.
const groups = modules.flatMap((m) => Object.entries(m).filter(([name]) => name === "api" || name.endsWith("Api")) as [string, Record<string, AnyContract>][]);

const paths: Record<string, Record<string, unknown>> = {};
for (const [group, apis] of groups) {
  for (const [name, c] of Object.entries(apis)) {
    const path = c.path.replace(/:(\w+)/g, "{$1}");
    const params = [...c.path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1]!, in: "path", required: true, schema: { type: "string" } }));
    const hasBody = c.method !== "GET" && c.method !== "DELETE";
    (paths[path] ??= {})[c.method.toLowerCase()] = {
      operationId: name,
      tags: [group === "api" ? "core" : group.replace(/Api$/, "")],
      ...(params.length ? { parameters: params } : {}),
      ...(hasBody ? { requestBody: { required: true, content: { "application/json": { schema: c.req } } } } : {}),
      responses: { "200": { description: "성공", content: { "application/json": { schema: c.res } } } },
    };
  }
}

const doc = createDocument({
  openapi: "3.1.0",
  info: { title: "나비 API", version: "1.0.0", description: "로그인 토큰은 `authorization: Bearer <토큰>` 헤더로 보냅니다." },
  paths: paths as never,
});

const out = new URL("../../../apps/web/public/openapi.json", import.meta.url);
mkdirSync(dirname(out.pathname), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 2) + "\n");
console.log(`${Object.keys(paths).length}개 주소 → apps/web/public/openapi.json`);
