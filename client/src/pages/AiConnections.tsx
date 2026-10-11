/**
 * Your AI: plug in an AI you already have an account with.
 *
 * The Guild has three things an AI does: break a quest into steps, answer
 * "Ask the Guild", and turn notes into a quest list. They run on whichever AI
 * is connected here, with the person's own API key, so the choice of AI and
 * the bill are theirs.
 *
 * How it is meant to feel: one row per AI people have heard of, by the name
 * they know it by. Opening a row says where to get a key and takes it.
 * Connecting checks the key with the provider before anything is stored, picks
 * a model from what that account actually offers, and then asks the AI one
 * tiny question so "Connected" means key, model and billing all work. The key
 * is sealed on the server and never shown again; what is shown is its last
 * four characters.
 *
 * Server: routes/ai.ts (`lib/aiProviders.ts` for the providers, `lib/secretBox.ts`
 * for the sealing).
 */

import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { aiApi, type AiConnection, type AiProvider, type AiState, type AiTestResult } from '../lib/api';
import { MANIFEST_FONT } from '../lib/manifest';
import { sfxClick } from '../lib/sfx';
import { useArmed } from '../lib/useArmed';
import { useToastStore } from '../components/Toasts';
import { ArrowLeft, Bot, ChevronDown, ExternalLink, Trash2, TriangleAlert } from 'lucide-react';

const said = (err: unknown) => String(err).replace(/^\w*Error:\s*/, '').replace(/^[A-Z_]+:\s*/, '');

