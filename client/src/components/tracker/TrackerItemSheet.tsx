/**
 * Create / edit one tracker item.
 *
 * The next action sits above the title in the form for the same reason it does
 * on the card: it is the field that decides whether the item is workable.
 *
 * Item codes are assigned by the server and never editable here. When the user
 * has configured more than one code prefix, the prefix becomes a choice on
 * create only — the number after it is still the server's to hand out.
 */

import { useEffect, useState } from 'react';
import {
  ApiRequestError,
  CAS_STRANDS,
  LEARNING_OUTCOMES,
  type CasStrand,
  type TrackerConfigShape,
  type TrackerDomain,
  type TrackerItem,
  type TrackerItemCreate,
  type TrackerStatus,
} from '../../lib/api';
import { useTrackerStore } from '../../store/useTrackerStore';
import { useToastStore } from '../Toasts';
import { Sheet, Label, fieldClass, fieldStyle } from './Sheet';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Present ⇒ edit mode. */
  editing: TrackerItem | null;
  config: TrackerConfigShape;
  domains: TrackerDomain[];
  /** Pre-tag a new item with a strand when created from the CAS lens. */
  defaultCas?: boolean;
}

const STRAND_LABEL: Record<CasStrand, string> = {
  creativity: 'Creativity',
  activity: 'Activity',
  service: 'Service',
};

/** `<input type="date">` wants YYYY-MM-DD in local time, not an ISO instant. */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Midday local, so a timezone shift can't roll the date onto the day before. */
function fromDateInput(value: string): string | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0).toISOString();
}

