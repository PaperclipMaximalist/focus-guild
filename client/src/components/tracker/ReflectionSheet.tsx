/**
 * Reflections on a CAS item.
 *
 * Media is a URL field only — no upload pipeline. A reflection's evidence is
 * usually already hosted somewhere (a photo album, a doc, a video), and
 * building storage for it would be a far bigger feature than the reflection
 * itself.
 *
 * Outcome tags matter beyond this sheet: the coverage matrix counts an outcome
 * as evidenced if either the item or any of its reflections tags it.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LEARNING_OUTCOMES, type TrackerItem } from '../../lib/api';
import { useTrackerStore } from '../../store/useTrackerStore';
import { useToastStore } from '../Toasts';
import { Sheet, Label, fieldClass, fieldStyle } from './Sheet';
import { sfxXp } from '../../lib/sfx';
import { ExternalLink, TriangleAlert } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  item: TrackerItem | null;
}

export function ReflectionSheet({ open, onClose, item }: Props) {
  const { addReflection, deleteReflection } = useTrackerStore();
  const pushToast = useToastStore((s) => s.push);
  const [text, setText] = useState('');
  const [loTags, setLoTags] = useState<number[]>([]);
  const [mediaUrl, setMediaUrl] = useState('');
  const [busy, setBusy] = useState(false);

  if (!item) return null;

  const submit = async () => {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    try {
      await addReflection(item.id, {
        text: value,
        loTags: [...loTags].sort((a, b) => a - b),
        mediaUrl: mediaUrl.trim() || null,
      });
      setText('');
      setLoTags([]);
      setMediaUrl('');
      sfxXp();
    } catch (err) {
      pushToast({ title: 'Could not save', sub: String(err), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Reflections · ${item.code}`}
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={busy || !text.trim()}
          className="w-full rounded-xl py-3 text-sm font-bold disabled:opacity-40"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          {busy ? 'Saving…' : 'Add reflection'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {item.title}
        </p>

        <div>
          <Label>Reflection</Label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="What happened, what you noticed, what you'd do differently…"
            className={`${fieldClass} resize-y`}
            style={fieldStyle}
          />
        </div>

        <div>
          <Label hint="Counts toward coverage even if the item itself isn't tagged.">
            Learning outcomes evidenced
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {LEARNING_OUTCOMES.map((lo) => (
              <button
                key={lo}
                type="button"
                onClick={() =>
                  setLoTags((prev) => (prev.includes(lo) ? prev.filter((v) => v !== lo) : [...prev, lo]))
                }
                className="h-9 w-9 rounded-lg text-xs font-bold"
                style={{
                  background: loTags.includes(lo) ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                  color: loTags.includes(lo) ? '#fff' : 'var(--color-muted)',
                }}
              >
                {lo}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label hint="A link to evidence hosted elsewhere. Nothing is uploaded.">Media URL</Label>
          <input
            type="url"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://…"
            className={fieldClass}
            style={fieldStyle}
          />
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
            {item.reflections.length} recorded
          </h3>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {item.reflections.map((r) => (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border p-3"
                  style={{ borderColor: 'var(--color-border)', background: 'rgba(255,255,255,0.03)' }}
                >
                  <p className="whitespace-pre-wrap text-sm leading-snug">{r.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs" style={{ color: 'var(--color-muted)' }}>
                    <span>{new Date(r.date).toLocaleDateString()}</span>
                    {r.loTags.map((lo) => (
                      <span
                        key={lo}
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                        style={{ background: 'rgba(139,92,246,0.2)', color: 'var(--color-primary)' }}
                      >
                        LO{lo}
                      </span>
                    ))}
                    {r.mediaUrl && (
                      <a
                        href={r.mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                        style={{ color: 'var(--color-teal)' }}
                      >
                        <span className="inline-flex items-center gap-1.5"><ExternalLink size={11} aria-hidden /> evidence</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteReflection(item.id, r.id)}
                      className="ml-auto underline"
                    >
                      delete
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </Sheet>
  );
}
