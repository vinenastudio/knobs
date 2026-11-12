import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { DocPage } from '../docs/layout.tsx';
import { m } from '../paraglide/messages.js';
import { CopyInstallPrompt } from './copy-install-prompt.tsx';

// The docs page reads the router only to follow its own links; markup needs no more.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => createElement('a', null, children),
  Outlet: () => null,
  useParams: () => ({}),
  useRouter: () => ({}),
}));

const root = resolve(import.meta.dirname, '../../../..');

/** The fenced block in a markdown file that holds the setup prompt. */
function promptIn(file: string) {
  const text = readFileSync(resolve(root, file), 'utf8');
  return /```\n(Read https:\/\/knobs\.dev\/llms-full\.txt[\s\S]*?)\n```/.exec(text)?.[1];
}

describe('install prompt', () => {
  test('the message, the README and the start reference hold the same prompt', () => {
    expect(m.install_prompt().startsWith('Read https://knobs.dev/llms-full.txt')).toBe(true);
    expect(promptIn('packages/devknobs/README.md')).toBe(m.install_prompt());
    expect(promptIn('apps/web/content/reference/start.md')).toBe(m.install_prompt());
  });

  test('the button is named "Copy installation prompt" and does not show the prompt', () => {
    const html = renderToStaticMarkup(createElement(CopyInstallPrompt, { name: 'install_prompt' }));
    expect(m.copy_install_prompt()).toBe('Copy installation prompt');
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).toMatch(/<button[^>]*aria-label="Copy installation prompt"/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('>Copy installation prompt<');
    expect(html).toContain(`>${m.copy_done()}<`);
    expect(html).toContain('data-copied="false"');
    expect(html).not.toContain('llms-full.txt');
    // The star link comes only after a copy.
    expect(html).not.toContain(m.link_star());
    expect(html).not.toContain('<a');
  });

  test('/docs/start has the button under its title, and no agent section', () => {
    const html = renderToStaticMarkup(createElement(DocPage, { slug: 'start' }));
    expect(html).toMatch(/<\/h1><div[^>]*><button[^>]*>.*Copy installation prompt/);
    expect(html).not.toContain('agent-start');
    expect(html).not.toContain('id="manual"');
    expect(html).not.toContain('Set it up with your agent');
    expect(html).toContain('npm i -D @vinena/knobs');
  });
});
