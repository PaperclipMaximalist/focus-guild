/**
 * The steps of a quest, as a dropdown.
 *
 * A quest opens to show its steps; a step that has steps of its own opens the
 * same way. Three tiers in all (main quest, step, sub-step: MAX_QUEST_DEPTH),
 * and every one of them counts towards the main quest's total.
 *
 * Used in two places with the same behaviour: under a quest's row in a list
 * (the chevron on the row opens it) and inside the quest's detail sheet.
 *
 * How it is meant to feel:
 *   - Closed by default, at every tier. A list of quests stays a list of
 *     quests; you open the one you are working on.
 *   - A step is a tick, its name, and a count if it has steps of its own.
 *     Nothing else is on the row until you reach for it.
 *   - Adding a step is typing a line and pressing Enter, and the field stays
 *     put so three steps are three lines.
 *   - The bottom tier does not offer "add a step": the limit is never
 *     something you find by hitting an error.
 *   - Ticking a step that still has open steps under it closes those too, so
 *     it asks once, in place, by changing what the row says.
 */

import { useCallback, useEffect, useState } from 'react';
import { MAX_QUEST_DEPTH, api, type Quest, type QuestNode, type QuestRollup } from '../lib/api';
import { useQuestStore } from '../store/useQuestStore';
import { useUserStore } from '../store/useUserStore';
import { useToastStore } from './Toasts';
import { useArmed } from '../lib/useArmed';
import { formatMinutes } from '../lib/formatters';
import { Check, ChevronDown, ChevronRight, CornerDownRight, Plus, Star, TriangleAlert, X } from 'lucide-react';

interface Props {
  /** The quest whose steps these are. */
  quest: Pick<Quest, 'id' | 'mentalLoad' | 'impact' | 'category' | 'tags'>;
  /** Called after anything changes, so a list showing counts can refresh. */
  onChanged?: () => void;
  /** Change it to make the list read the tree again (steps added from outside). */
  reloadKey?: number;
}

/** How long a deleted step can still be brought back; matches the quest store's Undo. */
const UNDO_MS = 5500;

