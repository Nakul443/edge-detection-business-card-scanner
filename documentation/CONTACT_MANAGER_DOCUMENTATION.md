# Business Card Scanner & Smart Contact Manager Documentation

## Overview

This project is a full-stack contact manager built for the Backend Developer assignment. It lets users create contacts from business card OCR, local voice transcription, or manual entry. Saved contacts can be reviewed, deduplicated, merged, linked by relationships, grouped, exported as VCF, deleted, and viewed in a graph.

## Stack

- Backend: NestJS
- Database: PostgreSQL
- ORM: Drizzle ORM
- Frontend: React + Vite
- OCR: Tesseract.js with preprocessing and OCR evaluation scripts
- Voice: Browser audio capture plus local/offline faster-whisper runner
- Graph: Sigma.js + Graphology + ForceAtlas2
- Tests: Jest unit tests, Nest e2e tests, OCR evaluation script

## Main Features

### Contact Creation

The Add Contact page supports:

- Image mode for business card capture/upload.
- Voice mode for full natural-language contact entry.
- Manual review form before saving.
- Quick voice fill inside individual draft fields.
- Per-field voice replacement for focused fields.
- Automatic duplicate checks while drafting.

### Business Card OCR

Flow:

1. User captures or uploads a card image.
2. Backend preprocesses image variants.
3. Tesseract OCR runs locally.
4. OCR text is parsed into a contact draft.
5. User reviews editable fields before saving.

Extracted fields:

- Full Name
- Designation
- Company
- Email
- Phone
- Website
- Address
- Relationship to user/business

### Voice Entry

Flow:

1. User records audio in browser.
2. Audio is sent to the NestJS backend.
3. Local faster-whisper runner transcribes audio.
4. Transcript parser maps natural speech into contact fields.
5. User reviews and saves the draft.

Phone fields are normalized aggressively so spoken digit text like `one two three` or STT output like `1 to 3, 2 by 6` becomes numeric.

### Duplicate Detection

The backend checks duplicates using:

- Normalized email
- Normalized phone
- Name similarity

If matches exist, the UI displays a duplicate modal with:

- Use Existing
- Merge
- Create New

### Merge

Merge keeps the existing contact as the survivor and adds missing values from the new draft. This avoids overwriting trusted stored values during the demo while still showing useful merge behavior.

### Contacts Page

The Contacts page supports:

- Contact list and detail view.
- Multi-select contacts.
- Export one or more contacts as `.vcf`.
- Delete contacts with soft-delete behavior.
- Add relationships to other contacts.
- Add contacts to groups.

### Relationship Graph

The graph view displays contacts as nodes and relationships as edges.

Features:

- Contact-only nodes.
- Relationship edge labels.
- Group-based pastel colors.
- Group filter.
- Search and focus.
- Drag nodes.
- Pan and zoom.
- Force-directed layout.

## Database Summary

Core tables:

- `contacts`
- `contact_emails`
- `contact_phones`
- `contact_websites`
- `contact_addresses`
- `contact_relationships`
- `contact_groups`
- `contact_group_members`
- `extraction_attempts`

The database treats contacts as first-class records and relationships as graph edges. Groups are many-to-many collections separate from direct relationships.

## API Summary

### Contacts

- `GET /contacts`
- `POST /contacts`
- `GET /contacts/:id`
- `DELETE /contacts/:id`
- `POST /contacts/:id/merge`
- `GET /contacts/:id/vcf`
- `GET /contacts/export/vcf?ids=id1,id2`

### Relationships and Groups

- `POST /contacts/:id/relationships`
- `GET /contacts/groups`
- `POST /contacts/:id/groups`
- `GET /contacts/graph`

### Extraction

- `POST /extractions/business-card`
- `POST /extractions/voice`

## Local Setup

```bash
npm install
npm run dev:infra
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web -- --host 0.0.0.0
```

Default API:

```text
http://localhost:3000
```

Default frontend:

```text
http://localhost:5173
```

LAN/mobile frontend:

```text
http://<machine-ip>:5173
```

## Verification Commands

```bash
npm run test:unit
npm run test:e2e
npm run build
npm run test:ocr
```

Full suite:

```bash
npm run test
```

## Demo Notes

Recommended demo sequence:

1. Start app and show seeded contacts.
2. Add a contact from voice.
3. Add a contact from business card image.
4. Show duplicate modal.
5. Save or merge contact.
6. Add relationship/group.
7. Show Contacts page export/delete.
8. Show graph view with group filter and relationship labels.
