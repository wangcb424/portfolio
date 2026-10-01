import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BANNER_BASE, BANNER_ORIGIN, PUBLIC_PAGE, CookieJar, UpstreamQueue, assertPublicUrl,
  createBannerReader, createHandler, normalizeQuery, parseSections, parseTerms, splitSetCookies} from './worker.mjs';

const NOW = Date.parse('2026-10-01T05:00:00Z');
const row = () => ({term: '202710', subject: 'CS', courseNumber: '3100', courseReferenceNumber: '17206',
  courseTitle: 'Algorithms &amp; Data &#8545;', sequenceNumber: '01', maximumEnrollment: 100, seatsAvailable: 2,
  faculty: [{displayName: 'Ada Lovelace'}, {displayName: 'Ada Lovelace'}],
  meetingsFaculty: [{meetingTime: {monday: true, wednesday: true, beginTime: '1450', endTime: '1630'}}]});
const fixture = () => ({success: true, totalCount: 1, data: [row()]});
const immediateQueue = {run: operation => operation()};
const request = (path, options = {}) => new Request(`https://courseflow.test${path}`, options);
const jsonResponse = value => Response.json(value);

test('normalizes course code and rejects URLs, oversized input, invalid terms', () => {
  assert.deepEqual(normalizeQuery('202710', 'cs 3100'), {term: '202710', code: 'CS3100', subject: 'CS', number: '3100'});
  for (const [term, course] of [['https://127.0.0.1', 'CS3100'], ['202710', 'http://localhost'],
    ['202710', 'CS3100&txt_term=202610'], ['202710', 'A'.repeat(100)], ['202710\n', 'CS3100']]) {
    assert.throws(() => normalizeQuery(term, course), {status: 400});
  }
});

test('parses course fields, deduplicates instructors, formats meetings, decodes title', () => {
  const data = parseSections(fixture(), '202710', 'CS3100', new Date(NOW).toISOString());
  assert.equal(data.sections.length, 1);
  assert.deepEqual(data.sections[0], {id: 'banner:202710:17206', source: 'banner', term: '202710',
    crn: '17206', code: 'CS3100', title: 'Algorithms & Data Ⅱ', sectionNumber: '01', instructor: 'Ada Lovelace',
    meetingSummary: 'Mon / Wed · 14:50–16:30', capacity: 100, available: 2,
    checkedAt: new Date(NOW).toISOString(), lastAttemptAt: new Date(NOW).toISOString(), errorMessage: null});
  assert.equal(data.truncated, false);
});

test('negative overenrollment is preserved and truncated is explicit', () => {
  const input = fixture(); input.data[0].seatsAvailable = -2; input.totalCount = 51;
  const output = parseSections(input, '202710', 'CS3100');
  assert.equal(output.sections[0].available, -2); assert.equal(output.truncated, true);
});

test('missing/incorrect seat data fails instead of substituting zero', () => {
  for (const value of [null, '0', undefined, 0.5, Infinity]) {
    const input = fixture(); input.data[0].seatsAvailable = value;
    assert.throws(() => parseSections(input, '202710', 'CS3100'), {status: 503});
  }
  for (const input of [{success: false, data: []}, {success: true}, null, '<html>sign in</html>'])
    assert.throws(() => parseSections(input, '202710', 'CS3100'), {status: 503});
});

test('filters mismatched terms and courses, permits a genuine empty result', () => {
  const input = fixture(); input.data[0].term = '202610';
  assert.equal(parseSections(input, '202710', 'CS3100').sections.length, 0);
  assert.deepEqual(parseSections({success: true, totalCount: 0, data: []}, '202710', 'CS3100', 'now'),
    {sections: [], truncated: false, fetchedAt: 'now'});
});

test('terms require string term identifiers and strip invalid entries', () => {
  assert.deepEqual(parseTerms([{code: '202710', description: 'Fall 2026'}, {code: 202710, description: 'bad'},
    {code: 'http://x', description: 'bad'}, null]), [{code: '202710', description: 'Fall 2026'}]);
  assert.throws(() => parseTerms({data: []}), {status: 503});
});

test('splits merged Set-Cookie without splitting Expires date', () => {
  assert.deepEqual(splitSetCookies('one=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/, two=2; Path=/'),
    ['one=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/', 'two=2; Path=/']);
});

