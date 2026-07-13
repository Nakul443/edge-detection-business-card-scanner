const API_URL = import.meta.env.VITE_API_URL ?? '/api'

export type ApiContactSummary = {
  id: string
  fullName: string
  displayName: string
  designation: string | null
  company: string | null
  relationshipToUser: string | null
  source: string
  primaryEmail: string | null
  primaryPhone: string | null
}

export type ContactDraftPayload = {
  fullName?: string
  designation?: string
  company?: string
  relationshipToUser?: string
  emails?: string[]
  phones?: Array<{
    label: string
    number: string
  }>
  website?: string
  address?: string
  sourceType: 'business_card' | 'voice' | 'manual'
}

export type DuplicateCheckResult = {
  hasMatches: boolean
  matches: Array<{
    contactId: string
    fullName: string
    company: string | null
    matchedOn: string[]
    score: number
  }>
}

export type ApiContactDetail = ApiContactSummary & {
  emails?: Array<{ email: string }>
  phones?: Array<{ phoneNumber: string }>
  websites?: Array<{ url: string }>
  addresses?: Array<{ formattedAddress: string | null }>
  relationships?: Array<{
    id: string
    fromContactId: string
    toContactId: string
    relationshipType: string
    inverseRelationshipType: string | null
    relationshipCategory: string
  }>
}

export type ContactGroup = {
  id: string
  name: string
  groupType: string
  description: string | null
}

export type RelationshipType =
  | 'referral'
  | 'relative'
  | 'father'
  | 'mother'
  | 'son'
  | 'daughter'
  | 'guardian'
  | 'work_partner'

export type ContactGraph = {
  nodes: Array<ApiContactSummary & { groups: string[] }>
  edges: Array<{
    id: string
    fromContactId: string
    toContactId: string
    relationshipType: string
    inverseRelationshipType: string | null
    group: string
  }>
  groups: string[]
}

export type ExtractionResult = {
  sourceType: 'business_card' | 'voice'
  rawText: string
  fileReceived: boolean
  draft: {
    fullName: string | null
    designation: string | null
    company: string | null
    relationshipToUser: string | null
    emails: string[]
    phones: Array<{
      label: string
      number: string
    }>
    website: string | null
    address: string | null
  }
}

export async function fetchContacts() {
  const response = await fetch(`${API_URL}/contacts`)

  if (!response.ok) {
    throw new Error('Failed to load contacts')
  }

  return (await response.json()) as ApiContactSummary[]
}

export async function fetchContact(contactId: string) {
  const response = await fetch(`${API_URL}/contacts/${contactId}`)

  if (!response.ok) {
    throw new Error('Failed to load contact')
  }

  return (await response.json()) as ApiContactDetail
}

export async function fetchContactGraph() {
  const response = await fetch(`${API_URL}/contacts/graph`)

  if (!response.ok) {
    throw new Error('Failed to load contact graph')
  }

  return (await response.json()) as ContactGraph
}

export async function fetchContactGroups() {
  const response = await fetch(`${API_URL}/contacts/groups`)

  if (!response.ok) {
    throw new Error('Failed to load contact groups')
  }

  return (await response.json()) as ContactGroup[]
}

export async function extractBusinessCard(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_URL}/extractions/business-card`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to extract card'))
  }

  return (await response.json()) as ExtractionResult
}

export async function extractVoiceTranscript(transcript: string) {
  const formData = new FormData()
  formData.append('transcript', transcript)

  const response = await fetch(`${API_URL}/extractions/voice`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to extract voice transcript'))
  }

  return (await response.json()) as ExtractionResult
}

export async function extractVoiceAudio(file: File, transcript?: string) {
  const formData = new FormData()
  formData.append('file', file)
  if (transcript?.trim()) {
    formData.append('transcript', transcript)
  }

  const response = await fetch(`${API_URL}/extractions/voice`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to transcribe voice audio'))
  }

  return (await response.json()) as ExtractionResult
}

export async function checkDuplicates(payload: ContactDraftPayload) {
  const response = await fetch(`${API_URL}/contacts/duplicates/check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to check duplicates'))
  }

  return (await response.json()) as DuplicateCheckResult
}

export async function createContact(payload: ContactDraftPayload) {
  const response = await fetch(`${API_URL}/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to create contact'))
  }

  return (await response.json()) as ApiContactDetail
}

export async function mergeContact(contactId: string, payload: ContactDraftPayload) {
  const response = await fetch(`${API_URL}/contacts/${contactId}/merge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to merge contact'))
  }

  return (await response.json()) as ApiContactDetail
}

export async function deleteContact(contactId: string) {
  const response = await fetch(`${API_URL}/contacts/${contactId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to delete contact'))
  }

  return response.json() as Promise<{ deleted: boolean; contactId: string }>
}

export async function addContactToGroup(contactId: string, name: string, role?: string) {
  const response = await fetch(`${API_URL}/contacts/${contactId}/groups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, role }),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to add contact to group'))
  }

  return response.json()
}

export async function exportContactVcf(contactId: string) {
  const response = await fetch(`${API_URL}/contacts/${contactId}/vcf`)

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to export contact'))
  }

  return response.blob()
}

export async function exportContactsVcf(contactIds: string[]) {
  const response = await fetch(`${API_URL}/contacts/export/vcf?ids=${encodeURIComponent(contactIds.join(','))}`)

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to export contacts'))
  }

  return response.blob()
}

export async function createContactRelationship(
  contactId: string,
  toContactId: string,
  relationshipType: RelationshipType,
) {
  const response = await fetch(`${API_URL}/contacts/${contactId}/relationships`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ toContactId, relationshipType }),
  })

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to link contact'))
  }

  return response.json()
}

async function getErrorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string | string[] }
    if (Array.isArray(body.message)) return body.message.join(', ')
    return body.message ?? fallback
  } catch {
    return fallback
  }
}
