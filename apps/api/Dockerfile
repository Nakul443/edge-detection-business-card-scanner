FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

RUN pip3 install --break-system-packages --no-cache-dir faster-whisper paddleocr

COPY . .
RUN npm --workspace apps/api run build

ENV NODE_ENV=production
ENV PORT=3000
ENV LOCAL_STT_PYTHON=python3
ENV LOCAL_STT_MODEL=tiny.en
ENV LOCAL_STT_DEVICE=cpu
ENV LOCAL_STT_COMPUTE_TYPE=int8
ENV LOCAL_STT_TIMEOUT_MS=120000
ENV BUSINESS_CARD_OCR_ENGINE=paddle
ENV BUSINESS_CARD_OCR_PYTHON=python3
ENV BUSINESS_CARD_PADDLE_SIDE_LEN=960
ENV BUSINESS_CARD_OCR_TIMEOUT_MS=180000

EXPOSE 3000

RUN chmod +x /app/scripts/docker-api-entrypoint.sh
CMD ["/app/scripts/docker-api-entrypoint.sh"]
