FROM oven/bun

WORKDIR /app

RUN apt update

COPY package.json .
COPY bun.lockb .

RUN bun install

COPY src src

CMD ["bun", "src/index.ts"]

EXPOSE 3000
