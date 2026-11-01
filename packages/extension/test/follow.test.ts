import { describe, expect, test } from 'bun:test';
import { isFramePage, keepsHandoff, movedTo, sameSite, takeHandoff } from '../src/follow.ts';

describe('isFramePage', () => {
  test('is a load of the page above, its fragment aside', () => {
    expect(isFramePage('https://a.test/x?q=1#top', 'https://a.test/x?q=1')).toBe(true);
    expect(isFramePage('https://a.test/x', 'https://a.test/y')).toBe(false);
    expect(isFramePage('https://a.test/x', 'https://b.test/x')).toBe(false);
    expect(isFramePage('not a url', 'not a url')).toBe(false);
  });
});

describe('movedTo', () => {
  test('is where the frame landed on another origin of the same site', () => {
    expect(movedTo('https://www.youtube.com/', 'https://m.youtube.com/')).toBe(
      'https://m.youtube.com/',
    );
    expect(movedTo('http://www.knobs.localhost:8000/a', 'http://m.knobs.localhost:8000/b')).toBe(
      'http://m.knobs.localhost:8000/b',
    );
  });

  test('is null on the same origin, another site, or for no web page', () => {
    expect(movedTo('http://127.0.0.1:8000/a', 'http://localhost:8000/b')).toBeNull();
    expect(movedTo('https://example.com/', 'https://accounts.google.com/')).toBeNull();
    expect(movedTo('https://www.youtube.com/', 'http://m.youtube.com/')).toBeNull();
    expect(movedTo('https://a.test/', 'https://a.test/other')).toBeNull();
    expect(movedTo('https://a.test/', 'chrome-error://chromewebdata/')).toBeNull();
    expect(movedTo('https://a.test/', 'about:blank')).toBeNull();
    expect(movedTo('https://a.test/', 'nonsense')).toBeNull();
  });
});

describe('sameSite', () => {
  test('is one registrable domain, near enough', () => {
    expect(sameSite('www.youtube.com', 'm.youtube.com')).toBe(true);
    expect(sameSite('reddit.com', 'm.reddit.com')).toBe(true);
    expect(sameSite('example.com', 'accounts.google.com')).toBe(false);
    expect(sameSite('a.co.uk', 'b.co.uk')).toBe(false);
    expect(sameSite('x.co.uk', 'm.x.co.uk')).toBe(true);
    expect(sameSite('www.x.com.tr', 'm.x.com.tr')).toBe(true);
    expect(sameSite('www.ok.ru', 'm.ok.ru')).toBe(true);
    expect(sameSite('www.web.de', 'm.web.de')).toBe(true);
    expect(sameSite('olx.pl', 'm.olx.pl')).toBe(true);
  });

  test("tells a shared host's customers apart", () => {
    expect(sameSite('alice.github.io', 'bob.github.io')).toBe(false);
    expect(sameSite('www.alice.github.io', 'alice.github.io')).toBe(true);
    expect(sameSite('a.vercel.app', 'b.vercel.app')).toBe(false);
    expect(sameSite('x.pages.dev', 'y.pages.dev')).toBe(false);
    expect(sameSite('one.blogspot.com', 'two.blogspot.com')).toBe(false);
    expect(sameSite('a.b.cloudfront.net', 'c.cloudfront.net')).toBe(false);
  });

  test('takes an address or a host of one label only as itself', () => {
    expect(sameSite('127.0.0.1', '127.0.0.1')).toBe(true);
    expect(sameSite('127.0.0.1', '10.0.0.1')).toBe(false);
    expect(sameSite('localhost', 'intranet')).toBe(false);
    expect(sameSite('[::1]', '[::2]')).toBe(false);
  });
});

describe('takeHandoff', () => {
  const handoff = {
    origin: 'https://m.youtube.com',
    state: { device: 'iphone' },
    until: 1000,
    url: 'https://m.youtube.com/?ra=m',
  };

  test('hands the knobs once to a page on its origin in time', () => {
    expect(takeHandoff(handoff, 'https://m.youtube.com/?ra=m', 500)).toEqual({
      keep: false,
      state: { device: 'iphone' },
    });
  });

  test('keeps them from a page on another origin', () => {
    expect(takeHandoff(handoff, 'https://www.youtube.com/', 500)).toEqual({ keep: true });
    expect(takeHandoff(handoff, undefined, 500)).toEqual({ keep: true });
  });

  test('drops them once too late, and has nothing with none', () => {
    expect(takeHandoff(handoff, 'https://m.youtube.com/', 1500)).toEqual({ keep: false });
    expect(takeHandoff(undefined, 'https://m.youtube.com/', 500)).toEqual({ keep: false });
  });
});

describe('keepsHandoff', () => {
  const handoff = {
    origin: 'https://m.youtube.com',
    state: {},
    until: 1000,
    url: 'https://m.youtube.com/?ra=m',
  };

  test('lives through the load it was made for alone', () => {
    expect(keepsHandoff(handoff, 'https://m.youtube.com/?ra=m')).toBe(true);
    expect(keepsHandoff(handoff, 'https://m.youtube.com/?ra=m#top')).toBe(true);
    expect(keepsHandoff(handoff, 'https://m.youtube.com/other')).toBe(false);
    expect(keepsHandoff(handoff, 'https://www.youtube.com/')).toBe(false);
  });

  test('goes with the frame, and there is none to keep without one', () => {
    expect(keepsHandoff(handoff, undefined)).toBe(false);
    expect(keepsHandoff(undefined, 'https://m.youtube.com/?ra=m')).toBe(false);
  });
});
