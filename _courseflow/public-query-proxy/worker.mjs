/**
 * CourseFlow anonymous public Banner reader. Works as a Cloudflare Workers module.
 * No school credentials, registration endpoints, arbitrary URL proxy, or database.
 * All in-memory limits are per isolate, not a distributed/global rate limiter.
 */
export const BANNER_ORIGIN = 'https://nubanner.neu.edu';
export const BANNER_BASE = `${BANNER_ORIGIN}/StudentRegistrationSsb`;
export const PUBLIC_PAGE = `${BANNER_BASE}/ssb/term/termSelection?mode=search`;
const MAX_BYTES = 2_000_000;
const PUBLIC_PATHS = new Set([
  '/StudentRegistrationSsb/ssb/term/termSelection',
  '/StudentRegistrationSsb/ssb/term/search',
  '/StudentRegistrationSsb/ssb/classSearch/classSearch',
  '/StudentRegistrationSsb/ssb/classSearch/getTerms',
  '/StudentRegistrationSsb/ssb/searchResults/searchResults',
]);

class HttpError extends Error {
  constructor(status, message, retryAfter) {
    super(message); this.status = status; this.retryAfter = retryAfter;
  }
}
const unavailable = () => new HttpError(503,
  'Banner is unavailable. Existing seat counts have not been changed. Try again later.');
const text = value => typeof value === 'string' ? value : '';
const clip = (value, max) => text(value).slice(0, max);
const clock = value => /^[0-9]{4}$/.test(text(value)) ? `${value.slice(0, 2)}:${value.slice(2)}` : 'TBA';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function normalizeQuery(term, query) {
  if (!/^[0-9]{6}$/.test(term ?? '')) throw new HttpError(400, 'Choose a valid six-digit term.');
  if (typeof query !== 'string' || query.length > 30) throw new HttpError(400, 'Use a course code such as CS3100.');
  const code = query.toUpperCase().replace(/\s+/g, '');
  const match = /^([A-Z]{2,6})([0-9]{4}[A-Z]?)$/.exec(code);
  if (!match) throw new HttpError(400, 'Use a course code such as CS3100.');
  return {term, code, subject: match[1], number: match[2]};
}

export function decodeEntities(value) {
  const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
  return text(value).replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (all, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? all;
    const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number) : all;
  });
}

export function parseTerms(root) {
  if (!Array.isArray(root)) throw unavailable();
  return root.filter(row => row && typeof row.code === 'string' && /^[0-9]{6}$/.test(row.code) && typeof row.description === 'string')
    .slice(0, 30).map(row => ({code: row.code, description: clip(decodeEntities(row.description), 200)}));
}

export function parseSections(root, term, courseCode, now = new Date().toISOString()) {
  if (!root || root.success !== true || !Array.isArray(root.data)) throw unavailable();
  const sections = [];
  for (const row of root.data) {
    if (!row || row.term !== term || `${text(row.subject)}${text(row.courseNumber)}` !== courseCode) continue;
    const crn = text(row.courseReferenceNumber);
    if (!/^[0-9]{4,8}$/.test(crn) || !Number.isSafeInteger(row.maximumEnrollment)
      || row.maximumEnrollment < 0 || !Number.isSafeInteger(row.seatsAvailable)) throw unavailable();
    const names = [...new Set((Array.isArray(row.faculty) ? row.faculty : [])
      .map(item => text(item?.displayName)).filter(name => name.trim()))];
    const meetings = new Set();
    for (const item of Array.isArray(row.meetingsFaculty) ? row.meetingsFaculty : []) {
      const meeting = item?.meetingTime;
      if (!meeting || typeof meeting !== 'object') continue;
      const days = [['monday', 'Mon'], ['tuesday', 'Tue'], ['wednesday', 'Wed'], ['thursday', 'Thu'],
        ['friday', 'Fri'], ['saturday', 'Sat'], ['sunday', 'Sun']]
        .filter(([key]) => meeting[key] === true).map(([, label]) => label);
      if (days.length) meetings.add(`${days.join(' / ')} · ${clock(meeting.beginTime)}–${clock(meeting.endTime)}`);
    }
    sections.push({id: `banner:${term}:${crn}`, source: 'banner', term, crn, code: courseCode,
      title: clip(decodeEntities(row.courseTitle), 255), sectionNumber: clip(row.sequenceNumber, 20),
      instructor: clip(names.length ? names.join(', ') : 'Instructor not listed', 255),
      meetingSummary: clip(meetings.size ? [...meetings].join('; ') : 'Meeting time not listed', 1000),
      capacity: row.maximumEnrollment, available: row.seatsAvailable, checkedAt: now,
      lastAttemptAt: now, errorMessage: null});
  }
  return {sections, truncated: Number.isSafeInteger(root.totalCount) && root.totalCount > root.data.length,
    fetchedAt: now};
}

