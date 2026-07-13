import type { ContactSummary } from '../types'

export const mockContacts: ContactSummary[] = [
  {
    id: '1',
    name: 'John Doe',
    company: 'ABC Realty',
    title: 'Sales Manager',
    email: 'john@abc.com',
    phone: '518-555-1111',
    relationship: 'Vendor',
    source: 'Business card',
  },
  {
    id: '2',
    name: 'Sarah Doe',
    company: 'Doe Advisory',
    title: 'Accountant',
    email: 'sarah@doeadvisory.com',
    phone: '518-555-9020',
    relationship: 'Accountant',
    source: 'Voice',
  },
]
