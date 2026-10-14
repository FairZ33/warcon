FROM oven/bun:1.4.3-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
RUN mkdir -p /app/data && chown -R bun:bun /app
USER bun
EXPOSE 3100
CMD ["bun", "src/main.ts"]
