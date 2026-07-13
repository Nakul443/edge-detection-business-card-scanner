import {
  AnyPgColumn,
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  displayName: text('display_name'),
  givenName: text('given_name'),
  familyName: text('family_name'),
  designation: text('designation'),
  company: text('company'),
  relationshipToUser: text('relationship_to_user'),
  avatarUrl: text('avatar_url'),
  source: text('source').notNull().default('manual'),
  mergedIntoContactId: uuid('merged_into_contact_id').references(
    (): AnyPgColumn => contacts.id,
  ),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const contactEmails = pgTable('contact_emails', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id),
  email: text('email').notNull(),
  normalizedEmail: text('normalized_email').notNull(),
  label: text('label').notNull().default('work'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const contactPhones = pgTable('contact_phones', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id),
  phoneNumber: text('phone_number').notNull(),
  normalizedPhone: text('normalized_phone').notNull(),
  label: text('label').notNull().default('mobile'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const contactWebsites = pgTable('contact_websites', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id),
  url: text('url').notNull(),
  normalizedUrl: text('normalized_url').notNull(),
  label: text('label').notNull().default('company'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const contactAddresses = pgTable('contact_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  country: text('country'),
  formattedAddress: text('formatted_address'),
  label: text('label').notNull().default('office'),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const contactRelationships = pgTable('contact_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromContactId: uuid('from_contact_id')
    .notNull()
    .references(() => contacts.id),
  toContactId: uuid('to_contact_id')
    .notNull()
    .references(() => contacts.id),
  relationshipType: text('relationship_type').notNull(),
  inverseRelationshipType: text('inverse_relationship_type'),
  relationshipCategory: text('relationship_category')
    .notNull()
    .default('custom'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const contactGroups = pgTable('contact_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  groupType: text('group_type').notNull().default('custom'),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const contactGroupMembers = pgTable('contact_group_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => contactGroups.id),
  contactId: uuid('contact_id')
    .notNull()
    .references(() => contacts.id),
  role: text('role'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const extractionAttempts = pgTable('extraction_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: text('source_type').notNull(),
  status: text('status').notNull(),
  originalFileName: text('original_file_name'),
  storedFilePath: text('stored_file_path'),
  rawText: text('raw_text'),
  parsedDraft: jsonb('parsed_draft'),
  confidence: jsonb('confidence'),
  errorMessage: text('error_message'),
  createdContactId: uuid('created_contact_id').references(() => contacts.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
