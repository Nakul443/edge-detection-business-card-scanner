export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}

export function normalizeWebsite(url: string) {
  const trimmed = url.trim().toLowerCase();
  const withProtocol = /^https?:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '');
  }
}

export function compactString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
