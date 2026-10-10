import { describe, expect, it } from 'vitest';
import { linkify, mapsUrl } from '../text/linkify';

describe('linkify', () => {
  it('makes phone numbers and street addresses tappable', () => {
    const segs = linkify('Call Officer J. Smith: (404) 555-0100. Go to 123 Main St, Atlanta, GA 30303 today.');
    expect(segs.filter(s => s.kind !== 'text')).toEqual([
      { kind: 'phone', text: '(404) 555-0100', tel: '4045550100' },
      { kind: 'address', text: '123 Main St, Atlanta, GA 30303' },
    ]);
    expect(segs.map(s => s.text).join('')).toBe('Call Officer J. Smith: (404) 555-0100. Go to 123 Main St, Atlanta, GA 30303 today.');
  });

  it('keeps room numbers with the address', () => {
    expect(linkify('Class at 456 Peachtree Ave, Room 2B, by Friday.').find(s => s.kind === 'address')?.text)
      .toBe('456 Peachtree Ave, Room 2B');
  });

  it('marks flagged values instead of making them tappable', () => {
    const segs = linkify('Pay $300.00 or call (404) 555-0199.', ['$300.00', '(404) 555-0199']);
    expect(segs.filter(s => s.kind !== 'text').map(s => s.kind)).toEqual(['flagged', 'flagged']);
  });

  it('builds a maps link for each platform', () => {
    expect(mapsUrl('123 Main St', 'android')).toBe('geo:0,0?q=123%20Main%20St');
    expect(mapsUrl('123 Main St', 'ios')).toBe('maps:?q=123%20Main%20St');
    expect(mapsUrl('123 Main St', 'web')).toMatch(/^https:\/\/www\.google\.com\/maps\/search\//);
  });
});
