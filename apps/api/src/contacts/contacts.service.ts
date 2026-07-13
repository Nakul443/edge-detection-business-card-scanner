import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DATABASE } from '../db/database.module';
import type { Database } from '../db/database.types';
import {
  contactAddresses,
  contactEmails,
  contactGroupMembers,
  contactGroups,
  contactPhones,
  contactRelationships,
  contacts,
  contactWebsites,
} from '../db/schema';
import {
  compactString,
  normalizeEmail,
  normalizePhone,
  normalizeWebsite,
} from './contact-normalization';
import { ContactDraftDto } from './dto/contact-draft.dto';
import type {
  ContactGroupMembershipDto,
  ContactRelationshipDto,
  MergeContactDto,
} from './dto/contact-draft.dto';

type ContactRow = typeof contacts.$inferSelect;

@Injectable()
export class ContactsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listContacts() {
    const rows = await this.db
      .select()
      .from(contacts)
      .where(
        and(isNull(contacts.deletedAt), isNull(contacts.mergedIntoContactId)),
      )
      .orderBy(desc(contacts.createdAt));

    return Promise.all(rows.map((contact) => this.toContactSummary(contact)));
  }

  async getContact(id: string) {
    const [contact] = await this.db
      .select()
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);

    if (!contact || contact.deletedAt || contact.mergedIntoContactId) {
      throw new NotFoundException('Contact not found');
    }

    return this.toContactDetail(contact);
  }

  async listGroups() {
    return this.db
      .select()
      .from(contactGroups)
      .orderBy(desc(contactGroups.createdAt));
  }

  async getRelationshipGraph() {
    const [contactRows, relationshipRows, groupMembershipRows] =
      await Promise.all([
        this.db
          .select()
          .from(contacts)
          .where(
            and(
              isNull(contacts.deletedAt),
              isNull(contacts.mergedIntoContactId),
            ),
          )
          .orderBy(desc(contacts.createdAt)),
        this.db.select().from(contactRelationships),
        this.db
          .select({
            contactId: contactGroupMembers.contactId,
            groupName: contactGroups.name,
          })
          .from(contactGroupMembers)
          .innerJoin(
            contactGroups,
            eq(contactGroupMembers.groupId, contactGroups.id),
          ),
      ]);

    const activeContactIds = new Set(contactRows.map((contact) => contact.id));
    const edges = relationshipRows
      .filter(
        (relationship) =>
          activeContactIds.has(relationship.fromContactId) &&
          activeContactIds.has(relationship.toContactId),
      )
      .map((relationship) => ({
        id: relationship.id,
        fromContactId: relationship.fromContactId,
        toContactId: relationship.toContactId,
        relationshipType: relationship.relationshipType,
        inverseRelationshipType: relationship.inverseRelationshipType,
        group: this.graphGroupForRelationship(relationship.relationshipType),
      }));

    const nodeGroups = new Map<string, Set<string>>();
    for (const membership of groupMembershipRows) {
      if (!activeContactIds.has(membership.contactId)) continue;

      const groups = nodeGroups.get(membership.contactId) ?? new Set<string>();
      groups.add(membership.groupName);
      nodeGroups.set(membership.contactId, groups);
    }

    for (const edge of edges) {
      for (const contactId of [edge.fromContactId, edge.toContactId]) {
        const groups = nodeGroups.get(contactId) ?? new Set<string>();
        groups.add(edge.group);
        nodeGroups.set(contactId, groups);
      }
    }

    const nodes = await Promise.all(
      contactRows.map(async (contact) => {
        const summary = await this.toContactSummary(contact);
        const groups = [...(nodeGroups.get(contact.id) ?? [])];
        return {
          ...summary,
          groups:
            groups.length > 0
              ? groups
              : [contact.relationshipToUser ?? 'Orphan'],
        };
      }),
    );

    const groups = [
      ...new Set(
        nodes
          .flatMap((node) => node.groups)
          .concat(edges.map((edge) => edge.group)),
      ),
    ]
      .filter(Boolean)
      .sort();

    return {
      nodes,
      edges,
      groups,
    };
  }

  async createContact(draft: ContactDraftDto) {
    this.assertCreatableDraft(draft);

    const contactId = await this.db.transaction(async (tx) => {
      const [contact] = await tx
        .insert(contacts)
        .values({
          fullName:
            compactString(draft.fullName) ?? this.fallbackDisplayName(draft),
          displayName:
            compactString(draft.fullName) ?? this.fallbackDisplayName(draft),
          designation: compactString(draft.designation),
          company: compactString(draft.company),
          relationshipToUser: compactString(draft.relationshipToUser),
          source: draft.sourceType,
        })
        .returning();

      const emails = this.uniqueStrings(draft.emails ?? []).map(
        (email, index) => ({
          contactId: contact.id,
          email: email.trim(),
          normalizedEmail: normalizeEmail(email),
          label: 'work',
          isPrimary: index === 0,
        }),
      );

      if (emails.length > 0) {
        await tx.insert(contactEmails).values(emails);
      }

      const phones = this.uniqueStrings(
        (draft.phones ?? []).map((phone) => phone.number),
      ).map((phoneNumber, index) => ({
        contactId: contact.id,
        phoneNumber,
        normalizedPhone: normalizePhone(phoneNumber),
        label: draft.phones?.[index]?.label ?? 'mobile',
        isPrimary: index === 0,
      }));

      if (phones.length > 0) {
        await tx.insert(contactPhones).values(phones);
      }

      const website = compactString(draft.website);
      if (website) {
        await tx.insert(contactWebsites).values({
          contactId: contact.id,
          url: website,
          normalizedUrl: normalizeWebsite(website),
          label: 'company',
          isPrimary: true,
        });
      }

      const address = compactString(draft.address);
      if (address) {
        await tx.insert(contactAddresses).values({
          contactId: contact.id,
          formattedAddress: address,
          label: 'office',
          isPrimary: true,
        });
      }

      return contact.id;
    });

    return this.getContact(contactId);
  }

  async mergeDraftIntoContact(id: string, draft: MergeContactDto) {
    this.assertCreatableDraft(draft);
    const existing = await this.getActiveContactRow(id);

    await this.db.transaction(async (tx) => {
      await tx
        .update(contacts)
        .set({
          fullName:
            compactString(existing.fullName) ??
            compactString(draft.fullName) ??
            existing.fullName,
          displayName:
            compactString(existing.displayName) ??
            compactString(existing.fullName) ??
            compactString(draft.fullName) ??
            existing.fullName,
          designation:
            compactString(existing.designation) ??
            compactString(draft.designation),
          company:
            compactString(existing.company) ?? compactString(draft.company),
          relationshipToUser:
            compactString(existing.relationshipToUser) ??
            compactString(draft.relationshipToUser),
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, id));

      await this.insertMissingContactValues(tx, id, draft);
    });

    return this.getContact(id);
  }

  async createRelationship(
    fromContactId: string,
    relationship: ContactRelationshipDto,
  ) {
    if (fromContactId === relationship.toContactId) {
      throw new BadRequestException('A contact cannot be related to itself');
    }

    await Promise.all([
      this.getActiveContactRow(fromContactId),
      this.getActiveContactRow(relationship.toContactId),
    ]);

    const inverse = this.inverseRelationshipType(relationship.relationshipType);
    const [existing] = await this.db
      .select()
      .from(contactRelationships)
      .where(
        and(
          eq(contactRelationships.fromContactId, fromContactId),
          eq(contactRelationships.toContactId, relationship.toContactId),
          eq(
            contactRelationships.relationshipType,
            relationship.relationshipType,
          ),
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await this.db
      .insert(contactRelationships)
      .values({
        fromContactId,
        toContactId: relationship.toContactId,
        relationshipType: relationship.relationshipType,
        inverseRelationshipType: inverse,
        relationshipCategory: this.isProfessionalRelationship(
          relationship.relationshipType,
        )
          ? 'professional'
          : 'family',
      })
      .returning();

    return created;
  }

  async addContactToGroup(contactId: string, group: ContactGroupMembershipDto) {
    await this.getActiveContactRow(contactId);
    const name = compactString(group.name);
    if (!name) {
      throw new BadRequestException('Group name is required');
    }

    return this.db.transaction(async (tx) => {
      let [existingGroup] = await tx
        .select()
        .from(contactGroups)
        .where(eq(contactGroups.name, name))
        .limit(1);

      if (!existingGroup) {
        [existingGroup] = await tx
          .insert(contactGroups)
          .values({
            name,
            groupType: 'custom',
          })
          .returning();
      }

      const [existingMembership] = await tx
        .select()
        .from(contactGroupMembers)
        .where(
          and(
            eq(contactGroupMembers.groupId, existingGroup.id),
            eq(contactGroupMembers.contactId, contactId),
          ),
        )
        .limit(1);

      if (existingMembership) {
        return {
          ...existingMembership,
          group: existingGroup,
        };
      }

      const [membership] = await tx
        .insert(contactGroupMembers)
        .values({
          groupId: existingGroup.id,
          contactId,
          role: compactString(group.role),
        })
        .returning();

      return {
        ...membership,
        group: existingGroup,
      };
    });
  }

  async deleteContact(id: string) {
    await this.getActiveContactRow(id);
    await this.db
      .update(contacts)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, id));

    return { deleted: true, contactId: id };
  }

  async exportContactsVcf(contactIds: string[]) {
    if (contactIds.length === 0) {
      throw new BadRequestException('At least one contact id is required');
    }

    const cards = await Promise.all(
      contactIds.map(async (id) => {
        const contact = await this.getContact(id);
        return this.toVCard(contact);
      }),
    );

    return `${cards.join('\r\n')}\r\n`;
  }

  async checkDuplicates(draft: ContactDraftDto) {
    const emailMatches = this.uniqueStrings(draft.emails ?? []).map(
      normalizeEmail,
    );
    const phoneMatches = this.uniqueStrings(
      (draft.phones ?? []).map((phone) => phone.number),
    ).map(normalizePhone);

    const matchedContactIds = new Set<string>();
    const matchReasons = new Map<string, Set<string>>();

    if (emailMatches.length > 0) {
      const rows = await this.db
        .select({
          contactId: contactEmails.contactId,
          value: contactEmails.normalizedEmail,
        })
        .from(contactEmails)
        .where(inArray(contactEmails.normalizedEmail, emailMatches));

      rows.forEach((row) => {
        matchedContactIds.add(row.contactId);
        this.addMatchReason(matchReasons, row.contactId, 'email');
      });
    }

    if (phoneMatches.length > 0) {
      const rows = await this.db
        .select({
          contactId: contactPhones.contactId,
          value: contactPhones.normalizedPhone,
        })
        .from(contactPhones)
        .where(inArray(contactPhones.normalizedPhone, phoneMatches));

      rows.forEach((row) => {
        matchedContactIds.add(row.contactId);
        this.addMatchReason(matchReasons, row.contactId, 'phone');
      });
    }

    const nameNeedle = compactString(draft.fullName)?.toLowerCase();
    if (nameNeedle) {
      const rows = await this.db.select().from(contacts);
      rows
        .filter((contact) => {
          const haystack = contact.fullName.toLowerCase();
          return (
            !contact.deletedAt &&
            !contact.mergedIntoContactId &&
            (haystack === nameNeedle ||
              haystack.includes(nameNeedle) ||
              nameNeedle.includes(haystack))
          );
        })
        .forEach((contact) => {
          matchedContactIds.add(contact.id);
          this.addMatchReason(matchReasons, contact.id, 'name');
        });
    }

    if (matchedContactIds.size === 0) {
      return {
        hasMatches: false,
        matches: [],
      };
    }

    const matchedContacts = await this.db
      .select()
      .from(contacts)
      .where(inArray(contacts.id, [...matchedContactIds]));

    const matches = matchedContacts
      .filter((contact) => !contact.deletedAt && !contact.mergedIntoContactId)
      .map((contact) => {
        const reasons = [...(matchReasons.get(contact.id) ?? [])];
        return {
          contactId: contact.id,
          fullName: contact.fullName,
          company: contact.company,
          matchedOn: reasons,
          score:
            reasons.includes('email') || reasons.includes('phone') ? 0.95 : 0.6,
        };
      });

    return {
      hasMatches: matches.length > 0,
      matches,
    };
  }

  private async toContactSummary(contact: ContactRow) {
    const [primaryEmail] = await this.db
      .select()
      .from(contactEmails)
      .where(
        and(
          eq(contactEmails.contactId, contact.id),
          eq(contactEmails.isPrimary, true),
        ),
      )
      .limit(1);

    const [primaryPhone] = await this.db
      .select()
      .from(contactPhones)
      .where(
        and(
          eq(contactPhones.contactId, contact.id),
          eq(contactPhones.isPrimary, true),
        ),
      )
      .limit(1);

    return {
      id: contact.id,
      fullName: contact.fullName,
      displayName: contact.displayName ?? contact.fullName,
      designation: contact.designation,
      company: contact.company,
      relationshipToUser: contact.relationshipToUser,
      source: contact.source,
      primaryEmail: primaryEmail?.email ?? null,
      primaryPhone: primaryPhone?.phoneNumber ?? null,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }

  private async toContactDetail(contact: ContactRow) {
    const [emails, phones, websites, addresses, relationships] =
      await Promise.all([
        this.db
          .select()
          .from(contactEmails)
          .where(eq(contactEmails.contactId, contact.id)),
        this.db
          .select()
          .from(contactPhones)
          .where(eq(contactPhones.contactId, contact.id)),
        this.db
          .select()
          .from(contactWebsites)
          .where(eq(contactWebsites.contactId, contact.id)),
        this.db
          .select()
          .from(contactAddresses)
          .where(eq(contactAddresses.contactId, contact.id)),
        this.db
          .select()
          .from(contactRelationships)
          .where(eq(contactRelationships.fromContactId, contact.id)),
      ]);

    return {
      id: contact.id,
      fullName: contact.fullName,
      displayName: contact.displayName ?? contact.fullName,
      designation: contact.designation,
      company: contact.company,
      relationshipToUser: contact.relationshipToUser,
      source: contact.source,
      emails,
      phones,
      websites,
      addresses,
      relationships,
      createdAt: contact.createdAt,
      updatedAt: contact.updatedAt,
    };
  }

  private toVCard(
    contact: Awaited<ReturnType<ContactsService['toContactDetail']>>,
  ) {
    const emails = contact.emails ?? [];
    const phones = contact.phones ?? [];
    const websites = contact.websites ?? [];
    const addresses = contact.addresses ?? [];
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${this.escapeVCardValue(contact.displayName || contact.fullName)}`,
      `N:${this.escapeVCardValue(contact.fullName)};;;;`,
    ];

    if (contact.company) {
      lines.push(`ORG:${this.escapeVCardValue(contact.company)}`);
    }
    if (contact.designation) {
      lines.push(`TITLE:${this.escapeVCardValue(contact.designation)}`);
    }

    for (const email of emails) {
      lines.push(
        `EMAIL;TYPE=${this.escapeVCardParam(email.label)}:${this.escapeVCardValue(email.email)}`,
      );
    }
    for (const phone of phones) {
      lines.push(
        `TEL;TYPE=${this.escapeVCardParam(phone.label)}:${this.escapeVCardValue(phone.phoneNumber)}`,
      );
    }
    for (const website of websites) {
      lines.push(`URL:${this.escapeVCardValue(website.url)}`);
    }
    for (const address of addresses) {
      if (address.formattedAddress) {
        lines.push(
          `ADR;TYPE=${this.escapeVCardParam(address.label)}:;;${this.escapeVCardValue(
            address.formattedAddress,
          )};;;;`,
        );
      }
    }
    if (contact.relationshipToUser) {
      lines.push(
        `NOTE:${this.escapeVCardValue(`Relationship: ${contact.relationshipToUser}`)}`,
      );
    }

    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  private async getActiveContactRow(id: string) {
    const [contact] = await this.db
      .select()
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);

    if (!contact || contact.deletedAt || contact.mergedIntoContactId) {
      throw new NotFoundException('Contact not found');
    }

    return contact;
  }

  private async insertMissingContactValues(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    contactId: string,
    draft: ContactDraftDto,
  ) {
    const existingEmails = new Set(
      (
        await tx
          .select()
          .from(contactEmails)
          .where(eq(contactEmails.contactId, contactId))
      ).map((email) => email.normalizedEmail),
    );
    const emails = this.uniqueStrings(draft.emails ?? [])
      .filter((email) => !existingEmails.has(normalizeEmail(email)))
      .map((email) => ({
        contactId,
        email: email.trim(),
        normalizedEmail: normalizeEmail(email),
        label: 'work',
        isPrimary: existingEmails.size === 0,
      }));

    if (emails.length > 0) await tx.insert(contactEmails).values(emails);

    const existingPhones = new Set(
      (
        await tx
          .select()
          .from(contactPhones)
          .where(eq(contactPhones.contactId, contactId))
      ).map((phone) => phone.normalizedPhone),
    );
    const phones = this.uniqueStrings(
      (draft.phones ?? []).map((phone) => phone.number),
    )
      .filter((phone) => !existingPhones.has(normalizePhone(phone)))
      .map((phoneNumber, index) => ({
        contactId,
        phoneNumber,
        normalizedPhone: normalizePhone(phoneNumber),
        label: draft.phones?.[index]?.label ?? 'mobile',
        isPrimary: existingPhones.size === 0,
      }));

    if (phones.length > 0) await tx.insert(contactPhones).values(phones);

    const website = compactString(draft.website);
    if (website) {
      const normalizedUrl = normalizeWebsite(website);
      const existingWebsites = new Set(
        (
          await tx
            .select()
            .from(contactWebsites)
            .where(eq(contactWebsites.contactId, contactId))
        ).map((item) => item.normalizedUrl),
      );
      if (!existingWebsites.has(normalizedUrl)) {
        await tx.insert(contactWebsites).values({
          contactId,
          url: website,
          normalizedUrl,
          label: 'company',
          isPrimary: existingWebsites.size === 0,
        });
      }
    }

    const address = compactString(draft.address);
    if (address) {
      const existingAddresses = new Set(
        (
          await tx
            .select()
            .from(contactAddresses)
            .where(eq(contactAddresses.contactId, contactId))
        ).map(
          (item) => compactString(item.formattedAddress)?.toLowerCase() ?? '',
        ),
      );
      if (!existingAddresses.has(address.toLowerCase())) {
        await tx.insert(contactAddresses).values({
          contactId,
          formattedAddress: address,
          label: 'office',
          isPrimary: existingAddresses.size === 0,
        });
      }
    }
  }

  private inverseRelationshipType(
    type: ContactRelationshipDto['relationshipType'],
  ) {
    const inverses: Record<ContactRelationshipDto['relationshipType'], string> =
      {
        referral: 'referred',
        relative: 'relative',
        father: 'child',
        mother: 'child',
        son: 'parent',
        daughter: 'parent',
        guardian: 'ward',
        work_partner: 'work_partner',
      };
    return inverses[type];
  }

  private isProfessionalRelationship(
    type: ContactRelationshipDto['relationshipType'],
  ) {
    return type === 'referral' || type === 'work_partner';
  }

  private graphGroupForRelationship(type: string) {
    if (type === 'referral') return 'Referral';
    if (type === 'work_partner') return 'Work Partner';
    return this.toTitleCase(type.replace(/_/g, ' '));
  }

  private toTitleCase(value: string) {
    return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private assertCreatableDraft(draft: ContactDraftDto) {
    const hasName = Boolean(compactString(draft.fullName));
    const hasEmail = (draft.emails ?? []).some((email) => compactString(email));
    const hasPhone = (draft.phones ?? []).some((phone) =>
      compactString(phone.number),
    );

    if (!hasName && !hasEmail && !hasPhone) {
      throw new BadRequestException(
        'At least one of fullName, email, or phone is required',
      );
    }
  }

  private fallbackDisplayName(draft: ContactDraftDto) {
    return (
      compactString(draft.emails?.[0]) ??
      compactString(draft.phones?.[0]?.number) ??
      'Unnamed contact'
    );
  }

  private uniqueStrings(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private addMatchReason(
    reasons: Map<string, Set<string>>,
    contactId: string,
    reason: string,
  ) {
    const existing = reasons.get(contactId) ?? new Set<string>();
    existing.add(reason);
    reasons.set(contactId, existing);
  }

  private escapeVCardValue(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  private escapeVCardParam(value: string) {
    return value.replace(/[^a-z0-9_-]/gi, '').toUpperCase() || 'OTHER';
  }
}
