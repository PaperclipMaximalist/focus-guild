#!/usr/bin/env node
/**
 * Focus Guild MCP server.
 *
 * Lets Claude Desktop (or Claude Code) read and add to your Guild, so it can
 * combine your tracker, chronicle and permafile with its own connectors —
 * "pull my Teams meetings this week into the parking lot", "draft my weekly
 * review from the log".
 *
 * It is a thin client over the REST API, authenticated with the personal
 * access token from Settings → Connections. No database access, so it can
 * never do more than the app itself allows.
 *
 * Config (env):
 *   FOCUS_GUILD_URL    server base URL, e.g. https://focus-guild-production.up.railway.app
 *   FOCUS_GUILD_TOKEN  personal access token (fgpat_…)
 *
 * Deliberately read-mostly. The only writes are additive and reversible in
 * the app: parking lot, journal, decisions, permafile (which is versioned).
 * Nothing here can complete a quest, drop a tracker item or delete anything.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = (process.env['FOCUS_GUILD_URL'] ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');
const TOKEN = process.env['FOCUS_GUILD_TOKEN'] ?? '';

if (!TOKEN.startsWith('fgpat_')) {
  console.error('[focus-guild] FOCUS_GUILD_TOKEN is missing or malformed. Create one in Settings → Connections.');
}

/** Every response is `{ success, data }` or `{ success, error }`. */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as
    | { success: boolean; data?: T; error?: { code: string; message: string } }
    | null;
  if (!res.ok || !body?.success) {
    const err = body?.error;
    throw new Error(err ? `${err.code}: ${err.message}` : `Focus Guild answered ${res.status}`);
  }
  return body.data as T;
}

const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
const json = (value: unknown) => text(JSON.stringify(value, null, 2));

const server = new McpServer({ name: 'focus-guild', version: '1.0.0' });

// ─── Read ─────────────────────────────────────────────────────────────────────

server.registerTool(
  'get_tracker',
  {
    title: 'Get the tracker',
    description:
      'The long-horizon tracker as markdown: items with codes, statuses, next actions, domains, due dates, plus the parking lot and decision log. Use "compact" for a quick look, "working" (default) for normal questions, "full" for notes and reflections, "archive" to include done and dropped items.',
    inputSchema: { tier: z.enum(['compact', 'working', 'full', 'archive']).optional() },
  },
  async ({ tier }) => {
    const data = await call<{ markdown: string }>(`/tracker/export?tier=${tier ?? 'working'}`);
    return text(data.markdown);
  },
);

server.registerTool(
  'get_chronicle',
  {
    title: 'Get the activity log',
    description:
      'What actually happened recently, grouped by day: quests completed, tracker items moved or dropped, check-ins, journal entries, calendar syncs. Use this for questions about patterns, pace or "why did this week go the way it did".',
    inputSchema: { days: z.number().int().min(1).max(90).optional() },
  },
  async ({ days }) => {
    const data = await call<{ markdown: string }>(`/chronicle/log/markdown?days=${days ?? 7}&tz=0`);
    return text(data.markdown);
  },
);

server.registerTool(
  'get_permafile',
  {
    title: 'Get the permafile',
    description:
      "The user's slow-changing context: who they are, their goals, standing commitments, their own rules, and rules for how an AI should talk to them. Read this before advising them, and follow its rules over your defaults.",
    inputSchema: {},
  },
  async () => {
    const data = await call<{ body: string; isTemplate: boolean }>('/chronicle/permafile');
    return text(data.isTemplate ? `(Not filled in yet — this is the starter template.)\n\n${data.body}` : data.body);
  },
);

server.registerTool(
  'get_context_bundle',
  {
    title: 'Get everything at once',
    description:
      'Permafile, tracker and chronicle in one document. Prefer this when the question is broad ("how am I doing?", "write my weekly review") instead of calling the three separately.',
    inputSchema: { days: z.number().int().min(1).max(90).optional() },
  },
  async ({ days }) => {
    const data = await call<{ markdown: string }>(`/chronicle/bundle?days=${days ?? 14}&tz=0`);
    return text(data.markdown);
  },
);

server.registerTool(
  'get_schedule',
  {
    title: 'Get the planned day',
    description:
      'The current generated schedule: work blocks with times and quest names, breaks, and fixed blocks from connected calendars. Read-only — it never regenerates the plan.',
    inputSchema: {},
  },
  async () => {
    const data = await call<unknown>('/schedule/me');
    return json(data);
  },
);

server.registerTool(
  'get_quests',
  {
    title: 'Get active quests',
    description: 'Active quests with deadlines, estimated minutes, tags and sub-quest counts.',
    inputSchema: {},
  },
  async () => json(await call<unknown>('/quests')),
);

// ─── Write (additive and reversible only) ─────────────────────────────────────

server.registerTool(
  'add_to_parking_lot',
  {
    title: 'Park an idea',
    description:
      'Capture something without committing to it. This is the right place for anything you pulled from another source (an email, a Teams message, a calendar invite) — it lands in the parking lot for the user to triage, never in their active list.',
    inputSchema: { text: z.string().min(1).max(2000) },
  },
  async ({ text: t }) => {
    await call('/tracker/parking-lot', { method: 'POST', body: JSON.stringify({ text: t }) });
    return text(`Parked: ${t}`);
  },
);

server.registerTool(
  'append_journal',
  {
    title: 'Write in the journal',
    description:
      'Append a line to the chronicle. Use it to record something the user told you that belongs in their history, not to narrate your own actions.',
    inputSchema: { text: z.string().min(1).max(2000) },
  },
  async ({ text: t }) => {
    await call('/chronicle/journal', { method: 'POST', body: JSON.stringify({ text: t }) });
    return text('Written to the journal.');
  },
);

server.registerTool(
  'log_decision',
  {
    title: 'Record a decision',
    description:
      'Append to the append-only decision log: what was decided and why. Use it when the user settles something that their future self will want the reasoning for.',
    inputSchema: { text: z.string().min(1).max(4000) },
  },
  async ({ text: t }) => {
    await call('/tracker/decisions', { method: 'POST', body: JSON.stringify({ text: t }) });
    return text('Decision recorded.');
  },
);

server.registerTool(
  'update_permafile',
  {
    title: 'Update the permafile',
    description:
      'Replace the whole permafile. Always call get_permafile first and send the full edited text, never a fragment — this overwrites. Every save is versioned and the user can restore an earlier one, but ask them before rewriting their own words.',
    inputSchema: { body: z.string().max(20_000) },
  },
  async ({ body }) => {
    const data = await call<{ changed: boolean }>('/chronicle/permafile', {
      method: 'PUT',
      body: JSON.stringify({ body }),
    });
    return text(data.changed ? 'Permafile saved as a new version.' : 'No change — the text was identical.');
  },
);

await server.connect(new StdioServerTransport());
