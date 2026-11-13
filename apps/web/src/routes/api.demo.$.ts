import { createFileRoute } from '@tanstack/react-router';
import { FAKE_SECRET } from '../demo/fake.ts';

// Every cap of the endpoint, in one place.
const SLOW_DEFAULT_MS = 2000;
const SLOW_MAX_MS = 3000;
const BIG_DEFAULT_KB = 200;
const BIG_MAX_KB = 512;
const ECHO_MAX_BYTES = 16 * 1024;
const HEADER_VALUE_MAX = 200;
const STREAM_LINES = 10;
const STREAM_GAP_MS = 300;
const EVENTS = 4;
const EVENTS_GAP_MS = 750;

/** The error statuses `status/:code` answers with. Anything else is a 400. */
const STATUSES = new Set([400, 401, 403, 404, 418, 429, 500, 502, 503]);

/** The request headers the echo names. The others are never read. */
const ECHO_HEADERS = [
  'accept',
  'authorization',
  'content-length',
  'content-type',
  'x-api-key',
  'x-knobs-now',
  'x-devknobs-now',
];
/** The clock knobs sends with "send to server" on, under its new and its old name: an instant, the way `toISOString` writes it. */
const NOW_HEADERS = new Set(['x-knobs-now', 'x-devknobs-now']);
const INSTANT = /^[+-]?\d{4,6}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
/** The ones whose value is safe to send back as it came. */
const ECHO_VALUES = new Set(['accept', 'content-type']);

const READ = ['GET'];
/** The methods each path takes. A path that is not here does not exist. */
const METHODS: Record<string, Array<string>> = {
  'asset.css': READ,
  'asset.js': READ,
  'asset.png': READ,
  'asset.woff2': READ,
  big: READ,
  bin: READ,
  echo: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  events: READ,
  html: READ,
  json: READ,
  redirect: READ,
  slow: READ,
  status: READ,
  stream: READ,
  text: READ,
};

// One transparent pixel.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
// A font of one glyph, a box for the letter A, built with fontTools.
const WOFF2 =
  'd09GMgABAAAAAAEcAAoAAAAAAoQAAADUAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAABmAANAo4QAE2AiQDBgsGAAQgBVcHJhvQAQCeB7YtY49aH2Jmkdrn1a/E8/V73bn7NqVRqu1CgmViXMZHO4z9TjPI6vmmeC8vOS7HI0Uea7VaQvLQ5389sE6OTxSABNSWRFigkGSlAQaY7pAxtmNE6jjTRaMOYaaJArxxYU/U3YHCwJUhuNLu0Fqw/5ceCYACjcISa0CDSPdmtkMcJxOmQRBu3180Tns5xid8fF0/e+YI8lcThgJh3GHqoFQWAECmiyBKCygAALRXAdEIKAttSK/E0qb3cuLy1lA/R/3BtONybXwrPaTIjj0BAAA=';

// A row of the big body, repeated: nothing is computed per row.
const BIG_ROW =
  '{"id":0,"name":"demo row","note":"the same row again and again, to fill the body"}';

// No `<head>`, so the early script `server.ts` puts in a page's head stays out.
const HTML = '<!doctype html><title>demo</title><p>An HTML answer from the demo endpoint</p>';

function bytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** Every answer: never stored, never indexed, typed, and no request header in it. */
function answer(body: BodyInit | null, type: string | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-robots-tag', 'noindex');
  headers.set('x-content-type-options', 'nosniff');
  if (type !== null) {
    headers.set('content-type', type);
  }
  return new Response(body, { ...init, headers });
}

function json(value: unknown, init: ResponseInit = {}): Response {
  return answer(JSON.stringify(value), 'application/json; charset=utf-8', init);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** A whole number from the query, held between 0 and `max`. */
function capped(value: string | null, fallback: number, max: number): number {
  const number = value === null ? fallback : Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(Math.max(number, 0), max) : fallback;
}

/** The body's text from `size` bytes in, one chunk after the other, up to the cap. */
async function readOn(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  size: number,
): Promise<string> {
  const { done, value } = await reader.read();
  if (done) {
    return '';
  }
  const part = value.subarray(0, ECHO_MAX_BYTES - size);
  const text = decoder.decode(part, { stream: true });
  if (size + part.byteLength >= ECHO_MAX_BYTES) {
    await reader.cancel();
    return text;
  }
  return text + (await readOn(reader, decoder, size + part.byteLength));
}

/** The start of the request's body as text. The rest is never read. */
async function bodyStart(request: Request): Promise<string> {
  return request.body === null ? '' : readOn(request.body.getReader(), new TextDecoder(), 0);
}

/**
 * What the request was, for the page to see in its own answer: the method, the
 * names of a fixed few headers, and the body's start. A header's value comes
 * back only where it cannot be a visitor's secret: the two content headers, the
 * demo's own fake token, and the instant devknobs' clock sends.
 */
async function echo(request: Request): Promise<Response> {
  if (request.method === 'DELETE') {
    return answer(null, null, { status: 204 });
  }
  const headers: Record<string, string> = {};
  for (const name of ECHO_HEADERS) {
    const value = request.headers.get(name);
    if (value === null) {
      continue;
    }
    if (ECHO_VALUES.has(name)) {
      headers[name] = value.slice(0, HEADER_VALUE_MAX);
    } else if (name === 'content-length') {
      headers[name] = String(capped(value, 0, Number.MAX_SAFE_INTEGER));
    } else {
      const known =
        value === FAKE_SECRET ||
        value === `Bearer ${FAKE_SECRET}` ||
        (NOW_HEADERS.has(name) && INSTANT.test(value));
      headers[name] = known ? value : 'sent';
    }
  }
  return json(
    { body: await bodyStart(request), headers, method: request.method },
    { status: request.method === 'POST' ? 201 : 200 },
  );
}

/** `parts`, one every `gapMs`, then the end. A reader that leaves stops it. */
function timed(parts: Array<string>, gapMs: number): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let sent = 0;
  return new ReadableStream({
    async pull(controller) {
      await sleep(gapMs);
      const part = parts[sent];
      if (part !== undefined) {
        controller.enqueue(encoder.encode(part));
      }
      sent += 1;
      if (sent >= parts.length) {
        controller.close();
      }
    },
  });
}