export default function AiConnections() {
  const [state, setState] = useState<AiState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  /** What each provider offers, once asked. */
  const [models, setModels] = useState<Record<string, string[]>>({});
  /** How the last check of each connection went, this visit. */
  const [tests, setTests] = useState<Record<string, AiTestResult | 'running'>>({});

  useEffect(() => {
    let live = true;
    aiApi
      .get()
      .then((s) => live && setState(s))
      .catch((err) => live && setError(said(err)));
    return () => {
      live = false;
    };
  }, []);

  const test = async (provider: string) => {
    setTests((t) => ({ ...t, [provider]: 'running' }));
    try {
      const result = await aiApi.test(provider);
      setTests((t) => ({ ...t, [provider]: result }));
    } catch (err) {
      setTests((t) => ({ ...t, [provider]: { ok: false, error: said(err), code: 'AI_ERROR', ms: 0 } }));
    }
  };

  const connected = (id: string) => state?.connections.find((c) => c.provider === id) ?? null;

  return (
    <div className="page flex flex-col gap-5">
      <header>
        <Link to="/advanced" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-(--color-muted) hover:text-(--color-text)">
          <ArrowLeft size={14} aria-hidden /> Advanced
        </Link>
        <h1 className="page-title">Your AI</h1>
        <p className="mt-1.5 text-sm text-(--color-muted)">
          Plug in an AI you have an account with. The Guild uses it to break a quest into steps, to answer Ask the
          Guild, and to turn your notes into a quest list.
        </p>
      </header>

      {error && (
        <p className="panel flex items-start gap-2 px-4 py-3 text-sm">
          <TriangleAlert size={15} aria-hidden className="mt-0.5 shrink-0 text-(--color-gold)" />
          Couldn’t load your AI connections. {error}
        </p>
      )}
      {!state && !error && <div className="skeleton h-96" aria-busy="true" aria-label="Loading" />}

      {state && (
        <>
          <p className="panel flex items-center gap-3 px-4 py-3 text-sm" aria-live="polite">
            <Bot size={18} aria-hidden className="shrink-0 text-(--color-muted)" />
            {state.inUse ? (
              <span>
                In use: <b>{state.inUse}</b>
              </span>
            ) : (
              <span>No AI is connected yet. Everything else in the Guild works without one.</span>
            )}
          </p>

          <ul className="panel rows overflow-hidden">
            {state.providers.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                connection={connected(p.id)}
                open={openId === p.id}
                onToggle={() => setOpenId((id) => (id === p.id ? null : p.id))}
                models={models[p.id]}
                test={tests[p.id]}
                onState={setState}
                onModels={(list) => setModels((m) => ({ ...m, [p.id]: list }))}
                onTest={() => test(p.id)}
              />
            ))}
          </ul>

          <div className="flex flex-col gap-1.5 text-[13px] leading-snug text-(--color-muted)">
            <p>
              A key is checked with its provider, sealed before it is stored, and never shown again. Each request the
              Guild makes is billed by the provider to your account: breaking a quest into steps costs a fraction of a
              cent, Ask the Guild a little more because it reads your recent history.
            </p>
            <p>
              What is sent: the quest you are breaking down, or your notes, or (for Ask the Guild) your permafile,
              tracker and recent journal. Nothing is sent until you press the button that asks.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function ProviderRow({
  provider: p, connection, open, onToggle, models, test, onState, onModels, onTest,
}: {
  provider: AiProvider;
  connection: AiConnection | null;
  open: boolean;
  onToggle: () => void;
  models: string[] | undefined;
  test: AiTestResult | 'running' | undefined;
  onState: (s: AiState) => void;
  onModels: (list: string[]) => void;
  onTest: () => void;
}) {
  const panelId = useId();
  const status = connection
    ? connection.inUse
      ? { word: 'In use', color: 'var(--color-green)' }
      : connection.lastError
        ? { word: 'Check', color: 'var(--color-gold)' }
        : { word: 'Connected', color: 'var(--color-text)' }
    : null;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-(--color-surface2)"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{p.name}</span>
          <span className="block truncate text-[13px] text-(--color-muted)">
            {connection ? <>{connection.model}{connection.keyHint && <> · key ending {connection.keyHint}</>}</> : p.tagline}
          </span>
        </span>
        {status && <span className="status" style={{ color: status.color }}>{status.word}</span>}
        <ChevronDown size={16} aria-hidden className="shrink-0 text-(--color-muted)" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms var(--ease)' }} />
      </button>
      {open && (
        <div id={panelId} className="border-t border-(--color-border) px-4 py-4">
          {connection ? (
            <Connected provider={p} connection={connection} models={models} test={test} onState={onState} onModels={onModels} onTest={onTest} />
          ) : (
            <Connect provider={p} onState={onState} onModels={onModels} onTest={onTest} />
          )}
        </div>
      )}
    </li>
  );
}

/** Not connected yet: where to get a key, and a place to put it. */
function Connect({
  provider: p, onState, onModels, onTest,
}: { provider: AiProvider; onState: (s: AiState) => void; onModels: (list: string[]) => void; onTest: () => void }) {
  const pushToast = useToastStore((s) => s.push);
  const keyId = useId();
  const urlId = useId();
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const ready = key.trim().length >= 8 && (!p.needsBaseUrl || baseUrl.trim().length >= 8);

  const connect = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await aiApi.connect(p.id, key.trim(), p.needsBaseUrl ? baseUrl.trim() : undefined);
      // The key leaves this page's memory the moment the server has it.
      setKey('');
      onModels(res.models);
      onState(res);
      sfxClick();
      pushToast({ title: `${p.name} connected`, sub: 'Asking it one question to be sure it answers', icon: Bot, variant: 'xp' });
      onTest();
    } catch (err) {
      setProblem(said(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="leading-relaxed text-(--color-muted)">{p.note}</p>
      {p.keyUrl && (
        <a href={p.keyUrl} target="_blank" rel="noopener noreferrer" className="btn-quiet self-start">
          Get a key from {p.company} <ExternalLink size={14} aria-hidden />
        </a>
      )}
      {p.needsBaseUrl && (
        <div>
          <label htmlFor={urlId} className="mb-1.5 block text-[13px] font-semibold">Address of its API</label>
          <input
            id={urlId}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.groq.com/openai/v1"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="form-input text-[13px]"
            style={{ fontFamily: MANIFEST_FONT }}
          />
        </div>
      )}
      <div>
        <label htmlFor={keyId} className="mb-1.5 block text-[13px] font-semibold">API key</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={keyId}
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
            placeholder="Paste the key"
            // Not a sign-in: keep password managers from offering to fill or save it.
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
            className="form-input min-w-0 flex-1 text-[13px]"
            style={{ fontFamily: MANIFEST_FONT }}
          />
          <button type="button" onClick={connect} disabled={!ready || busy} className="btn-primary shrink-0">
            {busy ? 'Checking the key…' : 'Connect'}
          </button>
        </div>
      </div>
      {problem && (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] leading-snug" style={{ color: 'var(--color-gold)' }}>
          <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
          {problem} Nothing was saved.
        </p>
      )}
    </div>
  );
}

/** Connected: which model, whether the Guild uses this one, a way to check it and a way out. */
function Connected({
  provider: p, connection, models, test, onState, onModels, onTest,
}: {
  provider: AiProvider;
  connection: AiConnection;
  models: string[] | undefined;
  test: AiTestResult | 'running' | undefined;
  onState: (s: AiState) => void;
  onModels: (list: string[]) => void;
  onTest: () => void;
}) {
  const pushToast = useToastStore((s) => s.push);
  const { armed, fire } = useArmed();
  const modelId = useId();
  const listId = useId();
  const [model, setModel] = useState(connection.model);
  const [busy, setBusy] = useState<string | null>(null);

  // What this provider offers, asked for once, the first time the row is opened.
  useEffect(() => {
    if (models !== undefined) return;
    let live = true;
    aiApi
      .models(p.id)
      .then((r) => live && onModels(r.models))
      .catch(() => live && onModels([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, models === undefined]);

  const run = async (what: string, work: () => Promise<AiState>, after?: () => void) => {
    setBusy(what);
    try {
      onState(await work());
      after?.();
    } catch (err) {
      pushToast({ title: 'That did not save', sub: said(err), icon: TriangleAlert, variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const saveModel = () => {
    const next = model.trim();
    if (!next || next === connection.model) return setModel(connection.model);
    run('model', () => aiApi.update(p.id, { model: next }), onTest);
  };

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <label htmlFor={modelId} className="mb-1.5 block text-[13px] font-semibold">Model</label>
        <input
          id={modelId}
          list={listId}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={saveModel}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={busy !== null}
          className="form-input text-[13px]"
            style={{ fontFamily: MANIFEST_FONT }}
        />
        <datalist id={listId}>
          {(models ?? []).map((m) => <option key={m} value={m} />)}
        </datalist>
        <p className="mt-1.5 text-[13px] leading-snug text-(--color-muted)">
          {models === undefined
            ? `Asking ${p.company} what this key can use…`
            : models.length > 0
              ? `${models.length} on offer for this key. Pick one from the list, or type a name.`
              : 'Type the model name exactly as the provider writes it.'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {connection.inUse ? (
          <span className="text-[13px] text-(--color-muted)">The Guild uses this one.</span>
        ) : (
          <button type="button" onClick={() => run('default', () => aiApi.update(p.id, { isDefault: true }))} disabled={busy !== null} className="btn-strong disabled:opacity-40">
            Use this one
          </button>
        )}
        <button type="button" onClick={onTest} disabled={test === 'running' || busy !== null} className="btn-quiet disabled:opacity-40">
          {test === 'running' ? 'Asking…' : 'Ask it something'}
        </button>
        <span className="flex-1" />
        <button type="button" onClick={() => fire(`remove-${p.id}`, () => run('remove', () => aiApi.remove(p.id)))} disabled={busy !== null} className="btn-quiet disabled:opacity-40" style={armed === `remove-${p.id}` ? { color: 'var(--color-fire)' } : undefined}>
          <Trash2 size={14} aria-hidden /> {armed === `remove-${p.id}` ? 'Tap again to remove' : 'Remove'}
        </button>
      </div>

      <TestLine test={test} connection={connection} />
    </div>
  );
}

function TestLine({ test, connection }: { test: AiTestResult | 'running' | undefined; connection: AiConnection }) {
  if (test === 'running') return <p className="text-[13px] text-(--color-muted)" aria-live="polite">Waiting for an answer…</p>;
  if (test?.ok) {
    return (
      <p className="text-[13px]" aria-live="polite" style={{ color: 'var(--color-green)' }}>
        It answered “{test.reply}” in <span className="tnum">{(test.ms / 1000).toFixed(1)}</span> s. Key, model and billing all work.
      </p>
    );
  }
  const problem = test ? test.error : connection.lastError;
  if (!problem) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-[13px] leading-snug" style={{ color: 'var(--color-gold)' }}>
      <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
      {test ? '' : 'Last time: '}{problem}
    </p>
  );
}