// Headers.get('set-cookie') can coalesce fields. Only split a comma followed by a
// cookie name and '='; the comma in Expires=Wed, 21 Oct ... must remain intact.
export function splitSetCookies(value) {
  return text(value).split(/,(?=\s*[!#$%&'*+.^_`|~0-9A-Za-z-]+=)/g).map(s => s.trim()).filter(Boolean);
}

export class CookieJar {
  constructor(now = Date.now) { this.cookies = new Map(); this.now = now; }
  receive(headers, url) {
    const target = new URL(url);
    const fields = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie() : splitSetCookies(headers.get('set-cookie'));
    for (const field of fields.flatMap(splitSetCookies)) {
      const [pair, ...attributes] = field.split(';');
      const equals = pair.indexOf('=');
      if (equals < 1) continue;
      const name = pair.slice(0, equals).trim();
      const value = pair.slice(equals + 1).trim();
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\x00-\x20\x7f;,]/.test(value)) continue;
      let path = target.pathname.slice(0, target.pathname.lastIndexOf('/')) || '/';
      let domain = target.hostname, secure = false, expires = Infinity, maxAge;
      let allowed = true;
      for (const attribute of attributes) {
        const position = attribute.indexOf('=');
        const key = (position < 0 ? attribute : attribute.slice(0, position)).trim().toLowerCase();
        const val = position < 0 ? '' : attribute.slice(position + 1).trim();
        if (key === 'domain') {
          // Never broaden the anonymous session to a parent or another host.
          if (val.toLowerCase().replace(/^\./, '') !== target.hostname) allowed = false;
        } else if (key === 'path' && val.startsWith('/')) path = val;
        else if (key === 'secure') secure = true;
        else if (key === 'max-age' && /^-?[0-9]+$/.test(val)) maxAge = Number(val);
        else if (key === 'expires' && Number.isFinite(Date.parse(val))) expires = Date.parse(val);
      }
      if (!allowed) continue;
      if (maxAge !== undefined) expires = this.now() + maxAge * 1000;
      const key = `${domain}|${path}|${name}`;
      if (expires <= this.now()) this.cookies.delete(key);
      else {
        if (!this.cookies.has(key) && this.cookies.size >= 50) throw unavailable();
        this.cookies.set(key, {name, value, path, domain, secure, expires});
      }
    }
  }
  header(url) {
    const target = new URL(url);
    const result = [];
    for (const [key, cookie] of this.cookies) {
      if (cookie.expires <= this.now()) { this.cookies.delete(key); continue; }
      if (cookie.domain !== target.hostname || (cookie.secure && target.protocol !== 'https:')) continue;
      if (!(target.pathname === cookie.path || (target.pathname.startsWith(cookie.path)
        && (cookie.path.endsWith('/') || target.pathname[cookie.path.length] === '/')))) continue;
      result.push(cookie);
    }
    return result.sort((a, b) => b.path.length - a.path.length)
      .map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  }
}

export function assertPublicUrl(value) {
  const url = new URL(value);
  if (url.origin !== BANNER_ORIGIN || url.username || url.password || url.hash || !PUBLIC_PATHS.has(url.pathname))
    throw unavailable();
  return url.toString();
}

async function readBody(response) {
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > MAX_BYTES) { await response.body?.cancel(); throw unavailable(); }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw unavailable(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(result);
}

export class UpstreamQueue {
  constructor({now = Date.now, wait = sleep, gapMs = 1200, maxQueued = 12} = {}) {
    this.now = now; this.wait = wait; this.gapMs = gapMs; this.maxQueued = maxQueued;
    this.tail = Promise.resolve(); this.pending = 0; this.nextStart = 0;
  }
  run(operation) {
    if (this.pending >= this.maxQueued) return Promise.reject(new HttpError(503, 'The public lookup is busy. Try again shortly.', 15));
    const queuedAt = this.now(); this.pending++;
    const result = this.tail.then(async () => {
      const pause = Math.max(0, this.nextStart - this.now());
      if (this.now() - queuedAt + pause > 15_000) throw new HttpError(503, 'The public lookup is busy. Try again shortly.', 15);
      if (pause) await this.wait(pause);
      this.nextStart = this.now() + this.gapMs;
      return operation();
    });
    this.tail = result.catch(() => {}).finally(() => { this.pending--; });
    return result;
  }
}

export function createBannerReader({fetchImpl = fetch, now = Date.now, queue = new UpstreamQueue({now}),
  timeoutMs = 12_000, makeId = () => crypto.randomUUID()} = {}) {
  async function request(jar, path, form) {
    let url = assertPublicUrl(`${BANNER_BASE}${path}`);
    let body = form, method = form === undefined ? 'GET' : 'POST';
    for (let redirects = 0; redirects <= 3; redirects++) {
      const result = await queue.run(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const headers = {'Accept': 'application/json,text/html',
          'User-Agent': 'CourseFlow/0.2 (public course availability reader)'};
        const cookie = jar.header(url); if (cookie) headers.Cookie = cookie;
        if (body !== undefined) headers['Content-Type'] = 'application/x-www-form-urlencoded';
        try {
          const response = await fetchImpl(url, {method, body, headers, signal: controller.signal, redirect: 'manual'});
          jar.receive(response.headers, url);
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            await response.body?.cancel();
            if (!location || redirects === 3) throw unavailable();
            return {redirect: assertPublicUrl(new URL(location, url).toString()), status: response.status};
          }
          if (response.status !== 200) { await response.body?.cancel(); throw unavailable(); }
          return {text: await readBody(response)};
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw unavailable();
        } finally { clearTimeout(timeout); }
      });
      if (!result.redirect) return result.text;
      url = result.redirect;
      if (result.status === 303 || ((result.status === 301 || result.status === 302) && method === 'POST')) {
        method = 'GET'; body = undefined;
      }
    }
    throw unavailable();
  }
  const json = value => { try { return JSON.parse(value); } catch { throw unavailable(); } };
  return {
    async terms() {
      const jar = new CookieJar(now);
      return parseTerms(json(await request(jar, '/ssb/classSearch/getTerms?searchTerm=&offset=1&max=30')));
    },
    async search(term, courseCode) {
      const query = normalizeQuery(term, courseCode); const jar = new CookieJar(now); const id = makeId();
      await request(jar, '/ssb/term/termSelection?mode=search');
      const form = new URLSearchParams({term: query.term, studyPath: '', studyPathText: '',
        startDatepicker: '', endDatepicker: '', uniqueSessionId: id}).toString();
      const selected = json(await request(jar, '/ssb/term/search?mode=search', form));
      if (selected.fwdURL !== '/StudentRegistrationSsb/ssb/classSearch/classSearch') throw unavailable();
      await request(jar, '/ssb/classSearch/classSearch');
      const params = new URLSearchParams({txt_subject: query.subject, txt_courseNumber: query.number,
        txt_term: query.term, startDatepicker: '', endDatepicker: '', pageOffset: '0', pageMaxSize: '50',
        sortColumn: 'subjectDescription', sortDirection: 'asc', uniqueSessionId: id});
      const data = json(await request(jar, `/ssb/searchResults/searchResults?${params}`));
      return parseSections(data, term, query.code, new Date(now()).toISOString());
    },
  };
}