export function SubQuestList({ quest, onChanged, reloadKey = 0 }: Props) {
  const { complete, removeWithUndo } = useQuestStore();
  const applyXPGain = useUserStore((s) => s.applyXPGain);
  const pushToast = useToastStore((s) => s.push);
  const { armed, fire } = useArmed();

  const [tree, setTree] = useState<QuestNode[] | null>(null);
  const [rollup, setRollup] = useState<QuestRollup | undefined>();
  const [failed, setFailed] = useState(false);
  /** Steps whose own steps are showing. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  /** The step whose "add a sub-step" field is showing. */
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  /** Ticked or deleted a moment ago: shown that way before the server answers. */
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const fetched = await api.quests.subquests(quest.id);
      setTree(fetched.subQuests);
      setRollup(fetched.rollup);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [quest.id]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const changed = async () => {
    await load();
    onChanged?.();
  };

  const add = async (parentId: string, title: string) => {
    try {
      await api.quests.create({
        title,
        estimatedMinutes: 30,
        // A step is part of the same job: it starts with the quest's own settings.
        mentalLoad: quest.mentalLoad,
        impact: quest.impact,
        parentQuestId: parentId,
        category: quest.category ?? undefined,
        tags: quest.tags ?? [],
      });
      if (parentId !== quest.id) setOpen((prev) => new Set(prev).add(parentId));
      await changed();
    } catch (err) {
      const msg = String(err);
      pushToast({
        icon: TriangleAlert,
        title: msg.includes('MAX_DEPTH') ? `Steps stop at ${MAX_QUEST_DEPTH} tiers` : "Couldn't add the step",
        sub: msg.includes('MAX_DEPTH') ? 'Add this one beside the last instead.' : 'Nothing was added. Try again.',
        variant: 'error',
      });
    }
  };

  const tick = (node: QuestNode) => {
    const openBelow = node.rollup.total - node.rollup.done;
    const run = async () => {
      setTicked((prev) => new Set(prev).add(node.id));
      try {
        const result = await complete(node.id);
        applyXPGain(result.totalXP, result.newStreak, result.newMultiplier);
        pushToast({
          icon: Star,
          title: `+${result.xpAwarded} XP`,
          sub: result.closedSubQuests ? `Step complete, with ${result.closedSubQuests} under it` : 'Step complete',
          variant: 'xp',
        });
        await changed();
      } catch {
        pushToast({ icon: TriangleAlert, title: "Couldn't complete it", sub: 'The tick was taken back.', variant: 'error' });
      } finally {
        setTicked((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        });
      }
    };
    // Open steps underneath would be closed with it: say so, and wait for a second tap.
    if (openBelow > 0) fire(`tick:${node.id}`, run);
    else void run();
  };

  const remove = (node: QuestNode) => {
    setGone((prev) => new Set(prev).add(node.id));
    removeWithUndo(node.id, {
      onUndo: () =>
        setGone((prev) => {
          const next = new Set(prev);
          next.delete(node.id);
          return next;
        }),
    });
    // The store deletes once the Undo has lapsed; read the totals again after that.
    setTimeout(() => void changed(), UNDO_MS + 800);
  };

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (failed) {
    return (
      <p className="py-2 text-[13px] text-(--color-muted)">
        The steps didn't load.{' '}
        <button type="button" onClick={() => void load()} className="font-semibold text-(--color-text) underline underline-offset-2">
          Try again
        </button>
      </p>
    );
  }

  if (!tree) {
    return (
      <div className="flex flex-col gap-2 py-1" aria-busy="true" aria-label="Loading steps">
        <div className="skeleton h-5 w-3/5" />
        <div className="skeleton h-5 w-2/5" />
      </div>
    );
  }

  const shown = tree.filter((n) => !gone.has(n.id));
  const left = Math.max(0, (rollup?.estimatedMinutes ?? 0) - (rollup?.doneMinutes ?? 0));

  return (
    <div>
      {rollup && rollup.total > 0 && (
        <p className="mb-1.5 text-[12px] text-(--color-muted)">
          <span className="tnum font-semibold text-(--color-text)">
            {rollup.done}/{rollup.total}
          </span>{' '}
          steps complete
          {left > 0 && (
            <>
              {' · '}
              <span className="tnum">{formatMinutes(left)}</span> left
            </>
          )}
        </p>
      )}

      <ul className="flex flex-col">
        {shown.map((node) => (
          <Step
            key={node.id}
            node={node}
            open={open}
            gone={gone}
            ticked={ticked}
            armed={armed}
            addingUnder={addingUnder}
            onToggle={toggle}
            onTick={tick}
            onRemove={remove}
            onAdd={add}
            onSetAdding={setAddingUnder}
          />
        ))}
      </ul>

      <AddStep
        placeholder={shown.length ? 'Add another step' : 'Add a first step'}
        onSubmit={(title) => add(quest.id, title)}
      />
    </div>
  );
}

interface StepProps {
  node: QuestNode;
  open: Set<string>;
  gone: Set<string>;
  ticked: Set<string>;
  armed: string | null;
  addingUnder: string | null;
  onToggle: (id: string) => void;
  onTick: (node: QuestNode) => void;
  onRemove: (node: QuestNode) => void;
  onAdd: (parentId: string, title: string) => Promise<void>;
  onSetAdding: (id: string | null) => void;
}

