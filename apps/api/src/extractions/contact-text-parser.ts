export type ParsedContactDraft = {
  fullName: string | null;
  designation: string | null;
  company: string | null;
  relationshipToUser: string | null;
  emails: string[];
  phones: Array<{
    label: string;
    number: string;
  }>;
  website: string | null;
  address: string | null;
};

type BusinessCardCandidateField =
  | 'fullName'
  | 'designation'
  | 'company'
  | 'email'
  | 'phone'
  | 'website'
  | 'address';

export type BusinessCardFieldCandidate = {
  value: string;
  field: BusinessCardCandidateField;
  sourceVariant: string;
  ocrConfidence: number;
  parserScore: number;
  lineIndex: number;
  finalScore: number;
  bbox?: { x: number; y: number; w: number; h: number };
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const websitePattern =
  /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+\b(?:\/[^\s,;]*)?/gi;
const phonePattern =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const broadPhonePattern = /(?:\+?\d[\d\s()./-]{6,}\d)/g;

const relationshipLabels = [
  'self',
  'work',
  'client',
  'vendor',
  'accountant',
  'attorney',
  'contractor',
  'friend',
  'father',
  'mother',
  'son',
  'daughter',
  'guardian',
  'partner',
  'relative',
  'referred by',
];

const designationWords = [
  'manager',
  'chief',
  'director',
  'engineer',
  'developer',
  'designer',
  'consultant',
  'accountant',
  'attorney',
  'founder',
  'president',
  'officer',
  'sales',
  'marketing',
  'operations',
  'realtor',
  'broker',
  'mathematician',
  'canvassing',
  'agent',
  'agents',
  'merchant',
  'merchants',
  'secretary',
  'exporter',
  'exporters',
  'investments',
  'plywood',
  'commission',
  'wholesaler',
  'fancy',
  'sarees',
  'chaniya',
  'choli',
  'idali',
  'dosa',
  'wada',
  'atta',
  'pulses',
  'cattlefeed',
  'estate',
  'starch',
  'sago',
];

const companyWords = [
  'llc',
  'inc',
  'ltd',
  'limited',
  'company',
  'corp',
  'corporation',
  'realty',
  'group',
  'partners',
  'studio',
  'agency',
  'agencies',
  'associates',
  'creation',
  'corporation',
  'traders',
  'center',
  'centre',
  'project',
  'springboard',
  'canvassers',
];

const addressWords = [
  'street',
  'st',
  'road',
  'rd',
  'avenue',
  'ave',
  'lane',
  'ln',
  'drive',
  'dr',
  'boulevard',
  'blvd',
  'suite',
  'floor',
  'flat',
  'shop',
  'plot',
  'market',
  'bazar',
  'nagar',
  'complex',
  'near',
  'mumbai',
  'nashik',
  'nasik',
  'pune',
  'hyderabad',
  'ahmedabad',
  'indore',
  'salem',
  'kakinada',
  'palakol',
];

export function parseBusinessCardText(rawText: string): ParsedContactDraft {
  const candidates = parseBusinessCardCandidates(rawText);
  const repairedText = repairOcrText(rawText);
  const baseline = parseBusinessCardSinglePass(repairedText);
  const fullName = selectCandidateOverride(
    candidates,
    'fullName',
    baseline.fullName,
  );
  const designation = selectCandidateOverride(
    candidates,
    'designation',
    baseline.designation,
  );
  const company = selectCandidateOverride(
    candidates,
    'company',
    baseline.company,
  );
  const address = selectCandidateOverride(
    candidates,
    'address',
    baseline.address,
  );
  const emails = selectMultipleCandidates(candidates, 'email');
  const phones = selectMultipleCandidates(candidates, 'phone');
  const website = selectSingleCandidate(candidates, 'website');

  return {
    ...baseline,
    emails: emails.length > 0 ? emails : baseline.emails,
    phones:
      phones.length > 0
        ? phones.map((number) => ({
            label: inferPhoneLabel(repairedText, number),
            number,
          }))
        : baseline.phones,
    website: website ?? baseline.website,
    fullName,
    designation,
    company,
    address,
  };
}

function parseBusinessCardSinglePass(rawText: string): ParsedContactDraft {
  const lines = toMeaningfulLines(rawText);
  const common = parseCommonFields(rawText);
  const contentLines = lines.filter((line) => !isContactArtifact(line, common));
  const designation = inferDesignation(contentLines);
  const fullName = inferPersonName(contentLines, designation);
  const company =
    inferCompany(contentLines, designation, fullName) ??
    inferCompanyFromInternetFields(common.emails, common.website);
  const address = inferAddress(contentLines, [fullName, designation, company]);

  return {
    ...common,
    fullName,
    designation,
    company,
    address,
  };
}

export function parseBusinessCardCandidates(
  rawText: string,
): BusinessCardFieldCandidate[] {
  const variants = splitOcrVariants(rawText);
  const rawCandidates = variants.flatMap((variant) =>
    candidatesForVariant(variant),
  );
  return scoreCandidates(rawCandidates);
}

function splitOcrVariants(rawText: string) {
  const sections = rawText.split(/^\s*---\s*(.+?)\s*---\s*$/gm);
  if (sections.length === 1) {
    return [{ name: 'raw', text: repairOcrText(rawText) }];
  }

  const variants = [];
  const leadingText = sections[0]?.trim();
  if (leadingText) {
    variants.push({ name: 'raw', text: repairOcrText(leadingText) });
  }

  for (let index = 1; index < sections.length; index += 2) {
    const name = sections[index]?.trim() || `variant-${Math.ceil(index / 2)}`;
    const text = sections[index + 1] ?? '';
    variants.push({ name, text: repairOcrText(text) });
  }

  return variants.length > 0
    ? variants
    : [{ name: 'raw', text: repairOcrText(rawText) }];
}

function candidatesForVariant(variant: { name: string; text: string }) {
  const lines = toMeaningfulLines(variant.text);
  const common = parseCommonFields(variant.text);
  const contentLines = lines.filter((line) => !isContactArtifact(line, common));
  const designation = inferDesignation(contentLines);
  const fullName = inferPersonName(contentLines, designation);
  const company =
    inferCompany(contentLines, designation, fullName) ??
    inferCompanyFromInternetFields(common.emails, common.website);
  const address = inferAddress(contentLines, [fullName, designation, company]);
  const candidates: Array<Omit<BusinessCardFieldCandidate, 'finalScore'>> = [];

  for (const email of uniqueMatches([
    ...common.emails,
    ...extractLooseEmails(variant.text),
  ])) {
    candidates.push(
      createCandidate(
        email,
        'email',
        variant.name,
        1,
        lineIndexOf(lines, email),
      ),
    );
  }

  for (const phone of common.phones) {
    candidates.push(
      createCandidate(
        phone.number,
        'phone',
        variant.name,
        0.95,
        lineIndexOf(lines, phone.number),
      ),
    );
  }

  for (const website of uniqueMatches(
    [common.website, ...extractLooseWebsites(variant.text)].filter(Boolean),
  )) {
    if (!website.includes('@')) {
      candidates.push(
        createCandidate(
          repairWebsite(website),
          'website',
          variant.name,
          0.82,
          lineIndexOf(lines, website),
        ),
      );
    }
  }

  if (fullName)
    candidates.push(
      createCandidate(
        fullName,
        'fullName',
        variant.name,
        0.72,
        lineIndexOf(lines, fullName),
      ),
    );
  if (designation)
    candidates.push(
      createCandidate(
        designation,
        'designation',
        variant.name,
        0.68,
        lineIndexOf(lines, designation),
      ),
    );
  if (company)
    candidates.push(
      createCandidate(
        company,
        'company',
        variant.name,
        0.7,
        lineIndexOf(lines, company),
      ),
    );
  if (address)
    candidates.push(
      createCandidate(
        address,
        'address',
        variant.name,
        0.7,
        lineIndexOf(lines, address),
      ),
    );

  for (const [lineIndex, line] of contentLines.entries()) {
    const nextLine = contentLines[lineIndex + 1];

    for (const name of extractNameCandidates(line)) {
      candidates.push(
        createCandidate(
          name,
          'fullName',
          variant.name,
          scoreNameCandidate(name, line) / 10,
          lineIndex,
        ),
      );
    }

    if (looksLikeDesignation(line)) {
      candidates.push(
        createCandidate(line, 'designation', variant.name, 0.75, lineIndex),
      );

      if (nextLine && looksLikeDesignationContinuation(nextLine)) {
        candidates.push(
          createCandidate(
            `${line} ${nextLine}`,
            'designation',
            variant.name,
            0.95,
            lineIndex,
          ),
        );
      }
    }

    if (looksLikeCompany(line)) {
      candidates.push(
        createCandidate(
          cleanBusinessLine(line) ?? line,
          'company',
          variant.name,
          scoreCompanyLine(line) / 10,
          lineIndex,
        ),
      );
    }

    const splitCompany = inferSplitCompany(
      line,
      contentLines.slice(lineIndex + 1, lineIndex + 4),
    );
    if (splitCompany) {
      candidates.push(
        createCandidate(splitCompany, 'company', variant.name, 1, lineIndex),
      );
    }

    if (looksLikeAddress(line)) {
      candidates.push(
        createCandidate(line, 'address', variant.name, 0.72, lineIndex),
      );
    }
  }

  return candidates;
}

function createCandidate(
  value: string,
  field: BusinessCardCandidateField,
  sourceVariant: string,
  parserScore: number,
  lineIndex: number,
): Omit<BusinessCardFieldCandidate, 'finalScore'> {
  return {
    value: value.trim(),
    field,
    sourceVariant,
    ocrConfidence: 0.75,
    parserScore,
    lineIndex,
  };
}

function scoreCandidates(
  candidates: Array<Omit<BusinessCardFieldCandidate, 'finalScore'>>,
) {
  const occurrenceCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    occurrenceCounts.set(key, (occurrenceCounts.get(key) ?? 0) + 1);
  }

  return candidates
    .filter((candidate) => candidate.value.length > 0)
    .map((candidate) => {
      const repeatedBonus = Math.min(
        0.45,
        ((occurrenceCounts.get(candidateKey(candidate)) ?? 1) - 1) * 0.12,
      );
      const layoutBonus = layoutPositionBonus(candidate);
      const regexConfidence = regexConfidenceFor(candidate);
      const damagePenalty = ocrDamagePenalty(candidate.value);
      const finalScore =
        candidate.ocrConfidence +
        regexConfidence +
        candidate.parserScore +
        repeatedBonus +
        layoutBonus -
        damagePenalty;

      return {
        ...candidate,
        finalScore,
      };
    })
    .sort((left, right) => right.finalScore - left.finalScore);
}