export function TrackerItemSheet({ open, onClose, editing, config, domains, defaultCas }: Props) {
  const { createItem, updateItem } = useTrackerStore();
  const pushToast = useToastStore((s) => s.push);

  const [title, setTitle] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [domainId, setDomainId] = useState('');
  const [status, setStatus] = useState<TrackerStatus>('TODO');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [codePrefix, setCodePrefix] = useState(config.codePrefixes[0] ?? 'A');

  const [strands, setStrands] = useState<CasStrand[]>([]);
  const [outcomes, setOutcomes] = useState<number[]>([]);
  const [courseworkLinked, setCourseworkLinked] = useState(false);
  const [casStart, setCasStart] = useState('');
  const [casEnd, setCasEnd] = useState('');
  const [isProject, setIsProject] = useState(false);
  const [hours, setHours] = useState('');

  const [casOpen, setCasOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset the form each time the sheet opens, from the item being edited.
  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? '');
    setNextAction(editing?.nextAction ?? '');
    setDomainId(editing?.domainId ?? '');
    setStatus(editing?.status ?? 'TODO');
    setDueDate(toDateInput(editing?.dueDate ?? null));
    setNotes(editing?.notes ?? '');
    setCodePrefix(config.codePrefixes[0] ?? 'A');
    setStrands(editing?.casStrands ?? []);
    setOutcomes(editing?.learningOutcomes ?? []);
    setCourseworkLinked(editing?.isCourseworkLinked ?? false);
    setCasStart(toDateInput(editing?.casStartDate ?? null));
    setCasEnd(toDateInput(editing?.casEndDate ?? null));
    setIsProject(editing?.isCasProject ?? false);
    setHours(editing?.hours != null ? String(editing.hours) : '');
    setCasOpen(Boolean(defaultCas) || (editing?.casStrands.length ?? 0) > 0);
  }, [open, editing, config.codePrefixes, defaultCas]);

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const payload: TrackerItemCreate = {
      title: title.trim(),
      domainId: domainId || null,
      status,
      nextAction: nextAction.trim() || null,
      notes: notes.trim() || null,
      dueDate: fromDateInput(dueDate),
      casStrands: strands,
      learningOutcomes: [...outcomes].sort((a, b) => a - b),
      isCourseworkLinked: courseworkLinked,
      casStartDate: fromDateInput(casStart),
      casEndDate: fromDateInput(casEnd),
      isCasProject: isProject,
      hours: hours.trim() ? Number(hours) : null,
    };

    try {
      if (editing) {
        await updateItem(editing.id, payload);
      } else {
        await createItem({ ...payload, codePrefix });
      }
      onClose();
    } catch (err) {
      const known = err instanceof ApiRequestError;
      pushToast({
        title:
          known && err.code === 'ACTIVE_CAP_REACHED'
            ? 'Active cap reached'
            : known && err.code === 'NEXT_ACTION_REQUIRED'
              ? 'Needs a next action'
              : 'That did not save',
        sub: known ? err.detail : String(err),
        icon: known && err.code === 'ACTIVE_CAP_REACHED' ? '🧱' : '⚠️',
        variant: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.code}` : 'New item'}
      footer={
        <button
          type="button"
          onClick={save}
          disabled={busy || !title.trim()}
          className="w-full rounded-xl py-3 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create item'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label hint="A physical first step, not a topic.">Next action</Label>
          <input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="Open the doc and write the first paragraph"
            className={fieldClass}
            style={fieldStyle}
          />
        </div>

        <div>
          <Label>Title</Label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Extended essay"
            className={fieldClass}
            style={fieldStyle}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TrackerStatus)}
              className={fieldClass}
              style={fieldStyle}
            >
              {(Object.keys(config.statusLabels) as TrackerStatus[]).map((s) => (
                <option key={s} value={s}>
                  {config.statusLabels[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Due</Label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={fieldClass}
              style={fieldStyle}
            />
          </div>
        </div>

        <div>
          <Label>Domain</Label>
          <select
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          >
            <option value="">Unsorted</option>
            {domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {!editing && config.codePrefixes.length > 1 && (
          <div>
            <Label hint="The number after it is assigned for you.">Code prefix</Label>
            <div className="flex flex-wrap gap-2">
              {config.codePrefixes.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCodePrefix(p)}
                  className="rounded-full px-3 py-1.5 font-mono text-xs font-bold"
                  style={{
                    background: codePrefix === p ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                    color: codePrefix === p ? '#fff' : 'var(--color-muted)',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>Notes</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${fieldClass} resize-y`}
            style={fieldStyle}
          />
        </div>

        {/* CAS is collapsed by default — most items are not CAS items. */}
        <div className="rounded-lg border" style={{ borderColor: 'var(--color-border)' }}>
          <button
            type="button"
            onClick={() => setCasOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold"
          >
            <span>
              CAS
              {strands.length > 0 && (
                <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-green)' }}>
                  {strands.length} strand{strands.length > 1 ? 's' : ''} · exempt from the cap
                </span>
              )}
            </span>
            <span style={{ color: 'var(--color-muted)' }}>{casOpen ? '▾' : '▸'}</span>
          </button>

          {casOpen && (
            <div className="flex flex-col gap-4 border-t px-3 py-3" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <Label hint="Tagging any strand exempts this item from the active cap.">Strands</Label>
                <div className="flex flex-wrap gap-2">
                  {CAS_STRANDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStrands((prev) => toggle(prev, s))}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold"
                      style={{
                        background: strands.includes(s) ? 'var(--color-green)' : 'rgba(255,255,255,0.06)',
                        color: strands.includes(s) ? '#04210f' : 'var(--color-muted)',
                      }}
                    >
                      {STRAND_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label hint="Reflections can evidence outcomes too.">Learning outcomes</Label>
                <div className="flex flex-wrap gap-1.5">
                  {LEARNING_OUTCOMES.map((lo) => (
                    <button
                      key={lo}
                      type="button"
                      onClick={() => setOutcomes((prev) => toggle(prev, lo))}
                      className="h-9 w-9 rounded-lg text-xs font-bold"
                      style={{
                        background: outcomes.includes(lo) ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                        color: outcomes.includes(lo) ? '#fff' : 'var(--color-muted)',
                      }}
                    >
                      {lo}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Started</Label>
                  <input
                    type="date"
                    value={casStart}
                    onChange={(e) => setCasStart(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <Label>Ended</Label>
                  <input
                    type="date"
                    value={casEnd}
                    onChange={(e) => setCasEnd(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>
              </div>

              {config.showHours && (
                <div>
                  <Label>Hours</Label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </div>
              )}

              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={isProject}
                  onChange={(e) => setIsProject(e.target.checked)}
                  className="h-5 w-5"
                />
                CAS project
              </label>

              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={courseworkLinked}
                  onChange={(e) => setCourseworkLinked(e.target.checked)}
                  className="h-5 w-5"
                />
                Linked to DP coursework
              </label>

              {courseworkLinked && strands.length > 0 && (
                <p className="text-xs leading-snug" style={{ color: '#fca5a5' }}>
                  CAS may not double-count with coursework. This saves fine, but the item will be
                  flagged until you resolve one side.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
