export type Page = 'add' | 'contacts' | 'graph'

export type InputMode = 'image' | 'voice'

export type ContactSummary = {
  id: string
  name: string
  company: string
  title: string
  email: string
  phone: string
  relationship: string
  source: string
}

export type ContactDraft = {
  fullName: string
  designation: string
  company: string
  relationshipToUser: string
  email: string
  phone: string
  website: string
  address: string
  sourceType: 'business_card' | 'voice' | 'manual'
}
