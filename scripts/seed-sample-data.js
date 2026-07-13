const { Pool } = require('pg')

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgres://bhumio:bhumio_dev_password@localhost:5432/bhumio_contacts'
const seedOnlyIfEmpty = process.argv.includes('--if-empty')

const sampleContacts = [
  {
    key: 'tejas',
    fullName: 'Tejas Kamal Sahoo',
    designation: 'Software Developer',
    company: 'Bhumio',
    relationshipToUser: 'Self',
    email: 'tejas@bhumio.com',
    phone: '9870000001',
    address: 'Office Address, United States',
    group: 'Bhumio',
  },
  {
    key: 'aarav',
    fullName: 'Aarav Mehta',
    designation: 'Senior Software Engineer',
    company: 'Bhumio',
    relationshipToUser: 'Work',
    email: 'aarav@bhumio.com',
    phone: '9870000002',
    address: 'Bandra, Mumbai',
    group: 'Bhumio',
  },
  {
    key: 'vinod',
    fullName: 'Vinod C',
    designation: 'Founder',
    company: 'Bhumio',
    relationshipToUser: 'Work',
    email: 'vinod@bhumio.com',
    phone: '9870000003',
    address: 'United States',
    group: 'Bhumio',
  },
  {
    key: 'john-doe',
    fullName: 'John Doe',
    designation: 'Property Consultant',
    company: 'Doe Realty',
    relationshipToUser: 'Friend',
    email: 'john.doe@example.com',
    phone: '9870000011',
    address: '14 Maple Avenue, Albany',
    group: 'Doe Family',
  },
  {
    key: 'sarah-doe',
    fullName: 'Sarah Doe',
    designation: 'Interior Designer',
    company: 'Doe Studio',
    relationshipToUser: 'Friend',
    email: 'sarah.doe@example.com',
    phone: '9870000012',
    address: '14 Maple Avenue, Albany',
    group: 'Doe Family',
  },
  {
    key: 'jane-doe',
    fullName: 'Jane Doe',
    designation: 'Student',
    company: 'Albany High School',
    relationshipToUser: 'Relative',
    email: 'jane.doe@example.com',
    phone: '9870000013',
    address: '14 Maple Avenue, Albany',
    group: 'Doe Family',
  },
  {
    key: 'jack-doe',
    fullName: 'Jack Doe',
    designation: 'Student',
    company: 'Albany High School',
    relationshipToUser: 'Relative',
    email: 'jack.doe@example.com',
    phone: '9870000014',
    address: '14 Maple Avenue, Albany',
    group: 'Doe Family',
  },
]

async function main() {
  const pool = new Pool({ connectionString: databaseUrl })

  try {
    await pool.query('begin')

    if (seedOnlyIfEmpty) {
      const existingContacts = await pool.query('select count(*)::int as count from contacts')
      if ((existingContacts.rows[0]?.count ?? 0) > 0) {
        await pool.query('commit')
        console.log('Database already has contacts. Skipping sample seed.')
        return
      }
    }

    await pool.query('delete from contact_group_members')
    await pool.query('delete from contact_relationships')
    await pool.query('delete from contact_addresses')
    await pool.query('delete from contact_websites')
    await pool.query('delete from contact_phones')
    await pool.query('delete from contact_emails')
    await pool.query('delete from contacts')
    await pool.query('delete from contact_groups')

    const groupIds = new Map()
    const contactIds = new Map()

    for (const groupName of [...new Set(sampleContacts.map((contact) => contact.group))]) {
      const existingGroup = await pool.query('select id from contact_groups where name = $1 limit 1', [
        groupName,
      ])
      if (existingGroup.rows[0]?.id) {
        groupIds.set(groupName, existingGroup.rows[0].id)
        continue
      }

      const { rows } = await pool.query(
        `
          insert into contact_groups (name, group_type)
          values ($1, 'demo')
          returning id
        `,
        [groupName],
      )
      groupIds.set(groupName, rows[0].id)
    }

    for (const contact of sampleContacts) {
      const inserted = await pool.query(
        `
          insert into contacts (full_name, display_name, designation, company, relationship_to_user, source)
          values ($1, $1, $2, $3, $4, 'manual')
          returning id
        `,
        [contact.fullName, contact.designation, contact.company, contact.relationshipToUser],
      )
      const contactId = inserted.rows[0].id
      contactIds.set(contact.key, contactId)

      await pool.query(
        `
          insert into contact_emails (contact_id, email, normalized_email, label, is_primary)
          values ($1, $2, lower($2), 'work', true)
        `,
        [contactId, contact.email],
      )
      await pool.query(
        `
          insert into contact_phones (contact_id, phone_number, normalized_phone, label, is_primary)
          values ($1, $2, regexp_replace($2, '[^0-9]', '', 'g'), 'mobile', true)
        `,
        [contactId, contact.phone],
      )
      await pool.query(
        `
          insert into contact_addresses (contact_id, formatted_address, label, is_primary)
          values ($1, $2, 'office', true)
        `,
        [contactId, contact.address],
      )
      await pool.query(
        `
          insert into contact_group_members (group_id, contact_id, role)
          values ($1, $2, 'member')
        `,
        [groupIds.get(contact.group), contactId],
      )
    }

    await insertRelationship(pool, contactIds.get('tejas'), contactIds.get('aarav'), 'work_partner', 'work_partner', 'professional')
    await insertRelationship(pool, contactIds.get('tejas'), contactIds.get('vinod'), 'work_partner', 'work_partner', 'professional')
    await insertRelationship(pool, contactIds.get('john-doe'), contactIds.get('jane-doe'), 'father', 'daughter', 'family')
    await insertRelationship(pool, contactIds.get('john-doe'), contactIds.get('jack-doe'), 'father', 'son', 'family')
    await insertRelationship(pool, contactIds.get('sarah-doe'), contactIds.get('jane-doe'), 'mother', 'daughter', 'family')
    await insertRelationship(pool, contactIds.get('sarah-doe'), contactIds.get('jack-doe'), 'mother', 'son', 'family')
    await insertRelationship(pool, contactIds.get('jane-doe'), contactIds.get('jack-doe'), 'sister', 'brother', 'family')

    await pool.query('commit')
    console.log(`Seeded ${sampleContacts.length} contacts, groups, and relationships.`)
  } catch (error) {
    await pool.query('rollback')
    console.error(error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

async function insertRelationship(pool, fromContactId, toContactId, type, inverse, category) {
  await pool.query(
    `
      insert into contact_relationships (
        from_contact_id,
        to_contact_id,
        relationship_type,
        inverse_relationship_type,
        relationship_category
      )
      values ($1, $2, $3, $4, $5)
    `,
    [fromContactId, toContactId, type, inverse, category],
  )
}

void main()