function big(kb: number): Response {
  const rows = Math.max(1, Math.floor((kb * 1024) / (BIG_ROW.length + 1)));
  return answer(`[${BIG_ROW}${`,${BIG_ROW}`.repeat(rows - 1)}]`, 'application/json; charset=utf-8');
}

/**
 * Everything the page's request buttons ask for, so the devknobs requests view
 * has every kind of request to show. It holds nothing, calls nothing, and every
 * delay, size and stream has a fixed cap.
 */
async function demo({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const [name = '', detail, ...rest] = url.pathname.replace(/^\/api\/demo\/?/u, '').split('/');
  const methods = METHODS[name];
  if (methods === undefined || rest.length > 0 || (detail !== undefined && name !== 'status')) {
    return json({ error: 'not found' }, { status: 404 });
  }
  // The framework hands a HEAD to the GET handler.
  if (!methods.includes(request.method === 'HEAD' ? 'GET' : request.method)) {
    return json(
      { error: 'method not allowed' },
      { headers: { allow: methods.join(', ') }, status: 405 },
    );
  }
  switch (name) {
    case 'json': {
      return json({ knobs: ['device', 'time', 'language'], ok: true });
    }
    case 'echo': {
      return echo(request);
    }
    case 'status': {
      const code = Number(detail);
      return STATUSES.has(code)
        ? json({ error: `demo error ${code}`, status: code }, { status: code })
        : json({ error: 'unknown status' }, { status: 400 });
    }
    case 'redirect': {
      return answer(null, null, { headers: { location: '/api/demo/json' }, status: 302 });
    }
    case 'slow': {
      const ms = capped(url.searchParams.get('ms'), SLOW_DEFAULT_MS, SLOW_MAX_MS);
      await sleep(ms);
      return json({ ms, ok: true });
    }
    case 'big': {
      return big(capped(url.searchParams.get('kb'), BIG_DEFAULT_KB, BIG_MAX_KB));
    }
    case 'text': {
      return answer('A plain text answer from the demo endpoint\n', 'text/plain; charset=utf-8');
    }
    case 'html': {
      return answer(HTML, 'text/html; charset=utf-8');
    }
    case 'bin': {
      return answer(
        Uint8Array.from({ length: 256 }, (_, index) => index),
        'application/octet-stream',
      );
    }
    case 'stream': {
      return answer(
        timed(
          Array.from({ length: STREAM_LINES }, (_, index) => `line ${index + 1}\n`),
          STREAM_GAP_MS,
        ),
        'text/plain; charset=utf-8',
      );
    }
    case 'events': {
      return answer(
        timed(
          Array.from({ length: EVENTS }, (_, index) =>
            index === EVENTS - 1
              ? 'event: done\ndata: {"done":true}\n\n'
              : `event: tick\ndata: {"tick":${index + 1}}\n\n`,
          ),
          EVENTS_GAP_MS,
        ),
        'text/event-stream; charset=utf-8',
      );
    }
    case 'asset.css': {
      return answer('/* The demo stylesheet. It styles nothing. */\n', 'text/css; charset=utf-8');
    }
    case 'asset.js': {
      return answer('// The demo script. It does nothing.\n', 'text/javascript; charset=utf-8');
    }
    case 'asset.png': {
      return answer(bytes(PNG), 'image/png');
    }
    default: {
      return answer(bytes(WOFF2), 'font/woff2');
    }
  }
}

export const Route = createFileRoute('/api/demo/$')({
  server: {
    handlers: {
      DELETE: demo,
      GET: demo,
      PATCH: demo,
      POST: demo,
      PUT: demo,
    },
  },
});
