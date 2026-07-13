/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/db/database.module';

type CreatedContactResponse = {
  id: string;
  fullName: string;
  displayName: string;
  designation: string | null;
  company: string | null;
  relationshipToUser: string | null;
  source: string;
  emails: Array<{
    email: string;
    normalizedEmail: string;
    label: string;
    isPrimary: boolean;
  }>;
  phones: Array<{
    phoneNumber: string;
    normalizedPhone: string;
    label: string;
    isPrimary: boolean;
  }>;
  websites: Array<{
    url: string;
    normalizedUrl: string;
    label: string;
    isPrimary: boolean;
  }>;
  addresses: Array<{
    formattedAddress: string;
    label: string;
    isPrimary: boolean;
  }>;
};

const contactPayload = {
  fullName: ' Ada Lovelace ',
  designation: 'Chief Mathematician',
  company: 'Analytical Engines LLC',
  relationshipToUser: 'Client',
  emails: ['ada.lovelace.e2e@example.com'],
  phones: [{ label: 'mobile', number: '(518) 555-1111' }],
  website: 'https://www.analytical-engines.example/team',
  address: '12 Market Street, Albany, NY',
  sourceType: 'manual',
};

describe('Contacts API (e2e)', () => {
  let app: INestApplication;
  let pool: Pool;
  const createdContactIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    pool = app.get<Pool>(PG_POOL);
  });

  afterEach(async () => {
    await deleteCreatedContacts(pool, createdContactIds);
    createdContactIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('creates a contact, persists nested rows, and reads the same data back', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/contacts')
      .send(contactPayload)
      .expect(201);

    const created = createResponse.body as CreatedContactResponse;
    createdContactIds.push(created.id);

    expect(created).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        fullName: 'Ada Lovelace',
        displayName: 'Ada Lovelace',
        designation: 'Chief Mathematician',
        company: 'Analytical Engines LLC',
        relationshipToUser: 'Client',
        source: 'manual',
      }),
    );
    expect(created.emails).toHaveLength(1);
    expect(created.emails[0]).toEqual(
      expect.objectContaining({
        email: 'ada.lovelace.e2e@example.com',
        normalizedEmail: 'ada.lovelace.e2e@example.com',
        label: 'work',
        isPrimary: true,
      }),
    );
    expect(created.phones).toHaveLength(1);
    expect(created.phones[0]).toEqual(
      expect.objectContaining({
        phoneNumber: '(518) 555-1111',
        normalizedPhone: '5185551111',
        label: 'mobile',
        isPrimary: true,
      }),
    );
    expect(created.websites).toHaveLength(1);
    expect(created.websites[0]).toEqual(
      expect.objectContaining({
        url: 'https://www.analytical-engines.example/team',
        normalizedUrl: 'analytical-engines.example',
        label: 'company',
        isPrimary: true,
      }),
    );
    expect(created.addresses).toHaveLength(1);
    expect(created.addresses[0]).toEqual(
      expect.objectContaining({
        formattedAddress: '12 Market Street, Albany, NY',
        label: 'office',
        isPrimary: true,
      }),
    );

    const persisted = await fetchPersistedContactRows(pool, created.id);
    expect(persisted.contact).toEqual(
      expect.objectContaining({
        full_name: 'Ada Lovelace',
        display_name: 'Ada Lovelace',
        designation: 'Chief Mathematician',
        company: 'Analytical Engines LLC',
        relationship_to_user: 'Client',
        source: 'manual',
      }),
    );
    expect(persisted.email).toEqual(
      expect.objectContaining({
        email: 'ada.lovelace.e2e@example.com',
        normalized_email: 'ada.lovelace.e2e@example.com',
        is_primary: true,
      }),
    );
    expect(persisted.phone).toEqual(
      expect.objectContaining({
        phone_number: '(518) 555-1111',
        normalized_phone: '5185551111',
        is_primary: true,
      }),
    );
    expect(persisted.website).toEqual(
      expect.objectContaining({
        url: 'https://www.analytical-engines.example/team',
        normalized_url: 'analytical-engines.example',
        is_primary: true,
      }),
    );
    expect(persisted.address).toEqual(
      expect.objectContaining({
        formatted_address: '12 Market Street, Albany, NY',
        is_primary: true,
      }),
    );

    const detailResponse = await request(app.getHttpServer())
      .get(`/contacts/${created.id}`)
      .expect(200);

    expect(detailResponse.body).toEqual(
      expect.objectContaining({
        id: created.id,
        fullName: 'Ada Lovelace',
        emails: expect.arrayContaining([
          expect.objectContaining({
            normalizedEmail: 'ada.lovelace.e2e@example.com',
          }),
        ]),
        phones: expect.arrayContaining([
          expect.objectContaining({ normalizedPhone: '5185551111' }),
        ]),
      }),
    );
  });

  it('lists created contacts with primary email and phone summary fields', async () => {
    const { body: created } = await request(app.getHttpServer())
      .post('/contacts')
      .send({ ...contactPayload, fullName: 'List Summary Contact' })
      .expect(201);
    createdContactIds.push(created.id);

    const { body: contacts } = await request(app.getHttpServer())
      .get('/contacts')
      .expect(200);
    const summary = contacts.find(
      (contact: { id: string }) => contact.id === created.id,
    );

    expect(summary).toEqual(
      expect.objectContaining({
        id: created.id,
        fullName: 'List Summary Contact',
        primaryEmail: 'ada.lovelace.e2e@example.com',
        primaryPhone: '(518) 555-1111',
        source: 'manual',
      }),
    );
  });

  it('detects duplicates from the data that was actually stored', async () => {
    const { body: created } = await request(app.getHttpServer())
      .post('/contacts')
      .send({ ...contactPayload, fullName: 'Duplicate Source Contact' })
      .expect(201);
    createdContactIds.push(created.id);

    const { body } = await request(app.getHttpServer())
      .post('/contacts/duplicates/check')
      .send({
        fullName: 'Different Name',
        emails: ['ADA.LOVELACE.E2E@EXAMPLE.COM'],
        phones: [{ label: 'office', number: '518-555-1111' }],
        sourceType: 'manual',
      })
      .expect(201);

    expect(body).toEqual(
      expect.objectContaining({
        hasMatches: true,
        matches: expect.arrayContaining([
          expect.objectContaining({
            contactId: created.id,
            fullName: 'Duplicate Source Contact',
            matchedOn: expect.arrayContaining(['email', 'phone']),
            score: 0.95,
          }),
        ]),
      }),
    );
  });

  it('rejects an empty draft and does not create a fallback contact', async () => {
    const beforeCount = await countContactsByEmail(
      pool,
      'missing-contact.e2e@example.com',
    );

    await request(app.getHttpServer())
      .post('/contacts')
      .send({ emails: [], phones: [], sourceType: 'manual' })
      .expect(400);

    const afterCount = await countContactsByEmail(
      pool,
      'missing-contact.e2e@example.com',
    );
    expect(afterCount).toBe(beforeCount);
  });

  it('rejects unknown fields through the real validation layer', async () => {
    await request(app.getHttpServer())
      .post('/contacts')
      .send({
        fullName: 'Invalid Extra Field Contact',
        sourceType: 'manual',
        unsupportedField: 'should not be accepted',
      })
      .expect(400);
  });

  it('extracts a populated contact draft from business card text', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/extractions/business-card')
      .field(
        'rawText',
        `
          Ada Lovelace
          Chief Mathematician
          Analytical Engines LLC
          ada@analytical.example
          Mobile (518) 555-1111
          www.analytical.example
          12 Market Street, Albany, NY
          Client
        `,
      )
      .expect(201);

    expect(body).toEqual(
      expect.objectContaining({
        sourceType: 'business_card',
        fileReceived: false,
        rawText: expect.stringContaining('Ada Lovelace'),
        draft: expect.objectContaining({
          fullName: 'Ada Lovelace',
          designation: 'Chief Mathematician',
          company: 'Analytical Engines LLC',
          relationshipToUser: 'Client',
          emails: ['ada@analytical.example'],
          phones: [{ label: 'mobile', number: '(518) 555-1111' }],
          website: 'www.analytical.example',
          address: '12 Market Street, Albany, NY',
        }),
      }),
    );
  });

  it('extracts a populated contact draft from voice transcript text', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/extractions/voice')
      .field(
        'transcript',
        'John Smith, Sales Manager at ABC Realty. Email john@abc.com. Mobile 518-555-1111. Office 518-555-2222. Website abc.com. Vendor.',
      )
      .expect(201);

    expect(body).toEqual(
      expect.objectContaining({
        sourceType: 'voice',
        fileReceived: false,
        draft: expect.objectContaining({
          fullName: 'John Smith',
          designation: 'Sales Manager',
          company: 'ABC Realty',
          relationshipToUser: 'Vendor',
          emails: ['john@abc.com'],
          phones: [
            { label: 'mobile', number: '518-555-1111' },
            { label: 'office', number: '518-555-2222' },
          ],
          website: 'abc.com',
        }),
      }),
    );
  });

  it('exports one or many contacts as vCard text', async () => {
    const { body: first } = await request(app.getHttpServer())
      .post('/contacts')
      .send({ ...contactPayload, fullName: 'VCF Export One' })
      .expect(201);
    const { body: second } = await request(app.getHttpServer())
      .post('/contacts')
      .send({
        ...contactPayload,
        fullName: 'VCF Export Two',
        emails: ['vcf-two@example.com'],
      })
      .expect(201);
    createdContactIds.push(first.id, second.id);

    const single = await request(app.getHttpServer())
      .get(`/contacts/${first.id}/vcf`)
      .expect(200);
    expect(single.text).toContain('BEGIN:VCARD');
    expect(single.text).toContain('FN:VCF Export One');
    expect(single.text).toContain(
      'EMAIL;TYPE=WORK:ada.lovelace.e2e@example.com',
    );

    const many = await request(app.getHttpServer())
      .get(`/contacts/export/vcf?ids=${first.id},${second.id}`)
      .expect(200);
    expect(many.text.match(/BEGIN:VCARD/g)).toHaveLength(2);
    expect(many.text).toContain('FN:VCF Export Two');
  });

  it('adds a contact to a named group and exposes it in the graph', async () => {
    const groupName = `E2E Group ${Date.now()}`;
    const { body: created } = await request(app.getHttpServer())
      .post('/contacts')
      .send({ ...contactPayload, fullName: 'Grouped Contact' })
      .expect(201);
    createdContactIds.push(created.id);

    const { body: membership } = await request(app.getHttpServer())
      .post(`/contacts/${created.id}/groups`)
      .send({ name: groupName, role: 'member' })
      .expect(201);

    expect(membership).toEqual(
      expect.objectContaining({
        contactId: created.id,
        role: 'member',
        group: expect.objectContaining({ name: groupName }),
      }),
    );

    const { body: graph } = await request(app.getHttpServer())
      .get('/contacts/graph')
      .expect(200);
    const node = graph.nodes.find(
      (item: { id: string }) => item.id === created.id,
    );
    expect(node.groups).toContain(groupName);
  });

  it('soft deletes contacts so they disappear from contact workflows', async () => {
    const { body: created } = await request(app.getHttpServer())
      .post('/contacts')
      .send({ ...contactPayload, fullName: 'Delete Me Contact' })
      .expect(201);
    createdContactIds.push(created.id);

    await request(app.getHttpServer())
      .delete(`/contacts/${created.id}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ deleted: true, contactId: created.id });
      });

    await request(app.getHttpServer())
      .get(`/contacts/${created.id}`)
      .expect(404);

    const { body: contacts } = await request(app.getHttpServer())
      .get('/contacts')
      .expect(200);
    expect(
      contacts.some((contact: { id: string }) => contact.id === created.id),
    ).toBe(false);

    const { body: graph } = await request(app.getHttpServer())
      .get('/contacts/graph')
      .expect(200);
    expect(
      graph.nodes.some((contact: { id: string }) => contact.id === created.id),
    ).toBe(false);
  });
});

async function fetchPersistedContactRows(pool: Pool, contactId: string) {
  const [contact, email, phone, website, address] = await Promise.all([
    pool.query('select * from contacts where id = $1', [contactId]),
    pool.query('select * from contact_emails where contact_id = $1', [
      contactId,
    ]),
    pool.query('select * from contact_phones where contact_id = $1', [
      contactId,
    ]),
    pool.query('select * from contact_websites where contact_id = $1', [
      contactId,
    ]),
    pool.query('select * from contact_addresses where contact_id = $1', [
      contactId,
    ]),
  ]);

  return {
    contact: contact.rows[0],
    email: email.rows[0],
    phone: phone.rows[0],
    website: website.rows[0],
    address: address.rows[0],
  };
}

async function countContactsByEmail(pool: Pool, email: string) {
  const result = await pool.query(
    `
      select count(*)::int as count
      from contacts
      inner join contact_emails on contact_emails.contact_id = contacts.id
      where contact_emails.normalized_email = lower($1)
    `,
    [email],
  );

  return result.rows[0].count as number;
}

async function deleteCreatedContacts(pool: Pool, contactIds: string[]) {
  if (contactIds.length === 0) {
    return;
  }

  await pool.query(
    'delete from contact_group_members where contact_id = any($1::uuid[])',
    [contactIds],
  );
  await pool.query(
    'delete from contact_relationships where from_contact_id = any($1::uuid[]) or to_contact_id = any($1::uuid[])',
    [contactIds],
  );
  await pool.query(
    'delete from contact_addresses where contact_id = any($1::uuid[])',
    [contactIds],
  );
  await pool.query(
    'delete from contact_websites where contact_id = any($1::uuid[])',
    [contactIds],
  );
  await pool.query(
    'delete from contact_phones where contact_id = any($1::uuid[])',
    [contactIds],
  );
  await pool.query(
    'delete from contact_emails where contact_id = any($1::uuid[])',
    [contactIds],
  );
  await pool.query('delete from contacts where id = any($1::uuid[])', [
    contactIds,
  ]);
}
