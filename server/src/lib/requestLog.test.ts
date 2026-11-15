/**
 * The request log must never print a credential. Two addresses carry one: the
 * plan feed (the token is the file name) and the inbox (?token=).
 */

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { maskTarget, requestLog } from './requestLog.js';

describe('maskTarget', () => {
  it('hides the token in a plan feed address', () => {
    expect(maskTarget('/calendar/fgcal_SECRET.ics')).toBe('/calendar/[redacted].ics');
    expect(maskTarget('/calendar/fgcal_SECRET')).toBe('/calendar/[redacted]');
    expect(maskTarget('/calendar/fgcal_SECRET.ICS?x=1')).toBe('/calendar/[redacted].ics?x=1');
  });

  it('hides an old feed link, which held a personal access token', () => {
    expect(maskTarget('/calendar/fgpat_SECRET.ics')).toBe('/calendar/[redacted].ics');
  });

  it('hides whatever follows /calendar/, token-shaped or not', () => {
    expect(maskTarget('/calendar/a-guess.ics')).toBe('/calendar/[redacted].ics');
    expect(maskTarget('/calendar/SECRET/more')).toBe('/calendar/[redacted]');
    expect(maskTarget('/Calendar/SECRET.ics')).toBe('/calendar/[redacted].ics');
  });

  it('recognises the feed however the path was encoded', () => {
    expect(maskTarget('/%63alendar/fgcal_SECRET.ics')).toBe('/calendar/[redacted].ics');
    // The router's own reading of the path wins over ours.
    expect(maskTarget('/%63alendar/%E0%A4%A/SECRET', '/calendar/%E0%A4%A/SECRET')).toBe('/calendar/[redacted]');
  });

  it('hides the token query value on the inbox', () => {
    expect(maskTarget('/inbox?token=fgpat_SECRET')).toBe('/inbox?token=[redacted]');
    expect(maskTarget('/inbox?source=teams&token=fgpat_SECRET&tz=480')).toBe('/inbox?source=teams&token=[redacted]&tz=480');
    expect(maskTarget('/inbox?token=SECRET-of-another-shape')).toBe('/inbox?token=[redacted]');
    expect(maskTarget('/inbox?token=fgpat%5FSECRET')).toBe('/inbox?token=[redacted]');
  });

  it('hides a token query value on any path, and however the key is written', () => {
    expect(maskTarget('/quests?token=SECRET')).toBe('/quests?token=[redacted]');
    expect(maskTarget('/inbox?TOKEN=SECRET')).toBe('/inbox?TOKEN=[redacted]');
    expect(maskTarget('/inbox?%74oken=SECRET')).toBe('/inbox?%74oken=[redacted]');
    expect(maskTarget('/inbox?token=SECRET&token=SECRET2')).toBe('/inbox?token=[redacted]&token=[redacted]');
  });

  it('hides one of our tokens wherever else it turns up', () => {
    expect(maskTarget('/inbox/fgpat_SECRET')).toBe('/inbox/fgpat_[redacted]');
    expect(maskTarget('/quests?clerkId=fgd_SECRET&tz=480')).toBe('/quests?clerkId=fgd_[redacted]&tz=480');
    expect(maskTarget('/feed/fgcal_SECRET-with_all-chars.ics')).toBe('/feed/fgcal_[redacted].ics');
  });

  it('hides every query value on the app-link return, keeping the keys', () => {
    expect(maskTarget('/app-link/return?code=abc&state=def')).toBe('/app-link/return?code=[redacted]&state=[redacted]');
    expect(maskTarget('/app-link/return/?code=abc')).toBe('/app-link/return/?code=[redacted]');
    expect(maskTarget('/app-link/return?state=def&code=abc&x=1')).toBe('/app-link/return?state=[redacted]&code=[redacted]&x=[redacted]');
    expect(maskTarget('/app-link/%72eturn?code=abc')).toBe('/app-link/%72eturn?code=[redacted]');
    // The router's own reading of the path wins over ours.
    expect(maskTarget('/app-link/%72eturn?code=abc', '/app-link/return')).toBe('/app-link/%72eturn?code=[redacted]');
    expect(maskTarget('/app-link/return')).toBe('/app-link/return');
  });

  it('leaves the query alone on neighbouring paths', () => {
    expect(maskTarget('/app-link/other?code=abc')).toBe('/app-link/other?code=abc');
    expect(maskTarget('/app-link/return/x?code=abc')).toBe('/app-link/return/x?code=abc');
  });

  it('leaves ordinary addresses as they came', () => {
    for (const target of ['/health', '/quests?tz=480&clerkId=user_123', '/schedule/today', '/calendar', '/inbox?source=teams', '/inbox?token']) {
      expect(maskTarget(target)).toBe(target);
    }
  });

  it('prints the address as it arrived, so an encoded line break cannot forge a line', () => {
    expect(maskTarget('/quests%0A--%3E%20GET%20/x%20200', '/quests\n--> GET /x 200')).toBe('/quests%0A--%3E%20GET%20/x%20200');
  });
});

describe('requestLog', () => {
  const build = () => {
    const lines: string[] = [];
    const app = new Hono();
    app.use('*', requestLog((line) => lines.push(line)));
    app.get('/calendar/:file', (c) => c.text('BEGIN:VCALENDAR'));
    app.post('/inbox', (c) => c.json({ success: true }, 201));
    app.get('/quests', (c) => c.json({ success: true }));
    return { app, lines };
  };

  it('logs method, masked address, status and time, and never either token', async () => {
    const { app, lines } = build();
    await app.request('/calendar/fgcal_SECRETfeed.ics');
    await app.request('/inbox?token=fgpat_SECRETinbox&source=teams', { method: 'POST' });

    expect(lines).toEqual([
      '<-- GET /calendar/[redacted].ics',
      expect.stringMatching(/^--> GET \/calendar\/\[redacted\]\.ics 200 \d+ms$/),
      '<-- POST /inbox?token=[redacted]&source=teams',
      expect.stringMatching(/^--> POST \/inbox\?token=\[redacted\]&source=teams 201 \d+ms$/),
    ]);
    expect(lines.join('\n')).not.toContain('SECRET');
  });

  it('hides the feed token when the path arrives percent-encoded, as the router still serves it', async () => {
    const { app, lines } = build();
    const res = await app.request('/%63alendar/fgcal_SECRETfeed.ics');
    expect(res.status).toBe(200); // Hono decodes the path before matching, so this is the feed.
    expect(lines[0]).toBe('<-- GET /calendar/[redacted].ics');
    expect(lines.join('\n')).not.toContain('SECRET');
  });

  it('prints neither the code nor the state from an app-link return', async () => {
    const { app, lines } = build();
    app.get('/app-link/return', (c) => c.html('<p>ok</p>'));
    await app.request('/app-link/return?code=abc&state=def');
    expect(lines).toEqual([
      '<-- GET /app-link/return?code=[redacted]&state=[redacted]',
      expect.stringMatching(/^--> GET \/app-link\/return\?code=\[redacted\]&state=\[redacted\] 200 \d+ms$/),
    ]);
    expect(lines.join('\n')).not.toMatch(/abc|def/);
  });

  it('logs everything else as it came, with the status of a miss', async () => {
    const { app, lines } = build();
    await app.request('/quests?tz=480');
    await app.request('/nowhere');
    expect(lines[0]).toBe('<-- GET /quests?tz=480');
    expect(lines[1]).toMatch(/^--> GET \/quests\?tz=480 200 \d+ms$/);
    expect(lines[3]).toMatch(/^--> GET \/nowhere 404 \d+ms$/);
  });
});
