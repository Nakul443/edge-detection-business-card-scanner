/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  parseBusinessCardCandidates,
  parseBusinessCardText,
  parseVoiceContactText,
} from './contact-text-parser';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type VoiceScriptFixture = {
  label: string;
  script: string;
  expected: {
    fullName?: string;
    designation?: string;
    company?: string;
    relationshipToUser?: string;
    emails?: string[];
    phones?: Array<{ label: string; number: string }>;
    website?: string;
    address?: string;
  };
};

const voiceFixturePath = [
  join(process.cwd(), 'datasets', 'voice-contact-scripts.json'),
  join(process.cwd(), '..', '..', 'datasets', 'voice-contact-scripts.json'),
].find((path) => existsSync(path));

if (!voiceFixturePath) {
  throw new Error('voice-contact-scripts.json fixture not found');
}

const voiceScriptFixtures = JSON.parse(
  readFileSync(voiceFixturePath, 'utf8'),
) as VoiceScriptFixture[];

describe('contact text parser', () => {
  it('extracts a structured draft from business card OCR text', () => {
    const draft = parseBusinessCardText(`
      Ada Lovelace
      Chief Mathematician
      Analytical Engines LLC
      ada@analytical.example
      Mobile (518) 555-1111
      www.analytical.example
      12 Market Street, Albany, NY
      Client
    `);

    expect(draft).toEqual(
      expect.objectContaining({
        fullName: 'Ada Lovelace',
        designation: 'Chief Mathematician',
        company: 'Analytical Engines LLC',
        relationshipToUser: 'Client',
        emails: ['ada@analytical.example'],
        phones: [{ label: 'mobile', number: '(518) 555-1111' }],
        website: 'www.analytical.example',
        address: '12 Market Street, Albany, NY',
      }),
    );
  });

  it('extracts a structured draft from natural voice text', () => {
    const draft = parseVoiceContactText(
      'John Smith, Sales Manager at ABC Realty. Email john@abc.com. Mobile 518-555-1111. Office 518-555-2222. Website abc.com. Vendor.',
    );

    expect(draft).toEqual(
      expect.objectContaining({
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
    );
  });

  it('normalizes spoken phone digits from noisy STT words', () => {
    const draft = parseVoiceContactText(
      'Phone number is 1 to 3, 2 by 6, 8 by 10.',
    );

    expect(draft.phones).toEqual([{ label: 'mobile', number: '1232568510' }]);
  });

  it.each(voiceScriptFixtures)(
    'extracts voice fixture: $label',
    ({ script, expected }) => {
      const draft = parseVoiceContactText(script);

      expect(draft).toEqual(expect.objectContaining(expected));
    },
  );

  it('votes across OCR variants instead of trusting the first noisy candidate', () => {
    const draft = parseBusinessCardText(`
      --- high-contrast ---
      Tejas Example
      Chief Builder
      1111111111
      noisy.website

      --- normalized ---
      Tejas Example
      Chief Builder
      Bhumio Labs LLC
      tejas@bhumio.example
      www.bhumio.example
      44 Market Road, Pune

      --- original ---
      Tejas Example
      Chief Builder
      Bhumio Labs LLC
      tejas@bhumio.example
      www.bhumio.example
      44 Market Road, Pune
    `);

    expect(draft).toEqual(
      expect.objectContaining({
        fullName: 'Tejas Example',
        designation: 'Chief Builder',
        company: 'Bhumio Labs LLC',
        emails: ['tejas@bhumio.example'],
        website: 'www.bhumio.example',
        address: '44 Market Road, Pune',
      }),
    );

    const candidates = parseBusinessCardCandidates(`
      --- noisy ---
      noisy.website
      --- repeated ---
      tejas@bhumio.example
      --- repeated-again ---
      tejas@bhumio.example
    `);

    expect(candidates.find((candidate) => candidate.field === 'email')).toEqual(
      expect.objectContaining({
        value: 'tejas@bhumio.example',
        sourceVariant: expect.any(String),
        finalScore: expect.any(Number),
      }),
    );
  });
});