test('anonymous cookies respect paths, expiry, deletion, host and secure attributes', () => {
  let now = NOW; const jar = new CookieJar(() => now);
  const headers = new Headers();
  headers.append('set-cookie', 'session=abc; Path=/StudentRegistrationSsb; Secure; HttpOnly');
  headers.append('set-cookie', 'short=yes; Path=/; Max-Age=10');
  headers.append('set-cookie', 'foreign=no; Domain=example.com; Path=/');
  jar.receive(headers, PUBLIC_PAGE);
  assert.equal(jar.header(`${BANNER_BASE}/ssb/classSearch/classSearch`), 'session=abc; short=yes');
  assert.equal(jar.header(`${BANNER_ORIGIN}/StudentRegistrationSsbWrong`), 'short=yes');
  assert.equal(jar.header('https://example.com/StudentRegistrationSsb'), '');
  assert.equal(jar.header('http://nubanner.neu.edu/StudentRegistrationSsb'), 'short=yes');
  now += 11_000; assert.equal(jar.header(PUBLIC_PAGE), 'session=abc');
  jar.receive(new Headers({'set-cookie': 'session=; Path=/StudentRegistrationSsb; Max-Age=0'}), PUBLIC_PAGE);
  assert.equal(jar.header(PUBLIC_PAGE), '');
});

test('fallback Headers implementation handles merged cookies', () => {
  const jar = new CookieJar(() => NOW);
  jar.receive({get: () => 'a=1; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/, b=2; Path=/'}, PUBLIC_PAGE);
  assert.equal(jar.header(PUBLIC_PAGE), 'a=1; b=2');
});

test('public URL allowlist rejects SSRF and login endpoints', () => {
  assert.equal(assertPublicUrl(PUBLIC_PAGE), PUBLIC_PAGE);
  for (const target of ['https://127.0.0.1/StudentRegistrationSsb/ssb/term/termSelection',
    'https://nubanner.neu.edu.evil.test/StudentRegistrationSsb/ssb/term/termSelection',
    'http://nubanner.neu.edu/StudentRegistrationSsb/ssb/term/termSelection',
    'https://secret@nubanner.neu.edu/StudentRegistrationSsb/ssb/term/termSelection',
    `${BANNER_BASE}/login`, `${BANNER_BASE}/ssb/registration`, `${PUBLIC_PAGE}#fragment`])
    assert.throws(() => assertPublicUrl(target), {status: 503});
});

test('complete anonymous search sends exact term and keeps cookies within one query', async () => {
  const seen = []; let session = 0;
  const fetchImpl = async (url, options) => {
    seen.push({url, ...options}); const path = new URL(url).pathname;
    if (path.endsWith('/termSelection')) {
      assert.equal(options.headers.Cookie, undefined); session++;
      const headers = new Headers(); headers.append('set-cookie', `session=s${session}; Path=/StudentRegistrationSsb; Secure`);
      headers.append('set-cookie', 'loadbalancer=x; Path=/; Secure');
      return new Response('Public term page', {headers});
    }
    assert.equal(options.headers.Cookie, `session=s${session}; loadbalancer=x`);
    assert.equal(options.redirect, 'manual');
    if (path.endsWith('/term/search')) {
      assert.equal(options.method, 'POST');
      assert.equal(new URLSearchParams(options.body).get('term'), '202710');
      return jsonResponse({fwdURL: '/StudentRegistrationSsb/ssb/classSearch/classSearch'});
    }
    if (path.endsWith('/classSearch/classSearch')) return new Response('Public search page');
    assert.equal(new URL(url).searchParams.get('txt_subject'), 'CS');
    assert.equal(new URL(url).searchParams.get('txt_courseNumber'), '3100');
    return jsonResponse(fixture());
  };
  const reader = createBannerReader({fetchImpl, queue: immediateQueue, now: () => NOW, makeId: () => 'test-session'});
  assert.equal((await reader.search('202710', 'CS3100')).sections[0].available, 2);
  await reader.search('202710', 'CS3100'); assert.equal(seen.length, 8);
});

test('same-origin public redirects preserve anonymous cookies', async () => {
  let count = 0;
  const reader = createBannerReader({queue: immediateQueue, fetchImpl: async (url, options) => {
    count++;
    if (count === 1) return new Response(null, {status: 302, headers: {location:
      '/StudentRegistrationSsb/ssb/classSearch/getTerms?fresh=1', 'set-cookie': 'token=abc; Path=/; Secure'}});
    assert.equal(options.headers.Cookie, 'token=abc'); return jsonResponse([{code: '202710', description: 'Fall 2026'}]);
  }});
  assert.equal((await reader.terms())[0].code, '202710'); assert.equal(count, 2);
});

test('external redirects and bad forward URLs fail without fetching their targets', async () => {
  let count = 0;
  const redirectReader = createBannerReader({queue: immediateQueue, fetchImpl: async () => {
    count++; return new Response(null, {status: 302, headers: {location: 'https://attacker.invalid/capture'}});
  }});
  await assert.rejects(redirectReader.terms(), {status: 503}); assert.equal(count, 1);
  count = 0;
  const forwardReader = createBannerReader({queue: immediateQueue, fetchImpl: async () => {
    count++; return count === 1 ? new Response('term page') : jsonResponse({fwdURL: 'https://attacker.invalid/capture'});
  }});
  await assert.rejects(forwardReader.search('202710', 'CS3100'), {status: 503}); assert.equal(count, 2);
});

