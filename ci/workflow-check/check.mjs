// Checks the GitHub workflow files before a push, so a mistake shows up here
// and not as a run on GitHub with zero jobs (GitHub refuses the whole file and
// says why only to someone signed in). Run from this folder:
//
//   npm ci          (once)
//   npm run check   (or: node check.mjs <file.yml> ...)
//
// It parses each file, lists its jobs and step names, and fails on:
//   - a YAML syntax error;
//   - a context GitHub does not allow where it is used: `runner.` or `steps.`
//     in the workflow's or a job's `env` (the 2026-11-14 refusal was
//     `${{ runner.temp }}` in a job's env), `secrets.` in a job's `if`;
//   - a job with no steps and no `uses`, and a step with neither `run` nor `uses`;
//   - a `needs` that names a job that does not exist.
// It is not GitHub's own validator: a file that passes can still fail there.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

// No arguments: every workflow in the repository (npm does not expand globs on Windows).
const here = dirname(fileURLToPath(import.meta.url));
const workflows = join(here, '../../.github/workflows');
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync(workflows).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(workflows, f));

let problems = 0;
const flag = (file, msg) => {
  problems += 1;
  console.log(`  PROBLEM ${file}: ${msg}`);
};

/** Every `${{ … }}` expression in a value, as text. */
function expressions(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return [...text.matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1].trim());
}

function checkEnv(file, where, env) {
  for (const [key, value] of Object.entries(env ?? {})) {
    for (const e of expressions(value)) {
      if (/\b(runner|steps)\./.test(e)) flag(file, `${where} env ${key} uses \`${e}\`, which GitHub does not allow there (set it in a step instead)`);
    }
  }
}

for (const file of files) {
  const doc = parseDocument(readFileSync(file, 'utf8'));
  if (doc.errors.length) {
    for (const e of doc.errors) flag(file, `YAML: ${e.message.split('\n')[0]}`);
    continue;
  }
  const wf = doc.toJS();
  console.log(`${file}: ${JSON.stringify(wf.name ?? '(no name)')}`);
  checkEnv(file, 'workflow', wf.env);
  const jobs = wf.jobs ?? {};
  if (!Object.keys(jobs).length) flag(file, 'no jobs');
  for (const [id, job] of Object.entries(jobs)) {
    console.log(`  job ${id}: ${job.name ?? ''}`);
    checkEnv(file, `job ${id}`, job.env);
    for (const e of expressions(job.if)) {
      if (/\bsecrets\./.test(e)) flag(file, `job ${id} if uses secrets, which GitHub does not allow in a job's if`);
    }
    for (const need of [].concat(job.needs ?? [])) {
      if (!jobs[need]) flag(file, `job ${id} needs "${need}", which is not a job in this file`);
    }
    if (!job.uses && !(job.steps ?? []).length) flag(file, `job ${id} has no steps`);
    (job.steps ?? []).forEach((step, i) => {
      if (!step.run && !step.uses) flag(file, `job ${id} step ${i + 1} (${step.name ?? 'unnamed'}) has neither run nor uses`);
      console.log(`    - ${step.name ?? step.uses ?? '(unnamed)'}`);
    });
  }
}

console.log(problems ? `\n${problems} problem(s).` : '\nNo problems found.');
process.exit(problems ? 1 : 0);
