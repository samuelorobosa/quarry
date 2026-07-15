import {
  normalizeUrl,
  matchesPattern,
  isAllowedByPatterns,
  isSameDomain,
} from './url-helpers';

describe('normalizeUrl', () => {
  it('resolves relative URLs against a base', () => {
    expect(normalizeUrl('/docs/intro', 'https://example.com')).toBe(
      'https://example.com/docs/intro',
    );
  });

  it('strips the hash fragment', () => {
    expect(
      normalizeUrl('https://example.com/page#section', 'https://example.com'),
    ).toBe('https://example.com/page');
  });

  it('strips a trailing slash on non-root paths', () => {
    expect(
      normalizeUrl('https://example.com/docs/', 'https://example.com'),
    ).toBe('https://example.com/docs');
  });

  it('keeps the root path slash', () => {
    expect(normalizeUrl('https://example.com/', 'https://example.com')).toBe(
      'https://example.com/',
    );
  });

  it('sorts query params for stable dedupe', () => {
    expect(
      normalizeUrl('https://example.com/page?b=2&a=1', 'https://example.com'),
    ).toBe('https://example.com/page?a=1&b=2');
  });

  it('rejects non-http(s) protocols', () => {
    expect(
      normalizeUrl('mailto:test@example.com', 'https://example.com'),
    ).toBeNull();
    expect(
      normalizeUrl('javascript:void(0)', 'https://example.com'),
    ).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(normalizeUrl('::not a url::', '')).toBeNull();
  });
});

describe('matchesPattern', () => {
  it('matches a literal path', () => {
    expect(matchesPattern('/docs/intro', '/docs/intro')).toBe(true);
  });

  it('supports wildcard segments', () => {
    expect(matchesPattern('/docs/intro', '/docs/*')).toBe(true);
    expect(matchesPattern('/blog/2024/post', '/blog/*')).toBe(true);
  });

  it('does not match unrelated paths', () => {
    expect(matchesPattern('/legal/privacy', '/docs/*')).toBe(false);
  });

  it('escapes regex special characters in the pattern', () => {
    expect(matchesPattern('/docs/a.b', '/docs/a.b')).toBe(true);
    expect(matchesPattern('/docsXa.b', '/docs/a.b')).toBe(false);
  });
});

describe('isAllowedByPatterns', () => {
  it('allows everything when no patterns are set', () => {
    expect(isAllowedByPatterns('https://example.com/anything', [], [])).toBe(
      true,
    );
  });

  it('rejects paths not matching an include pattern', () => {
    expect(
      isAllowedByPatterns('https://example.com/other', ['/docs/*'], []),
    ).toBe(false);
  });

  it('rejects paths matching an exclude pattern even if included', () => {
    expect(
      isAllowedByPatterns(
        'https://example.com/docs/legal',
        ['/docs/*'],
        ['/docs/legal'],
      ),
    ).toBe(false);
  });

  it('returns false for unparseable URLs', () => {
    expect(isAllowedByPatterns('not a url', [], [])).toBe(false);
  });
});

describe('isSameDomain', () => {
  it('returns true for matching hostnames', () => {
    expect(isSameDomain('https://example.com/a', 'https://example.com/b')).toBe(
      true,
    );
  });

  it('returns false for different hostnames', () => {
    expect(isSameDomain('https://example.com/a', 'https://other.com/b')).toBe(
      false,
    );
  });

  it('returns false for unparseable input', () => {
    expect(isSameDomain('not a url', 'https://example.com')).toBe(false);
  });
});
