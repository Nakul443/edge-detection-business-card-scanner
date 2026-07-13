# Business Card Scanner & Smart Contact Manager

NestJS + PostgreSQL + Drizzle ORM backend with a React frontend for business card OCR, onboard local speech-to-text contact entry, duplicate detection, merge, vCard export, and contact relationships.

## Local Development

### Fastest reviewer setup

Prerequisite: Docker Desktop.

Run the whole application with one command:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:5173
```

That is enough for the demo path. Docker starts PostgreSQL, runs Drizzle migrations, loads sample contacts/groups only when the database is empty, starts the NestJS API, and serves the React app.

Useful Docker URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`
- Adminer: `http://localhost:8080`

Stop containers:

```bash
docker compose down
```

If a local dev server already uses `3000` or `5173`, choose different host ports:

```bash
API_PORT=3002 WEB_PORT=5174 docker compose up --build
```

PowerShell:

```powershell
$env:API_PORT='3002'; $env:WEB_PORT='5174'; docker compose up --build
```

Reset the Docker database completely:

```bash
docker compose down -v
docker compose up --build
```

### 1. Start infrastructure

```bash
npm run dev:infra
```

This starts:

- PostgreSQL on `localhost:5432`
- Adminer on `http://localhost:8080`

Default database credentials:

```text
System: PostgreSQL
Server: postgres
Username: bhumio
Password: bhumio_dev_password
Database: bhumio_contacts
```

When connecting from the host machine instead of Adminer, use:

```text
postgres://bhumio:bhumio_dev_password@localhost:5432/bhumio_contacts
```

### 2. Apply database migrations

```bash
npm run db:migrate
```

Load sample demo data:

```bash
npm run db:seed
```

Generate migrations after schema changes:

```bash
npm run db:generate
```

### 3. Start the backend

```bash
npm run dev:api
```

API:

```text
http://localhost:3000
```

### 4. Start the frontend

```bash
npm run dev:web -- --host 0.0.0.0
```

Local:

```text
http://localhost:5173
```

LAN/mobile:

```text
http://<your-machine-ip>:5173
```

## Useful Commands

```bash
npm run build
npm run test
npm run test:unit
npm run test:e2e
npm run test:ocr
npm run dev:infra:logs
npm run dev:infra:down
```

`npm run test` runs the full suite: backend unit tests, API e2e tests, production build, and the 20-card OCR accuracy report.

`npm run test:ocr` runs the PaddleOCR business-card image evaluation and prints a field-by-field CLI report. It also writes:

```text
datasets/business-cards/ocr-evaluation-report-paddle.json
```

The app uses PaddleOCR first for business-card scans because it handles card layouts better. Tesseract remains installed and available as a fallback path. To run the Tesseract-only report:

```bash
npm run test:ocr:tesseract
```

To make OCR accuracy fail below a threshold:

```bash
npm run test:ocr:strict
```

## Contact Manager Features

- Create contacts from business card OCR, voice input, or manual draft entry.
- Detect duplicates by name, email, and phone.
- Use existing, merge, or create new when duplicates are found.
- Add direct contact relationships.
- Add contacts to named groups.
- View relationship/group graph.
- Export one or many contacts as `.vcf`.
- Soft delete contacts from contact workflows.

## Local Business Card OCR

Business-card images are processed locally. The default OCR engine is PaddleOCR, with automatic fallback to Tesseract if Paddle is unavailable.

Useful env values:

```txt
BUSINESS_CARD_OCR_ENGINE=paddle
BUSINESS_CARD_OCR_PYTHON=python
BUSINESS_CARD_PADDLE_SIDE_LEN=960
BUSINESS_CARD_OCR_TIMEOUT_MS=180000
```

Set `BUSINESS_CARD_OCR_ENGINE=tesseract` if you want the pure Tesseract path.

## Local Voice STT

Voice upload uses a local `faster-whisper` Python runner. Install it once:

```bash
pip install faster-whisper
```

The default model is `tiny.en`; first use downloads/caches it locally. For a fully offline demo, set `LOCAL_STT_MODEL_DIR` to a pre-downloaded faster-whisper model directory in `.env`.

Useful env values:

```txt
LOCAL_STT_PYTHON=python
LOCAL_STT_MODEL=tiny.en
LOCAL_STT_DEVICE=cpu
LOCAL_STT_COMPUTE_TYPE=int8
LOCAL_STT_TIMEOUT_MS=120000
```

## Environment

Copy `.env.example` to `.env` at the repo root and `apps/api/.env.example` to `apps/api/.env` for local development.
