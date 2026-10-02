import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classifyIntent, normalizeIntentText } from '../frontend/src/assistant/classifier.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const modelFile = new URL('../frontend/src/assistant/model.json', import.meta.url);
const hash = () => createHash('sha256').update(readFileSync(modelFile)).digest('hex');
const before = hash();
const training = spawnSync('python3', ['train.py', 'train'], { cwd: root, encoding: 'utf8' });
assert.equal(training.status, 0, training.stderr);
assert.equal(hash(), before, 'Retraining must produce byte-identical model JSON.');

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const cases = [...Object.values(read('train.json')).flat(), ...Object.values(read('development-v1.json')).flat(),
  ...read('holdout-v2.json').map(row => row.text),
  'ＣＳ３１００还有空位吗', 'CS-3100 202710 2026 Fall', 'CS 3100 and CS-3500', '你好\n你好', '🚀🏆', 'a'.repeat(2500)];
const python = spawnSync('python3', ['-c', `import json,sys,train
model=json.loads(train.MODEL.read_text())
print(json.dumps([{"normalized": train.normalize(text), **train.classify(text, model)} for text in json.load(sys.stdin)], ensure_ascii=False))`],
  { cwd: root, input: JSON.stringify(cases), encoding: 'utf8' });
assert.equal(python.status, 0, python.stderr);
const expected = JSON.parse(python.stdout);
for (let index = 0; index < cases.length; index++) {
  const actual = classifyIntent(cases[index]);
  assert.equal(normalizeIntentText(cases[index]), expected[index].normalized, cases[index]);
  assert.equal(actual.intent, expected[index].intent, cases[index]);
  for (const key of ['confidence', 'margin', 'coverage']) {
    assert.ok(Math.abs(actual[key] - expected[index][key]) < 0.000001, `${cases[index]}: ${key} differs`);
    assert.ok(Number.isFinite(actual[key]), `${key} must be finite`);
  }
}
assert.equal(classifyIntent('').intent, 'unknown');
assert.equal(classifyIntent('🚀🎂🦊').intent, 'unknown');
assert.ok(readFileSync(modelFile).length < 150 * 1024, 'Model size budget exceeded');
console.log(`PASS: deterministic retraining; ${cases.length} Python/TypeScript parity cases; empty/emoji fallback; model size budget.`);