function Step(props: StepProps) {
  const { node, open, gone, ticked, armed, addingUnder, onToggle, onTick, onRemove, onAdd, onSetAdding } = props;
  const done = node.status === 'COMPLETE' || ticked.has(node.id);
  const kids = node.subQuests.filter((k) => !gone.has(k.id));
  const isOpen = open.has(node.id);
  const adding = addingUnder === node.id;
  const waiting = armed === `tick:${node.id}`;
  const openBelow = node.rollup.total - node.rollup.done;
  const canNest = node.rollup.canNest && !done;

  return (
    <li>
      <div className="group/step flex min-h-9 items-center gap-2 py-1">
        <button
          type="button"
          onClick={() => !done && onTick(node)}
          disabled={done}
          aria-label={`Complete ${node.title}`}
          aria-pressed={done}
          className={`quest-check grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors ${done ? 'is-done' : ''}`}
          style={
            done
              ? { borderColor: 'var(--color-green)', background: 'var(--color-green)', color: 'var(--color-on-primary)' }
              : { borderColor: waiting ? 'var(--color-gold)' : 'var(--color-border-strong)', color: 'var(--color-green)' }
          }
        >
          <Check size={11} strokeWidth={3.5} className={done ? '' : 'opacity-0 transition-opacity'} aria-hidden />
        </button>

        {/* A step with steps of its own is itself a dropdown: its name opens it. */}
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={isOpen}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <StepTitle title={node.title} done={done} />
            <span className="tnum shrink-0 text-[12px] text-(--color-muted)">
              {node.rollup.done}/{node.rollup.total}
            </span>
            {isOpen ? (
              <ChevronDown size={14} className="shrink-0 text-(--color-muted)" aria-hidden />
            ) : (
              <ChevronRight size={14} className="shrink-0 text-(--color-muted)" aria-hidden />
            )}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center">
            <StepTitle title={node.title} done={done} />
          </span>
        )}

        {waiting ? (
          <span className="shrink-0 text-[12px] font-semibold" style={{ color: 'var(--color-gold)' }}>
            Closes {openBelow} under it. Tap again
          </span>
        ) : (
          <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/step:opacity-100 group-focus-within/step:opacity-100 [@media(hover:none)]:opacity-70">
            {canNest && (
              <button
                type="button"
                onClick={() => onSetAdding(adding ? null : node.id)}
                title="Add a step under this"
                aria-label={`Add a step under ${node.title}`}
                aria-expanded={adding}
                className="icon-btn h-7 w-7"
              >
                <Plus size={14} aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(node)}
              title="Delete"
              aria-label={`Delete ${node.title}`}
              className="icon-btn h-7 w-7"
            >
              <X size={14} aria-hidden />
            </button>
          </span>
        )}
      </div>

      {(adding || (isOpen && kids.length > 0)) && (
        // One hairline down the side says "these belong to the step above".
        <div className="mb-1 ml-[8px] border-l border-(--color-border-strong) pl-[17px]">
          {isOpen && (
            <ul className="flex flex-col">
              {kids.map((kid) => (
                <Step {...props} key={kid.id} node={kid} />
              ))}
            </ul>
          )}
          {adding && (
            <AddStep
              autoFocus
              placeholder={`A step under "${node.title}"`}
              onSubmit={(title) => onAdd(node.id, title)}
              onCancel={() => onSetAdding(null)}
            />
          )}
        </div>
      )}
    </li>
  );
}

function StepTitle({ title, done }: { title: string; done: boolean }) {
  return (
    <span
      className="min-w-0 text-[14px] leading-snug [overflow-wrap:anywhere]"
      style={done ? { color: 'var(--color-muted)', textDecoration: 'line-through' } : undefined}
    >
      {title}
    </span>
  );
}

/** One line, Enter to add, and it stays open so the next step is the next line. */
function AddStep({
  placeholder,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  placeholder: string;
  onSubmit: (title: string) => Promise<void>;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    setTitle('');
    try {
      await onSubmit(value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 py-1">
      <CornerDownRight size={15} className="ml-px shrink-0 text-(--color-muted)" aria-hidden />
      <input
        type="text"
        value={title}
        // Only where a step's own "+" was just pressed: the keyboard is expected there.
        autoFocus={autoFocus}
        maxLength={280}
        enterKeyHint="done"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          }
          if (e.key === 'Escape' && onCancel) {
            e.stopPropagation();
            onCancel();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 border-b border-(--color-border-strong) bg-transparent py-1 text-[14px] outline-none placeholder:text-(--color-muted) focus:border-(--color-primary)"
      />
      {title.trim() && (
        <button type="button" onClick={() => void commit()} disabled={busy} className="btn-quiet h-7 min-h-0 px-2.5 text-xs">
          Add
        </button>
      )}
    </div>
  );
}