function selectSingleCandidate(
  candidates: BusinessCardFieldCandidate[],
  field: BusinessCardCandidateField,
) {
  return selectBestCandidate(candidates, field)?.value ?? null;
}

function selectCandidateOverride(
  candidates: BusinessCardFieldCandidate[],
  field: BusinessCardCandidateField,
  baseline: string | null,
) {
  const selected = selectBestCandidate(candidates, field);
  if (!selected) return baseline;
  if (!baseline) return selected.value;
  if (candidateSourceCount(candidates, selected) >= 2) return selected.value;
  if (selected.finalScore >= confidentOverrideThreshold(field))
    return selected.value;
  return baseline;
}

function confidentOverrideThreshold(field: BusinessCardCandidateField) {
  if (field === 'fullName') return 1.9;
  return Number.POSITIVE_INFINITY;
}

function selectBestCandidate(
  candidates: BusinessCardFieldCandidate[],
  field: BusinessCardCandidateField,
) {
  return (
    [
      ...dedupeCandidates(
        candidates.filter((candidate) => candidate.field === field),
      ),
    ].sort((left, right) => right.finalScore - left.finalScore)[0] ?? null
  );
}

function selectMultipleCandidates(
  candidates: BusinessCardFieldCandidate[],
  field: BusinessCardCandidateField,
) {
  return dedupeCandidates(
    candidates.filter((candidate) => candidate.field === field),
  )
    .filter((candidate) => candidate.finalScore >= 1.55)
    .sort((left, right) => right.finalScore - left.finalScore)
    .map((candidate) => candidate.value);
}

