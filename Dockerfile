# 나비 웹(apps/web)을 Next standalone 출력으로 담는다. 빌드는 레포 루트에서 한다.
#   docker build -t nabi-web --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=... .
FROM node:22.14-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile
COPY . .
# NEXT_PUBLIC_* 값은 빌드할 때 브라우저 코드에 박힌다. 그래서 빌드 인자로 받는다.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_LIVEKIT_URL
ARG NEXT_PUBLIC_TOSS_CLIENT_KEY
ARG NEXT_PUBLIC_USE_EMULATORS=false
RUN pnpm --filter web build

FROM node:22.14-slim AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
# 서버 쪽 비밀 값(FIREBASE_*, LIVEKIT_*, STORAGE_*, TOSS_SECRET_KEY 등)은 실행할 때 환경 변수로 넘긴다.
CMD ["node", "apps/web/server.js"]
