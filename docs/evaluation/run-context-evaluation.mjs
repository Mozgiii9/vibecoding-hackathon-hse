import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');
const dist = path.join(repository, 'app/builds/typescript/dist');
const allowedErrors = new Set(['provider_failed', 'provider_timeout', 'provider_unconfigured', 'stt_unconfigured']);
const safeCode = (error) => allowedErrors.has(error?.code) ? error.code : 'evaluation_failed';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const event = ({ criterionId, eventType, quote, textStart, textEnd, startMs, endMs }) =>
  ({ criterionId, eventType, quote, textStart, textEnd, startMs, endMs });
const triples = (events) => events.map(({ criterionId, eventType, quote }) => JSON.stringify([criterionId, eventType, quote])).sort();
const labels = (events) => events.map(({ criterionId, eventType }) => JSON.stringify([criterionId, eventType])).sort();
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

/** Uses the application's built provider factory and validation; never substitutes a model response. */
export async function runEvaluation({ env = process.env, parserOnly = false, outputPath, caseIds } = {}) {
  const paths = {
    provider: path.join(dist, 'features/context/providers.js'),
    extraction: path.join(dist, 'features/context/extraction.js'),
    validation: path.join(dist, 'features/context/validation.js'),
    config: path.join(dist, 'gateway/hackathon-config.js'),
  };
  const [{ createContextProviders }, { parseExtractionResponse }, { validateEvidence }, { readHackathonProviderConfig }] =
    await Promise.all(Object.values(paths).map((file) => import(pathToFileURL(file).href)));
  const corpus = await json(path.join(directory, 'acceptance-corpus.json'));
  const { goal } = await json(path.resolve(directory, corpus.goalFixture));
  const parser = await json(path.join(directory, 'parser-cases.json'));
  const config = parserOnly ? undefined : readHackathonProviderConfig(env);
  if (!parserOnly && (!config.protocol || !config.baseUrl || !config.model || !config.apiKey)) {
    const error = new Error('Live evaluation needs server-side HACKATHON_LLM_* environment configuration.');
    error.code = 'provider_unconfigured';
    throw error;
  }
  const providers = parserOnly ? undefined : createContextProviders(config);
  const selected = [...corpus.cases.filter((item) => !parserOnly || item.mode === 'validation'),
    ...parser.cases.map((item) => ({ ...item, mode: 'validation', category: 'Дополнительная parser/validation проверка' }))]
    .filter((item) => !caseIds || caseIds.includes(item.id));
  if (selected.length === 0) throw new Error('No matching acceptance cases.');
  const results = [];
  for (const item of selected) {
    const source = { kind: 'text', title: `Synthetic acceptance: ${item.id}`, text: item.text,
      capturedAt: null, segments: [], contentHash: digest(Buffer.concat([Buffer.from('text\0'), Buffer.from(item.text)])) };
    const started = performance.now();
    let actual = [];
    let validation = 'accepted';
    let errorCode = null;
    let parserAccepted = item.mode === 'live' ? null : false;
    try {
      if (item.mode === 'live') {
        actual = await providers.extract({ goal, source });
      } else {
        const proposals = parseExtractionResponse(item.rawResponse ?? JSON.stringify(item.proposals));
        parserAccepted = true;
        actual = validateEvidence(proposals, goal, source);
      }
    } catch (error) {
      validation = 'rejected';
      errorCode = safeCode(error);
    }
    const quoteValid = validation === 'accepted'
      ? actual.every((proposal) => Number.isInteger(proposal.textStart) && Number.isInteger(proposal.textEnd)
        && proposal.textStart >= 0 && proposal.textEnd > proposal.textStart && proposal.textEnd <= source.text.length
        && source.text.slice(proposal.textStart, proposal.textEnd) === proposal.quote)
      : null;
    const outcomeMatch = validation === item.expected.validation
      && (item.expected.errorCode === undefined || errorCode === item.expected.errorCode);
    const semanticMatch = validation === 'accepted' && item.expected.events
      ? equal(labels(actual), labels(item.expected.events)) : null;
    const quoteMatch = validation === 'accepted' && item.expected.events
      ? equal(triples(actual), triples(item.expected.events)) : null;
    const passed = outcomeMatch && (validation === 'rejected' || (quoteValid && semanticMatch !== false && quoteMatch !== false));
    results.push({ id: item.id, mode: item.mode, category: item.category, expected: item.expected,
      actual: { validation, errorCode, events: actual.map(event) }, parserAccepted, quoteValid,
      semanticMatch, quoteMatch, outcomeMatch, passed, latencyMs: Math.round(performance.now() - started) });
    // Case IDs and fixed domain error codes only: never print config or provider responses.
    process.stdout.write(`${item.id}: ${passed ? 'PASS' : 'FAIL'} (${results.at(-1).latencyMs} ms)\n`);
  }
  let sourceSha = null;
  try { sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  const report = {
    schemaVersion: 1, startedAt: new Date(Date.now() - results.reduce((sum, item) => sum + item.latencyMs, 0)).toISOString(),
    completedAt: new Date().toISOString(), sourceSha, mode: parserOnly ? 'parser-only' : 'live-and-parser',
    configuration: { protocol: config?.protocol ?? null, providerConfigured: Boolean(providers), keyRecorded: false, endpointRecorded: false },
    moduleSha256: Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, file]) => [name, digest(await readFile(file))]))),
    corpusSha256: digest(await readFile(path.join(directory, 'acceptance-corpus.json'))),
    summary: { total: results.length, passed: results.filter((item) => item.passed).length,
      failed: results.filter((item) => !item.passed).length, liveCalls: results.filter((item) => item.mode === 'live').length },
    limitations: ['Synthetic acceptance only; not a general model-quality benchmark.',
      'Strict quoteMatch can fail for another valid span; quoteValid and semanticMatch are reported separately.',
      'Validation verifies structure and source spans, not semantic truth. Human review remains required.',
      'No store mutation, UI acceptance, STT, persistence or progress claim is made by this runner.'],
    results,
  };
  const destination = outputPath ? path.resolve(outputPath) : path.join(directory, parserOnly ? 'parser-results.json' : 'live-results.json');
  await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`Evaluation: ${report.summary.passed}/${report.summary.total} PASS; live calls: ${report.summary.liveCalls}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const output = args.find((argument) => argument.startsWith('--output='))?.slice('--output='.length);
  const selected = args.find((argument) => argument.startsWith('--cases='))?.slice('--cases='.length).split(',');
  try {
    const report = await runEvaluation({ parserOnly: args.includes('--parser-only'), outputPath: output, caseIds: selected });
    if (report.summary.failed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Evaluation could not run: ${safeCode(error)}. Check build and server-side environment; no provider details recorded.\n`);
    process.exitCode = 2;
  }
}