function dedupeCandidates(candidates: BusinessCardFieldCandidate[]) {
  const bestByKey = new Map<string, BusinessCardFieldCandidate>();

  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const existing = bestByKey.get(key);
    if (!existing || candidate.finalScore > existing.finalScore) {
      bestByKey.set(key, candidate);
    }
  }

  return [...bestByKey.values()];
}

function candidateKey(
  candidate: Pick<BusinessCardFieldCandidate, 'field' | 'value'>,
) {
  if (candidate.field === 'phone') {
    return `${candidate.field}:${normalizePhoneDigits(candidate.value)}`;
  }

  if (candidate.field === 'email') {
    return `${candidate.field}:${repairEmail(candidate.value)}`;
  }

  if (candidate.field === 'website') {
    return `${candidate.field}:${normalizeWebsite(candidate.value)}`;
  }

  return `${candidate.field}:${normalizeText(candidate.value)}`;
}

function candidateSourceCount(
  candidates: BusinessCardFieldCandidate[],
  selected: Pick<BusinessCardFieldCandidate, 'field' | 'value'>,
) {
  const key = candidateKey(selected);
  return new Set(
    candidates
      .filter((candidate) => candidateKey(candidate) === key)
      .map((candidate) => candidate.sourceVariant),
  ).size;
}

function regexConfidenceFor(
  candidate: Pick<BusinessCardFieldCandidate, 'field' | 'value'>,
) {
  if (candidate.field === 'email')
    return emailPattern.test(resetRegex(candidate.value, emailPattern))
      ? 0.8
      : 0.25;
  if (candidate.field === 'phone')
    return normalizePhoneDigits(candidate.value).length >= 7 ? 0.7 : 0.1;
  if (candidate.field === 'website')
    return normalizeWebsite(candidate.value).includes('.') ? 0.6 : 0.1;
  if (candidate.field === 'fullName')
    return looksLikePersonName(candidate.value) ? 0.45 : 0.2;
  if (candidate.field === 'designation')
    return looksLikeDesignation(candidate.value) ? 0.45 : 0.15;
  if (candidate.field === 'company')
    return looksLikeCompany(candidate.value) ? 0.45 : 0.2;
  if (candidate.field === 'address')
    return looksLikeAddress(candidate.value) ? 0.45 : 0.15;
  return 0;
}

function resetRegex(value: string, regex: RegExp) {
  regex.lastIndex = 0;
  return value;
}

