# Stack Document

## Required Stack

This project will use the stack requested by the assignment:

- Backend: NestJS
- Database: PostgreSQL
- ORM: Drizzle ORM
- API Style: REST APIs
- Frontend: React
- OCR: Tesseract
- Speech-to-Text: Local/offline model or library, no cloud API
- Tests: Unit tests for backend services and parsing logic

## Backend: NestJS

NestJS will be the backend framework because it provides:

- Module-based architecture
- Controllers for HTTP APIs
- Services for business logic
- DTO validation support
- Testing utilities
- Clean separation between API, domain logic, and persistence

Suggested backend modules:

- `ContactsModule`
- `ExtractionModule`
- `DuplicateDetectionModule`
- `MergeModule`
- `GroupsModule`
- `DatabaseModule`

## Database: PostgreSQL

PostgreSQL will store contacts, emails, phones, relationships, groups, extraction attempts, and merge data.

It is a good fit because the app is relational:

- One contact can have many emails.
- One contact can have many phone numbers.
- One contact can belong to many groups.
- Contacts can be linked to other contacts.
- Duplicate detection benefits from indexes on normalized emails and phone numbers.

## ORM: Drizzle ORM

Drizzle ORM is a TypeScript ORM/query builder. It lets us define PostgreSQL schema in TypeScript and write typed SQL-like queries.

Example Drizzle schema shape:

```ts
export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  designation: text('designation'),
  company: text('company'),
  website: text('website'),
  relationshipToUser: text('relationship_to_user'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

Drizzle will be used for:

- Table definitions
- Migrations
- Contact create/update queries
- Duplicate detection queries
- Merge operations
- Group and relationship queries

## API Style: REST

REST is recommended for this assignment because it keeps the demo and implementation straightforward.

Main API groups:

- `/extractions/business-card`
- `/extractions/voice`
- `/contacts`
- `/contacts/duplicates/check`
- `/contacts/:id/merge`
- `/groups`
- `/relationships`

GraphQL is possible, but REST is faster to implement and easier to explain in a short assignment demo.

## Frontend: React

React will provide the responsive user interface.

Main UI surfaces:

- Business card scanner page
- Voice contact entry page
- Shared contact review form
- Duplicate matches panel
- Merge contact dialog
- Contact list page
- Contact detail page
- Relationship groups panel

The frontend should treat OCR and voice entry as separate input experiences, then send both into the same review and save flow.

## OCR: Tesseract

Tesseract will be used locally for OCR.

Recommended approach:

- User uploads or captures a business card image in React.
- NestJS receives the file.
- Backend runs Tesseract locally.
- OCR text is cleaned and parsed into a contact draft.

This keeps OCR processing server-side and easier to test.

## Speech-to-Text: Onboard Local Model

The assignment says to use a local Speech-to-Text library with no third-party integration.

Required direction:

- Use a downloaded/offline speech model.
- Run inference locally.
- Do not send audio to a cloud API.
- Treat local speech-to-text as a real onboard capability, not a remote placeholder.

Possible implementation options:

- `whisper.cpp`
- `nodejs-whisper`
- `faster-whisper` through a local Python helper

For the MVP, the backend should expose a voice extraction endpoint wired to a local STT command/service. The frontend records audio and uploads it to the backend.

## Testing Stack

Unit tests should focus on logic that affects evaluation:

- Business card text parser
- Voice transcript parser
- Email normalization
- Phone normalization
- Duplicate scoring
- Merge logic
- DTO validation

These tests prove that the system is more than a UI demo.

## Stack Boundary Rules

- No cloud OCR APIs.
- No cloud speech APIs.
- OCR and voice input should create drafts, not directly create contacts.
- Duplicate detection and merge logic should live on the backend.
- PostgreSQL is the source of truth.
- Drizzle should be used directly for schema and important queries.
