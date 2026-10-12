/**
 * Advanced: the things you set up once and then leave alone.
 *
 * Nothing here is needed to use the Guild day to day, which is why it sits at
 * the foot of Settings and not in the navigation. A page added here should be
 * one row: an icon, what it is called, and what it is for in a line.
 */

import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Bot, ChevronRight, Plug, Rocket, ScrollText } from 'lucide-react';

const ROWS: Array<{ to: string; icon: LucideIcon; title: string; sub: string }> = [
  {
    to: '/advanced/quickstart',
    icon: Rocket,
    title: 'Quickstart',
    sub: 'Connect Google Calendar, and bring in a whole list of quests at once',
  },
  {
    to: '/advanced/ai',
    icon: Bot,
    title: 'Your AI',
    sub: 'Plug in Claude, ChatGPT, Gemini or another AI with your own API key',
  },
  {
    to: '/connections',
    icon: Plug,
    title: 'Connections',
    sub: 'Outlook, iCloud and other calendars, and an inbox for Teams, phone shortcuts and other apps',
  },
  {
    to: '/advanced/records',
    icon: ScrollText,
    title: 'Records and AI',
    sub: 'Activity log, permafile, Ask the Guild, AI bundle',
  },
];

export default function Advanced() {
  return (
    <div className="page flex flex-col gap-5">
      <header>
        <Link to="/settings" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-(--color-muted) hover:text-(--color-text)">
          <ArrowLeft size={14} aria-hidden /> Settings
        </Link>
        <h1 className="page-title">Advanced</h1>
        <p className="mt-1.5 text-sm text-(--color-muted)">Set these up once. The Guild works without any of them.</p>
      </header>

      <nav className="panel rows overflow-hidden" aria-label="Advanced">
        {ROWS.map((row) => (
          <Link key={row.to} to={row.to} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-(--color-surface2)">
            <row.icon size={18} aria-hidden className="shrink-0 text-(--color-muted)" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{row.title}</span>
              <span className="block text-[13px] leading-snug text-(--color-muted)">{row.sub}</span>
            </span>
            <ChevronRight size={16} aria-hidden className="shrink-0 text-(--color-muted)" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
