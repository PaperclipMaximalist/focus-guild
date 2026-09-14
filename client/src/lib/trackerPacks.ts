/**
 * Preset packs and new-item templates.
 *
 * A pack is a complete preset set plus the domains it expects. Applying one
 * loads the settings into the Presets draft for review (nothing is saved until
 * Save) and creates any domains that don't exist yet. It never deletes or
 * renames existing domains, the same "absent ≠ clear" rule as markdown import.
 *
 * Templates prefill the new-item sheet. They name domains, not ids, and only
 * apply a domain or prefix that the user actually has.
 */

import type { CasStrand, TrackerConfigShape, TrackerStatus } from './api';

export interface PresetPack {
  id: string;
  name: string;
  blurb: string;
  config: TrackerConfigShape;
  domains: Array<{ name: string; color: string }>;
}

const DECISIVE_PROMPTS = [
  "What's in play that didn't move this week? Shrink its next step or let it go.",
  'Who am I waiting on, and do I need to nudge them?',
  "What's due in the next 14 days that isn't scheduled as a quest yet?",
  'Which parking-lot idea earns a slot, and what gets let go to make room?',
];

export const PRESET_PACKS: PresetPack[] = [
  {
    id: 'ib-guild',
    name: 'IB Guild',
    blurb: 'DP student with ADHD. Three fronts at once, every item has a home, reviews that force a decision.',
    config: {
      activeCap: 3,
      statusLabels: { TODO: 'Queued', ACTIVE: 'In play', BLOCKED: 'Waiting on', DONE: 'Done', DROPPED: 'Let go' },
      codePrefixes: ['A', 'E', 'C', 'U', 'P'],
      requiredFields: { nextActionForActive: true, domain: true, dueDate: false },
      reviewCadenceDays: 7,
      reviewPrompts: [...DECISIVE_PROMPTS, "Which CAS strand hasn't been touched in 3+ weeks?"],
      showHours: false,
    },
    domains: [
      { name: 'Academics', color: '#3987E5' },
      { name: 'EE & IAs', color: '#9085E9' },
      { name: 'CAS', color: '#199E70' },
      { name: 'University', color: '#C98500' },
      { name: 'Personal & Health', color: '#D55181' },
    ],
  },
  {
    id: 'minimal',
    name: 'Bad-week minimal',
    blurb: 'Two fronts, no required fields, a short review every few days. For when everything is too much.',
    config: {
      activeCap: 2,
      statusLabels: { TODO: 'Later', ACTIVE: 'Now', BLOCKED: 'Stuck', DONE: 'Done', DROPPED: 'Let go' },
      codePrefixes: ['A'],
      requiredFields: { nextActionForActive: true, domain: false, dueDate: false },
      reviewCadenceDays: 3,
      reviewPrompts: ['What is the one thing that matters most right now?', 'What can I let go of today?'],
      showHours: false,
    },
    domains: [
      { name: 'Must', color: '#D95926' },
      { name: 'Everything else', color: '#3987E5' },
    ],
  },
  {
    id: 'projects',
    name: 'Projects & work',
    blurb: 'Four fronts, dates required, waiting-on tracked. For jobs, clubs and side projects.',
    config: {
      activeCap: 4,
      statusLabels: { TODO: 'Backlog', ACTIVE: 'In progress', BLOCKED: 'Waiting on', DONE: 'Shipped', DROPPED: 'Cut' },
      codePrefixes: ['W', 'P'],
      requiredFields: { nextActionForActive: true, domain: true, dueDate: true },
      reviewCadenceDays: 7,
      reviewPrompts: DECISIVE_PROMPTS,
      showHours: true,
    },
    domains: [
      { name: 'Work', color: '#3987E5' },
      { name: 'Side projects', color: '#199E70' },
      { name: 'Admin', color: '#C98500' },
    ],
  },
];

export interface ItemTemplate {
  id: string;
  label: string;
  /** Tried in order, case-insensitively; the first the user has wins. */
  domains: string[];
  prefix?: string;
  title?: string;
  nextAction?: string;
  status?: TrackerStatus;
  casStrands?: CasStrand[];
  isCasProject?: boolean;
  courseworkLinked?: boolean;
  /** Start the CAS start date at today. */
  casStartToday?: boolean;
  /** Put the cursor in the due-date field. */
  focusDue?: boolean;
}

export const ITEM_TEMPLATES: ItemTemplate[] = [
  {
    id: 'draft',
    label: 'Essay / IA draft',
    domains: ['EE & IAs', 'Academics'],
    prefix: 'E',
    nextAction: 'Open the doc and write one ugly paragraph',
    courseworkLinked: true,
  },
  {
    id: 'study',
    label: 'Study for a test',
    domains: ['Academics'],
    prefix: 'A',
    title: 'Test: ',
    nextAction: 'Make a list of the topics it covers',
    focusDue: true,
  },
  {
    id: 'cas',
    label: 'CAS experience',
    domains: ['CAS'],
    prefix: 'C',
    nextAction: 'Message the organiser to confirm a first date',
    casStrands: [],
    casStartToday: true,
  },
  {
    id: 'cas-project',
    label: 'CAS project',
    domains: ['CAS'],
    prefix: 'C',
    nextAction: 'Write down who else is involved and message one of them',
    casStrands: [],
    isCasProject: true,
    casStartToday: true,
  },
  {
    id: 'application',
    label: 'Application',
    domains: ['University', 'Work'],
    prefix: 'U',
    nextAction: 'Open the portal and list every document it asks for',
    focusDue: true,
  },
  {
    id: 'waiting',
    label: 'Waiting on someone',
    domains: [],
    status: 'BLOCKED',
    nextAction: 'Nudge ___ about ___',
  },
];