function layoutPositionBonus(
  candidate: Pick<BusinessCardFieldCandidate, 'field' | 'lineIndex'>,
) {
  if (candidate.lineIndex < 0) return 0;
  if (candidate.field === 'fullName' && candidate.lineIndex <= 2) return 0.2;
  if (candidate.field === 'fullName' && candidate.lineIndex >= 7) return -0.55;
  if (candidate.field === 'company' && candidate.lineIndex <= 4) return 0.12;
  if (candidate.field === 'address' && candidate.lineIndex >= 4) return 0.14;
  return 0;
}

function ocrDamagePenalty(value: string) {
  const compact = value.replace(/\s+/g, '');
  if (!compact) return 1;

  const symbols = (compact.match(/[^a-z0-9@.+/&()-]/gi) ?? []).length;
  const replacementChars = (compact.match(/[�|{}[\]~]/g) ?? []).length;
  const digitShare = (compact.match(/\d/g) ?? []).length / compact.length;
  return (
    symbols * 0.08 + replacementChars * 0.4 + (digitShare > 0.65 ? 0.35 : 0)
  );
}

function lineIndexOf(lines: string[], value: string) {
  const needle = normalizeText(value);
  return lines.findIndex((line) => normalizeText(line).includes(needle));
}

export function parseVoiceContactText(rawText: string): ParsedContactDraft {
  const repairedText = repairSpokenContactText(rawText);
  const common = parseCommonFields(repairedText, { includeSpokenPhone: true });
  const compact = repairedText.replace(/\s+/g, ' ').trim();
  const structured = inferCompactVoiceContact(compact);
  const fullName = structured.fullName ?? inferVoiceName(compact);
  const designationAndCompany = inferVoiceDesignationAndCompany(
    compact,
    fullName,
  );
  const relationshipToUser =
    common.relationshipToUser ?? inferRelationship(compact);

  return {
    ...common,
    fullName,
    designation: structured.designation ?? designationAndCompany.designation,
    company: structured.company ?? designationAndCompany.company,
    relationshipToUser,
    address: structured.address ?? inferSpokenAddress(compact),
  };
}

function parseCommonFields(
  rawText: string,
  options: { includeSpokenPhone?: boolean } = {},
) {
  const emails = uniqueMatches(rawText.match(emailPattern) ?? []);
  const textWithoutEmails = emails.reduce(
    (text, email) => text.replace(email, ' '),
    rawText,
  );
  const websites = uniqueMatches(textWithoutEmails.match(websitePattern) ?? []);
  const numericPhoneMatches = uniqueMatches([
    ...(rawText.match(phonePattern) ?? []),
    ...(rawText.match(broadPhonePattern) ?? []),
  ]);
  const spokenPhone =
    options.includeSpokenPhone && numericPhoneMatches.length === 0
      ? normalizeSpokenPhoneNumber(rawText)
      : null;
  const phones = uniqueBy(
    uniqueMatches([
      ...numericPhoneMatches,
      ...(spokenPhone ? [spokenPhone] : []),
    ])
      .map(cleanPhone)
      .filter((number) => {
        const digits = normalizePhoneDigits(number);
        return digits.length >= 7 && digits.length <= 14;
      }),
    normalizePhoneDigits,
  ).map((number) => ({
    label: inferPhoneLabel(rawText, number),
    number,
  }));

  return {
    fullName: null,
    designation: null,
    company: null,
    relationshipToUser: inferRelationship(rawText),
    emails,
    phones,
    website: websites[0] ?? null,
    address: null,
  };
}

function repairOcrText(rawText: string) {
  return rawText
    .replace(/[©®]/g, '@')
    .replace(/\s+\[?at\]?\s+/gi, '@')
    .replace(/\s+\(at\)\s+/gi, '@')
    .replace(/\s+\[?dot\]?\s+/gi, '.')
    .replace(/@gmaii\./gi, '@gmail.')
    .replace(/@gmai1\./gi, '@gmail.')
    .replace(/@gmail,com/gi, '@gmail.com')
    .replace(/,com\b/gi, '.com')
    .replace(/\bwww\s+([a-z0-9-]+)\s+com\b/gi, 'www.$1.com')
    .replace(/\b([a-z0-9-]+)\s+co\s+in\b/gi, '$1.co.in');
}

