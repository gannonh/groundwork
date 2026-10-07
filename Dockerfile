FROM node:24-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.output ./.output
# The run panel reads the pack and the starter tree from these at request time.
COPY --from=build /app/packs ./packs
COPY --from=build /app/templates ./templates
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