export function createHandler({reader = createBannerReader(), now = Date.now, cacheLimit = 256,
  rateLimit = 60, ipLimit = 5000} = {}) {
  const cache = new Map(); const running = new Map(); const buckets = new Map();
  let lastCleanup = 0, lastQuery = null;
  async function cached(key, operation) {
    const existing = cache.get(key);
    if (existing && existing.expires > now()) return existing.value;
    if (running.has(key)) return running.get(key);
    if (running.size >= 4) throw new HttpError(503, 'The public lookup is busy. Try again shortly.', 15);
    const pending = operation().then(value => {
      if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
      cache.set(key, {value, expires: now() + 60_000});
      lastQuery = new Date(now()).toISOString(); return value;
    }).finally(() => running.delete(key));
    running.set(key, pending); return pending;
  }
  return async function handle(request, env = {}) {
    const origin = request.headers.get('origin');
    const allowedOrigin = origin === 'https://wangcb424.github.io'
      || (env.ALLOW_LOCALHOST === 'true' && /^http:\/\/localhost:(5173|4173)$/.test(origin ?? ''));
    const headers = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin'};
    if (allowedOrigin) headers['Access-Control-Allow-Origin'] = origin;
    const respond = (body, status = 200, extra = {}) => new Response(JSON.stringify(
      status >= 400 && body.message ? {...body, details: [body.message]} : body),
      {status, headers: {...headers, ...extra}});
    if (origin && !allowedOrigin) return respond({message: 'Origin is not allowed.'}, 403);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...headers,
      'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept',
      'Access-Control-Max-Age': '600'}});
    if (request.method !== 'GET') return respond({message: 'Only public read requests are available.'}, 405, {'Allow': 'GET, OPTIONS'});
    const url = new URL(request.url);
    try {
      if (now() - lastCleanup > 60_000) {
        for (const [key, bucket] of buckets) if (bucket.until <= now()) buckets.delete(key);
        for (const [key, entry] of cache) if (entry.expires <= now()) cache.delete(key);
        lastCleanup = now();
      }
      // Cloudflare supplies CF-Connecting-IP. Do not trust X-Forwarded-For.
      // Other hosts should strip spoofed CF-Connecting-IP and inject a trusted IP.
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      let bucket = buckets.get(ip);
      if (!bucket || bucket.until <= now()) {
        if (!bucket && buckets.size >= ipLimit) throw new HttpError(503, 'The public lookup is busy. Try again shortly.', 60);
        bucket = {used: 0, until: now() + 60_000}; buckets.set(ip, bucket);
      }
      if (++bucket.used > rateLimit) throw new HttpError(429, 'Too many requests. Please wait one minute.', 60);
      if (url.pathname === '/api/status') {
        if ([...url.searchParams].length) throw new HttpError(400, 'Unexpected query parameters.');
        return respond({demo: false, source: 'banner', pollSeconds: 300, staleSeconds: 900,
          lastPoll: lastQuery, officialUrl: PUBLIC_PAGE, version: '0.2.0/free', mode: 'on-demand',
          backgroundMonitoring: false});
      }
      if (url.pathname === '/api/catalog/terms') {
        if ([...url.searchParams].length) throw new HttpError(400, 'Unexpected query parameters.');
        return respond(await cached('terms', () => reader.terms()));
      }
      if (url.pathname === '/api/catalog/sections') {
        const params = [...url.searchParams.keys()];
        if (params.some(key => !['term', 'q'].includes(key)) || params.length !== 2
          || url.searchParams.getAll('term').length !== 1 || url.searchParams.getAll('q').length !== 1)
          throw new HttpError(400, 'Supply only term and q.');
        const {term, code} = normalizeQuery(url.searchParams.get('term'), url.searchParams.get('q'));
        return respond(await cached(`${term}:${code}`, () => reader.search(term, code)));
      }
      return respond({message: 'Public lookup endpoint not found.'}, 404);
    } catch (error) {
      const known = error instanceof HttpError;
      return respond({message: known ? error.message : unavailable().message}, known ? error.status : 503,
        error.retryAfter ? {'Retry-After': String(error.retryAfter)} : {});
    }
  };
}

const handler = createHandler();
export default {fetch: (request, env, ctx) => handler(request, env, ctx)};