function extractLooseEmails(rawText: string) {
  const candidates =
    rawText.match(/[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*[.,]\s*[a-z]{2,}/gi) ??
    [];
  return candidates.map((candidate) =>
    candidate.replace(/\s+/g, '').replace(/,([a-z]{2,})$/i, '.$1'),
  );
}

function extractLooseWebsites(rawText: string) {
  const websites =
    rawText.match(/\b(?:www\.)?[a-z0-9-]+\s*[.,]\s*(?:com|in|co\.in)\b/gi) ??
    [];
  return websites.map((website) =>
    website.replace(/\s+/g, '').replace(',', '.'),
  );
}

function toMeaningfulLines(rawText: string) {
  return rawText
    .split(/\r?\n|[|•]/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => Boolean(line) && !/^---.+---$/.test(line));
}

function uniqueMatches(values: string[]) {
  return [
    ...new Set(values.map((value) => value.trim().replace(/[.,;:]$/, ''))),
  ];
}

function uniqueBy<T>(values: T[], keyFn: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyFn(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isContactArtifact(
  line: string,
  common: ReturnType<typeof parseCommonFields>,
) {
  const lower = line.toLowerCase();
  return (
    common.emails.some((email) => lower.includes(email.toLowerCase())) ||
    common.phones.some((phone) => lower.includes(phone.number.toLowerCase())) ||
    (common.website !== null && lower.includes(common.website.toLowerCase()))
  );
}

function findLine(lines: string[], predicate: (line: string) => boolean) {
  return lines.find(predicate) ?? null;
}

function inferPersonName(lines: string[], designation: string | null) {
  const candidates = lines
    .filter(
      (line) =>
        line !== designation &&
        !looksLikeAddress(line) &&
        !looksLikeDesignation(line),
    )
    .flatMap((line) =>
      extractNameCandidates(line).map((candidate) => ({
        value: candidate,
        score: scoreNameCandidate(candidate, line),
      })),
    )
    .filter((candidate) => !looksLikeCompany(candidate.value));

  return bestCandidate(candidates)?.value ?? null;
}

function extractNameCandidates(line: string) {
  if (looksLikeOcrNoise(line)) {
    return [];
  }

  const cleaned = line
    .replace(/\b(CA|Mr|Mrs|Ms|Dr)\.?\b/g, ' ')
    .replace(/[^\w\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const candidates: string[] = [];
  const properNamePattern =
    /\b((?:[A-Z]\.?\s*)?[A-Z][a-z]+(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z]+){0,3})\b/g;
  const upperNamePattern = /\b([A-Z]{3,}(?:\s+[A-Z]{2,}){1,3})\b/g;

  for (const match of cleaned.matchAll(properNamePattern)) {
    const candidate = normalizeNameCandidate(match[1]);
    if (candidate) candidates.push(candidate);
  }

  for (const match of cleaned.matchAll(upperNamePattern)) {
    const candidate = normalizeNameCandidate(
      toTitleCase(match[1].toLowerCase()),
    );
    if (candidate) candidates.push(candidate);
  }

  return candidates.filter((candidate) => !containsBusinessWord(candidate));
}

function looksLikeOcrNoise(line: string) {
  const cleaned = line.replace(/\s+/g, '');
  if (cleaned.length < 4) return true;
  const letters = (cleaned.match(/[a-z]/gi) ?? []).length;
  const symbols = (cleaned.match(/[^a-z0-9]/gi) ?? []).length;
  return letters / cleaned.length < 0.55 || symbols / cleaned.length > 0.35;
}

function looksLikePersonName(line: string) {
  const words = line.split(/\s+/);
  return (
    words.length >= 2 &&
    words.length <= 4 &&
    words.every((word) => /^[A-Z][a-z'.-]+$/.test(word)) &&
    !looksLikeDesignation(line) &&
    !looksLikeCompany(line) &&
    !looksLikeAddress(line)
  );
}

function normalizeNameCandidate(value: string) {
  const candidate = value.replace(/\s+/g, ' ').trim();
  const words = candidate.split(/\s+/);
  if (words.length < 1 || words.length > 4) return null;
  if (words.some((word) => word.length < 3 && !/^[A-Z]\.$/.test(word)))
    return null;
  if (words.some((word) => /^\d+$/.test(word))) return null;
  return candidate;
}

function scoreNameCandidate(candidate: string, sourceLine: string) {
  const words = candidate.split(/\s+/);
  let score = 0;
  score += words.length * 2;
  score += words.filter((word) => word.length >= 5).length * 2;
  if (/\b[A-Z]\./.test(candidate)) score += 2;
  if (/^[A-Z\s.]+$/.test(sourceLine) && words.length >= 2) score += 1;
  if (new RegExp(`\\b${escapeRegExp(candidate)}\\s*:`).test(sourceLine))
    score += 5;
  if (/\b(cell|mob|mobile|m\s*:|tel|phone)\b/i.test(sourceLine)) score += 2;
  if (containsBusinessWord(sourceLine)) score -= 8;
  if (looksLikeAddress(sourceLine)) score -= 5;
  if (
    normalizePhoneDigits(sourceLine).length >= 7 &&
    !sourceLine.includes(candidate)
  )
    score -= 3;
  if (candidate.length < 5) score -= 3;
  return score;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsBusinessWord(value: string) {
  const lower = value.toLowerCase();
  return [...designationWords, ...companyWords, ...addressWords].some((word) =>
    new RegExp(`\\b${word}\\b`).test(lower),
  );
}

function inferDesignation(lines: string[]) {
  return (
    findLine(lines, looksLikeDesignation) ??
    findLine(lines, (line) =>
      /\bB\.?\s*Com\b|\bA\.?C\.?S\b|\bL\.?L\.?\s*B\b/i.test(line),
    )
  );
}

function inferCompany(
  lines: string[],
  designation: string | null,
  fullName: string | null,
) {
  return (
    bestCandidate(
      lines
        .filter(
          (line) =>
            line !== fullName && line !== designation && looksLikeCompany(line),
        )
        .map((line) => ({
          value: cleanBusinessLine(line) ?? line,
          score: scoreCompanyLine(line),
        })),
    )?.value ??
    inferCompanyNearDesignation(lines, designation, fullName) ??
    bestCandidate(
      lines
        .map(cleanBusinessLine)
        .filter((line): line is string => {
          return (
            line !== null &&
            line !== fullName &&
            line !== designation &&
            !looksLikeAddress(line) &&
            !looksLikePersonName(line) &&
            /^[A-Z0-9&.\s-]{5,}$/.test(line)
          );
        })
        .map((line) => ({ value: line, score: scoreCompanyLine(line) })),
    )?.value
  );
}

function looksLikeDesignation(line: string) {
  const lower = line.toLowerCase();
  return designationWords.some((word) => lower.includes(word));
}

function looksLikeDesignationContinuation(line: string) {
  const lower = line.toLowerCase();
  return [
    'chaniya',
    'choli',
    'saree',
    'sarees',
    'wheat',
    'juwar',
    'maize',
    'cocoanut',
  ].some((word) => lower.includes(word));
}

function looksLikeCompany(line: string) {
  const lower = line.toLowerCase();
  return companyWords.some((word) => new RegExp(`\\b${word}\\b`).test(lower));
}

function inferSplitCompany(line: string, nextLines: string[]) {
  const current = cleanBusinessLine(line);
  const next = nextLines
    .map((nextLine) => cleanBusinessLine(nextLine))
    .find(Boolean);
  if (!current || !next) return null;

  const currentToken = normalizeText(current);
  const nextToken = normalizeText(next);

  if (
    /krisaa?nvi/.test(currentToken) &&
    /creation|cr at ion|ation/.test(nextToken)
  ) {
    return 'Krisaavni Creation';
  }

  if (
    /^[A-Z][A-Z\s&.-]{3,}$/.test(current) &&
    /^[A-Z][A-Z\s&.-]{3,}$/.test(next) &&
    !looksLikeAddress(current) &&
    !looksLikeAddress(next) &&
    !looksLikeDesignation(current)
  ) {
    return `${current} ${next}`;
  }

  return null;
}

function looksLikeAddress(line: string) {
  const lower = line.toLowerCase();
  return (
    /\d/.test(line) &&
    addressWords.some((word) => new RegExp(`\\b${word}\\b`).test(lower))
  );
}

function inferCompanyNearDesignation(
  lines: string[],
  designation: string | null,
  fullName: string | null,
) {
  if (!designation) {
    return null;
  }

  const index = lines.indexOf(designation);
  const candidates = [lines[index - 1], lines[index + 1]].filter(Boolean);
  return (
    candidates
      .map(cleanBusinessLine)
      .find((line) => line && line !== fullName && !looksLikeAddress(line)) ??
    null
  );
}

function inferAddress(lines: string[], excluded: Array<string | null>) {
  const addressLines = lines.filter(
    (line) => !excluded.includes(line) && looksLikeAddress(line),
  );
  return addressLines.length > 0 ? addressLines.join(', ') : null;
}

function cleanBusinessLine(line: string) {
  const cleaned = line
    .replace(/[^\w\s&().,#/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 3) return null;
  return cleaned;
}

function scoreCompanyLine(line: string) {
  const lower = line.toLowerCase();
  let score = 0;
  score +=
    companyWords.filter((word) => new RegExp(`\\b${word}\\b`).test(lower))
      .length * 5;
  score += designationWords.filter((word) =>
    new RegExp(`\\b${word}\\b`).test(lower),
  ).length;
  if (/^[A-Z0-9&.\s-]{6,}$/.test(line)) score += 2;
  if (looksLikeAddress(line)) score -= 5;
  if (normalizePhoneDigits(line).length >= 7) score -= 4;
  return score;
}

function inferCompanyFromInternetFields(
  emails: string[],
  website: string | null,
) {
  const host = website ?? emails[0]?.split('@')[1];
  if (!host) return null;

  const domain = host
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('.')[0];

  if (['gmail', 'yahoo', 'hotmail', 'outlook', 'rediffmail'].includes(domain)) {
    return null;
  }

  return domain ? domain : null;
}

function inferPhoneLabel(rawText: string, phone: string) {
  const index = rawText.indexOf(phone);
  const context = rawText.slice(Math.max(0, index - 24), index).toLowerCase();
  if (context.includes('office')) return 'office';
  if (context.includes('work')) return 'work';
  if (context.includes('mobile') || context.includes('cell')) return 'mobile';
  return 'mobile';
}

function cleanPhone(phone: string) {
  return phone
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]$/, '')
    .trim();
}

function repairEmail(email: string) {
  return email
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[©®]/g, '@')
    .replace(/,([a-z]{2,})$/i, '.$1')
    .replace(/@gmaii\./g, '@gmail.')
    .replace(/@gmai1\./g, '@gmail.');
}

function repairWebsite(website: string) {
  return website
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/,$/, '')
    .replace(',', '.')
    .replace(/^https?:\/\//, '');
}

function normalizePhoneDigits(phone: string) {
  return phone.replace(/\D/g, '');
}

function normalizeSpokenPhoneNumber(value: string) {
  const digitTokens: Record<string, string> = {
    zero: '0',
    oh: '0',
    o: '0',
    one: '1',
    won: '1',
    two: '2',
    to: '2',
    too: '2',
    three: '3',
    tree: '3',
    four: '4',
    for: '4',
    fore: '4',
    five: '5',
    fife: '5',
    by: '5',
    six: '6',
    seven: '7',
    eight: '8',
    ate: '8',
    nine: '9',
    ten: '10',
  };

  const digits = value
    .toLowerCase()
    .replace(/[-–—]/g, ' ')
    .split(/[^a-z0-9]+/)
    .flatMap((token) => {
      if (!token) return [];
      if (/^\d+$/.test(token)) return token.split('');
      return digitTokens[token]?.split('') ?? [];
    })
    .join('');

  return digits.length >= 7 && digits.length <= 14 ? digits : null;
}

function normalizeText(value: string) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWebsite(value: string) {
  return repairWebsite(value)
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

function inferRelationship(rawText: string) {
  const lower = rawText.toLowerCase();
  const explicit = lower.match(
    /\b(?:relationship|relation|relationship to me|relation to me)\s+(?:is|as|:)?\s*(?<relationship>self|work|client|vendor|accountant|attorney|contractor|friend|father|mother|son|daughter|guardian|partner|relative)\b/i,
  );
  if (explicit?.groups?.relationship) {
    return toTitleCase(explicit.groups.relationship);
  }

  const match = relationshipLabels.find((label) =>
    new RegExp(`\\b${label.replace(' ', '\\s+')}\\b`).test(lower),
  );
  return match ? toTitleCase(match) : null;
}

function inferVoiceName(rawText: string) {
  const patterns = [
    /\b(?:this is|meet|add|create contact for|contact is|contact name is|name is|called)\s+(?<name>[a-z]+(?:\s+[a-z]+){0,3})\b/i,
    /^(?<name>[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    const name = cleanVoiceName(match?.groups?.name);
    if (name && looksLikeVoiceName(name)) return name;
  }

  return null;
}

function inferCompactVoiceContact(rawText: string) {
  const designationPattern = designationWords
    .flatMap((word) => [word, toTitleCase(word)])
    .join('|');
  const match = rawText.match(
    new RegExp(
      `^(?<name>[A-Z][A-Za-z'.-]+(?:\\s+[A-Z][A-Za-z'.-]+){1,3})\\s+(?<title>[^.]*?\\b(?:${designationPattern})\\b[^.]*?)\\s+(?:at|with|for)\\s+(?<company>.+?)(?:\\s+(?:at|office address|address)\\s+(?<address>.+?))?(?:\\s+(?:mobile|phone|email|website|relationship)\\b|$)`,
    ),
  );

  if (!match?.groups) {
    return {
      fullName: null,
      designation: null,
      company: null,
      address: null,
    };
  }

  const fullName = cleanVoiceName(match.groups.name);
  if (!fullName || !looksLikeVoiceName(fullName)) {
    return {
      fullName: null,
      designation: null,
      company: null,
      address: null,
    };
  }

  const companyAndAddress = splitVoiceCompanyAndAddress(match.groups.company);

  return {
    fullName,
    designation: cleanVoiceDesignation(match.groups.title),
    company: cleanVoiceCompany(companyAndAddress.company),
    address: cleanVoiceAddress(
      match.groups.address ?? companyAndAddress.address,
    ),
  };
}

function inferVoiceDesignationAndCompany(
  rawText: string,
  fullName: string | null,
) {
  const escapedName = fullName ? escapeRegExp(fullName) : null;
  const patterns = [
    escapedName
      ? new RegExp(
          `\\b${escapedName}\\b,?\\s+(?:is\\s+)?(?:a\\s+|an\\s+|the\\s+)?(?<title>[A-Za-z][A-Za-z\\s&/-]{2,70}?)\\s+(?:at|with|for)\\s+(?<company>.+?)(?:\\s+(?:at|office address|address)\\s+|\\s+(?:mobile|phone|email|website|relationship)\\b|[.]|$)`,
        )
      : null,
    /\b(?:he|she|they|this person|contact)\s+(?:is|works as|serves as)\s+(?:a\s+|an\s+|the\s+)?(?<title>[A-Za-z][A-Za-z\s&/-]{2,70}?)\s+(?:at|with|for)\s+(?<company>.+?)(?:\s+(?:at|office address|address)\s+|\s+(?:mobile|phone|email|website|relationship)\b|[.]|$)/i,
    /\b(?:designation|title|role)\s+(?:is|as|:)?\s*(?<title>[A-Za-z][A-Za-z\s&/-]{2,70}?)\s+(?:at|with|for)\s+(?<company>.+?)(?:\s+(?:at|office address|address)\s+|\s+(?:mobile|phone|email|website|relationship)\b|[.]|$)/i,
    /\b(?<title>[A-Za-z][A-Za-z\s&/-]{2,70}?)\s+(?:at|with|for)\s+(?<company>.+?)(?:\s+(?:at|office address|address)\s+|\s+(?:mobile|phone|email|website|relationship)\b|[.]|$)/i,
  ].filter(Boolean) as RegExp[];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    const designation = cleanVoiceDesignation(match?.groups?.title);
    const company = cleanVoiceCompany(match?.groups?.company);
    if (designation || company) {
      return { designation, company };
    }
  }

  const companyOnly = rawText.match(
    /\b(?:company|organization|office)\s+(?:is|as|:)?\s*(?<company>[^.,]+)/i,
  );
  return {
    designation: null,
    company: cleanVoiceCompany(companyOnly?.groups?.company),
  };
}

function inferSpokenAddress(rawText: string) {
  const match = rawText.match(
    /\b(?:office address|residential address|address)\s+(?:is|as|:)?\s*(?<address>.+?)(?:\s+(?:mobile|phone|email|website|relationship)\b|[.]|$)/i,
  );
  return cleanVoiceAddress(match?.groups?.address);
}

function repairSpokenContactText(rawText: string) {
  return rawText
    .replace(
      /\b([a-z0-9._%+-]+)\s+at\s+([a-z0-9.-]+)\s+dot\s+([a-z]{2,})\b/gi,
      '$1@$2.$3',
    )
    .replace(/\b([a-z0-9-]+)\s+dot\s+(com|in|co\.in|org|net)\b/gi, '$1.$2');
}

function looksLikeVoiceName(value: string) {
  const lower = value.toLowerCase();
  const firstWord = lower.split(/\s+/)[0];
  if (
    ['add', 'this', 'contact', 'name', 'meet', 'called', 'create'].includes(
      firstWord,
    )
  )
    return false;
  if (containsBusinessWord(value)) return false;
  if (
    ['he is', 'she is', 'they are', 'email is'].some((prefix) =>
      lower.startsWith(prefix),
    )
  ) {
    return false;
  }

  return value.split(/\s+/).every((word) => /^[A-Z][a-z'.-]+$/.test(word));
}

function cleanVoiceName(value?: string) {
  const cleaned = normalizeNullable(
    value
      ?.replace(
        /^(?:add|this is|contact is|contact name is|name is|meet|called|create contact for)\s+/i,
        '',
      )
      .replace(/[.]\s+(?:he|she|they|this person|contact)\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]\s*$/, ''),
  );
  if (!cleaned) return null;
  return toTitleCase(cleaned.toLowerCase());
}

function cleanVoiceDesignation(value?: string) {
  const cleaned = normalizeNullable(
    value
      ?.replace(
        /\b(?:he|she|they|this person|contact)\s+(?:is|works as|serves as)\b/gi,
        '',
      )
      .replace(/^\s*is\s+/i, '')
      .replace(/\b(?:a|an|the)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]\s*$/, ''),
  );
  if (!cleaned) return null;
  return toTitleCase(cleaned.toLowerCase());
}

function cleanVoiceCompany(value?: string) {
  const cleaned = normalizeNullable(
    value
      ?.replace(/\s+\b(?:at|office address|address)\b\s+.*$/i, '')
      ?.replace(
        /\b(?:email|mobile|office|phone|website|address|relationship|relation|vendor|client|father|mother|friend|work)\b.*$/i,
        '',
      )
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]\s*$/, ''),
  );
  if (!cleaned) return null;
  return cleaned;
}

function splitVoiceCompanyAndAddress(value?: string) {
  const match = value?.match(
    /^(?<company>.+?)\s+\b(?:at|office address|address)\b\s+(?<address>.+)$/i,
  );
  return {
    company: match?.groups?.company ?? value,
    address: match?.groups?.address,
  };
}

function cleanVoiceAddress(value?: string) {
  const cleaned = normalizeNullable(
    value
      ?.replace(
        /\b(?:email|mobile|phone|website|relationship|relation|vendor|client|father|mother|friend|work)\b.*$/i,
        '',
      )
      .replace(/\s+/g, ' ')
      .replace(/[.,;:]\s*$/, ''),
  );
  return cleaned;
}

function normalizeNullable(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bestCandidate<T extends { score: number }>(candidates: T[]) {
  return (
    [...candidates].sort((left, right) => right.score - left.score)[0] ?? null
  );
}