test('timeouts abort upstream and HTTP failures never invent availability', async () => {
  const timeoutReader = createBannerReader({queue: immediateQueue, timeoutMs: 5, fetchImpl: (_url, {signal}) =>
    new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))});
  await assert.rejects(timeoutReader.terms(), {status: 503});
  const failing = createBannerReader({queue: immediateQueue, fetchImpl: async () => new Response('failure', {status: 500})});
  await assert.rejects(failing.terms(), {status: 503});
});

test('streaming response body limit cancels oversized payloads', async () => {
  const reader = createBannerReader({queue: immediateQueue,
    fetchImpl: async () => new Response('x'.repeat(2_000_001))});
  await assert.rejects(reader.terms(), {status: 503});
});

test('upstream queue serializes calls, spaces starts, and limits waiting work', async () => {
  let now = 0; const starts = [];
  const queue = new UpstreamQueue({now: () => now, wait: async ms => { now += ms; }, gapMs: 1200, maxQueued: 2});
  const operation = () => { starts.push(now); return 'ok'; };
  const one = queue.run(operation), two = queue.run(operation), three = queue.run(operation);
  await assert.rejects(three, {status: 503}); await Promise.all([one, two]);
  assert.deepEqual(starts, [0, 1200]);
});

test('API CORS accepts exact GitHub origin and opt-in local dev only', async () => {
  const handle = createHandler({reader: {}, now: () => NOW});
  const good = await handle(request('/api/status', {headers: {origin: 'https://wangcb424.github.io'}}));
  assert.equal(good.headers.get('access-control-allow-origin'), 'https://wangcb424.github.io');
  assert.equal(good.headers.get('access-control-allow-credentials'), null);
  assert.equal((await good.json()).backgroundMonitoring, false);
  for (const origin of ['https://wangcb424.github.io.evil.test', 'null', 'https://example.com', 'http://localhost:5173'])
    assert.equal((await handle(request('/api/status', {headers: {origin}}))).status, 403);
  assert.equal((await handle(request('/api/status', {headers: {origin: 'http://localhost:5173'}}), {ALLOW_LOCALHOST: 'true'})).status, 200);
});

test('API has no mutation or arbitrary URL endpoints', async () => {
  let queries = 0;
  const handle = createHandler({reader: {search: async () => { queries++; return fixture(); }}});
  assert.equal((await handle(request('/api/catalog/sections?term=202710&q=CS3100&url=https://localhost'))).status, 400);
  assert.equal((await handle(request('/api/catalog/sections?term=202710&term=202610&q=CS3100'))).status, 400);
  assert.equal((await handle(request('/api/catalog/sections?term=202710&q=https://localhost'))).status, 400);
  assert.equal((await handle(request('/api/auth/verify', {method: 'POST'}))).status, 405);
  assert.equal((await handle(request('/api/proxy?url=https://localhost'))).status, 404);
  assert.equal(queries, 0);
});

test('API caches/coalesces queries for 60 seconds with a bounded cache', async () => {
  let now = NOW, calls = 0;
  const handle = createHandler({now: () => now, cacheLimit: 1, reader: {search: async (term, code) => {
    calls++; return {sections: [{term, code}], truncated: false, fetchedAt: new Date(now).toISOString()};
  }}});
  const path = '/api/catalog/sections?term=202710&q=CS3100';
  await Promise.all([handle(request(path)), handle(request(path))]); assert.equal(calls, 1);
  now += 59_000; await handle(request(path)); assert.equal(calls, 1);
  now += 1_001; await handle(request(path)); assert.equal(calls, 2);
  await handle(request('/api/catalog/sections?term=202710&q=CS3000'));
  await handle(request(path)); assert.equal(calls, 4);
});

test('failed refresh returns 503, is not cached, and does not return zero seats', async () => {
  let calls = 0;
  const handle = createHandler({reader: {search: async () => { calls++; throw new Error('private upstream detail'); }}});
  for (let i = 0; i < 2; i++) {
    const response = await handle(request('/api/catalog/sections?term=202710&q=CS3100'));
    assert.equal(response.status, 503);
    const body = await response.json(); assert.equal(body.sections, undefined);
    assert.deepEqual(body.details, [body.message]);
    assert.ok(!body.message.includes('private upstream detail'));
  }
  assert.equal(calls, 2);
});

test('per-IP API rate limit resets after one minute', async () => {
  let now = NOW; const handle = createHandler({reader: {}, now: () => now, rateLimit: 2});
  const make = ip => request('/api/status', {headers: {'CF-Connecting-IP': ip}});
  assert.equal((await handle(make('1.2.3.4'))).status, 200);
  assert.equal((await handle(make('1.2.3.4'))).status, 200);
  const limit = await handle(make('1.2.3.4')); assert.equal(limit.status, 429); assert.equal(limit.headers.get('retry-after'), '60');
  assert.equal((await handle(make('1.2.3.5'))).status, 200);
  now += 60_001; assert.equal((await handle(make('1.2.3.4'))).status, 200);
});
