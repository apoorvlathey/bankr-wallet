FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/domain-reputation/ apps/domain-reputation/

RUN pnpm install --frozen-lockfile --filter @walletchan/domain-reputation

WORKDIR /app/apps/domain-reputation
RUN pnpm build

EXPOSE 42110
CMD ["node", "dist/index.js"]
