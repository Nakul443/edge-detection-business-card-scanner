# UI/UX Flow Documents

This folder defines the professional UX flows for the Smart Contact Manager.

The application has three main product pages:

1. Add Contact
2. Contact List / Contact Detail
3. Contact Graph

The first implementation focus is Add Contact and Contact List / Contact Detail. Contact Graph is documented as a supported view, but it can be implemented after the core contact creation and export flows are stable.

## Stack Alignment

- Frontend: React
- Backend: NestJS REST APIs
- Database: PostgreSQL through Drizzle ORM
- OCR: Tesseract
- Speech-to-Text: onboard local STT model/service
- Export: backend-generated vCard `.vcf`

## UX Principles

- Keep first-time contact creation fast.
- OCR and voice create drafts, not final contacts.
- Always let the user review extracted data before saving.
- Duplicate detection should warn and guide, not block.
- Relationship graph features should be optional and assistive.
- Export should be available from both single-contact and multi-select flows.
- Every destructive or ambiguous action should have a clear confirmation or escape path.

## Documents

- [navigation-map.md](navigation-map.md)
- [add-contact-flow.md](add-contact-flow.md)
- [contact-list-detail-export-flow.md](contact-list-detail-export-flow.md)
- [contact-graph-flow.md](contact-graph-flow.md)
