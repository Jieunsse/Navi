import doc from "../../public/openapi.json";

// `pnpm openapi`가 만든 문서를 영역별 목록으로 보여준다. 외부 스크립트 없이 <details>로 접고 편다.
type Op = { operationId: string; tags: string[]; parameters?: unknown; requestBody?: { content: Record<string, { schema: unknown }> }; responses: Record<string, { content?: Record<string, { schema: unknown }> }> };

const ops = Object.entries(doc.paths as Record<string, Record<string, Op>>).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, op]) => ({ path, method: method.toUpperCase(), op })),
);
const groups = Map.groupBy(ops, (o) => o.op.tags[0] ?? "기타");
const json = (v: unknown) => JSON.stringify(v, null, 2);

export const metadata = { title: "API 문서" };

export default function ApiDocsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 md:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-heading-28">{doc.info.title}</h1>
        <p className="text-caption-12 text-muted">{doc.info.description} · OpenAPI {doc.openapi} · <a href="/openapi.json" className="underline">openapi.json</a></p>
      </header>
      {[...groups].map(([tag, items]) => (
        <section key={tag} className="flex flex-col gap-2">
          <h2 className="text-heading-16">{tag}</h2>
          {items.map(({ path, method, op }) => (
            <details key={op.operationId} className="rounded-lg bg-surface">
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-3">
                <span className="w-14 text-badge-12 text-muted">{method}</span>
                <code className="text-body-16">{path}</code>
                <span className="ml-auto text-caption-12 text-muted">{op.operationId}</span>
              </summary>
              <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
                {op.requestBody && <Block title="요청 본문" value={op.requestBody.content["application/json"]?.schema} />}
                <Block title="응답 200" value={op.responses["200"]?.content?.["application/json"]?.schema} />
              </div>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}

function Block({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption-12 text-muted">{title}</span>
      <pre className="overflow-x-auto rounded-sm bg-screen p-3 text-caption-12 text-on-video">{json(value)}</pre>
    </div>
  );
}
