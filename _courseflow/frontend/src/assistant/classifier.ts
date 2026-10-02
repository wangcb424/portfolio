import model from './model.json' with { type: 'json' };

export type Intent = 'availability' | 'compare' | 'watchlist' | 'terms' | 'notifications' | 'privacy' | 'help' | 'unknown';
export type Classification = { intent: Intent; confidence: number; margin: number; coverage: number };

const vocabulary = new Map(model.terms.map((term, index) => [term, index]));
const labels = model.labels as Intent[];
const centroids = model.centroids.map(entries => new Map(entries.map(([index, weight]) => [index, weight])));

/** Keep this identical to assistant-model/train.py. Never sends text off-device. */
export function normalizeIntentText(input: string): string {
  return input.slice(0, 2000).normalize('NFKC').toLowerCase()
    .replace(/(?<![a-z])[a-z]{2,6}\s*-?\s*\d{4}[a-z]?(?![a-z0-9])/g, ' § ')
    .replace(/(?<!\d)(?:20\d{4}|20\d{2})(?!\d)/g, ' # ')
    .replace(/[^a-z0-9\u3400-\u9fff§#]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Trained TF-IDF centroid inference. Confidence is a ranking score, not a calibrated probability. */
export function classifyIntent(input: string): Classification {
  const normalized = normalizeIntentText(input);
  const text = `^${normalized}$`;
  const counts = new Map<string, number>();
  for (const n of [2, 3]) {
    for (let i = 0; i <= text.length - n; i++) {
      const feature = text.slice(i, i + n);
      if (/[^ ^$]/.test(feature)) counts.set(feature, (counts.get(feature) ?? 0) + 1);
    }
  }
  let total = 0, known = 0, normSquared = 0;
  const vector = new Map<number, number>();
  for (const [feature, count] of counts) {
    total += count;
    const index = vocabulary.get(feature);
    if (index === undefined) continue;
    known += count;
    const value = (1 + Math.log(count)) * model.idf[index];
    normSquared += value * value;
    vector.set(index, value);
  }
  const norm = Math.sqrt(normSquared);
  const scores = new Array<number>(labels.length).fill(0);
  centroids.forEach((centroid, index) => {
    let similarity = 0;
    if (norm) for (const [index, value] of vector) similarity += value / norm * (centroid.get(index) ?? 0);
    const label = model.prototypeLabels[index];
    scores[label] = Math.max(scores[label], similarity);
  });
  const ranking = scores.map((similarity, index) => ({ similarity, index })).sort((a, b) => b.similarity - a.similarity);
  const best = ranking[0];
  const margin = best.similarity - ranking[1].similarity;
  const coverage = known / Math.max(1, total);
  const cfg = model.thresholds;
  const confidence = 1 / scores.reduce((sum, score) => sum + Math.exp((score - best.similarity) / cfg.temperature), 0);
  const reject = !normalized || coverage < cfg.minCoverage || best.similarity < cfg.minSimilarity || margin < cfg.minMargin || confidence < cfg.minConfidence;
  return { intent: reject ? 'unknown' : labels[best.index], confidence, margin, coverage };
}
