#!/usr/bin/env python3
"""Reproducible bilingual intent classifier; Python standard library only.

Training reads ONLY train.json. Evaluation is an explicit separate command.
Rejection thresholds are fitted by full leave-one-out on train.json only.
"""
import argparse
from collections import Counter
import hashlib
import json
import itertools
import math
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parent
MODEL = ROOT.parent / "frontend/src/assistant/model.json"
LABELS = ["availability", "compare", "watchlist", "terms", "notifications", "privacy", "help", "unknown"]
TEMPERATURE = 0.10


def normalize(text):
    text = unicodedata.normalize("NFKC", text[:2000]).lower()
    text = re.sub(r"(?<![a-z])[a-z]{2,6}\s*-?\s*\d{4}[a-z]?(?![a-z0-9])", " § ", text)
    text = re.sub(r"(?<!\d)(?:20\d{4}|20\d{2})(?!\d)", " # ", text)
    text = re.sub(r"[^a-z0-9\u3400-\u9fff§#]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def features(text):
    text = "^" + normalize(text) + "$"
    return Counter(text[i:i+n] for n in (2, 3) for i in range(len(text)-n+1) if text[i:i+n].strip(" ^$"))


def unit(vector):
    length = math.sqrt(sum(x*x for x in vector.values()))
    return {k: x/length for k, x in vector.items()} if length else {}


def vectorize(counts, vocabulary, idf):
    return unit({vocabulary[k]: (1 + math.log(n)) * idf[vocabulary[k]] for k, n in counts.items() if k in vocabulary})


def fit(rows):
    df = Counter(feature for _, _, counts in rows for feature in counts)
    # Keep singleton features: useful bilingual strings often contain rare Han n-grams.
    terms = sorted(df)
    vocabulary = {term: i for i, term in enumerate(terms)}
    idf = [round(math.log((1 + len(rows)) / (1 + df[term])) + 1, 7) for term in terms]
    sums = {(label, lang): Counter() for label in LABELS for lang in ("zh", "en")}
    for label, text, counts in rows:
        language = "zh" if re.search(r"[\u3400-\u9fff]", text) else "en"
        sums[label, language].update(vectorize(counts, vocabulary, idf))
    keys = [key for key, value in sums.items() if value]
    centroids = [[[i, round(value, 7)] for i, value in sorted(unit(sums[key]).items())] for key in keys]
    return {"version": 2, "algorithm": "char-2-3-tfidf-language-centroids", "labels": LABELS,
            "prototypeLabels": [LABELS.index(label) for label, _ in keys], "prototypeLanguages": [lang for _, lang in keys],
            "terms": terms, "idf": idf, "centroids": centroids}


def scores_for(text, model):
    counts = features(text)
    vocab = {term: i for i, term in enumerate(model["terms"])}
    coverage = sum(n for k, n in counts.items() if k in vocab) / max(1, sum(counts.values()))
    vector = vectorize(counts, vocab, model["idf"])
    scores = [0.0] * len(LABELS)
    for index, centroid in enumerate(model["centroids"]):
        score = sum(vector.get(i, 0) * value for i, value in centroid)
        label = model["prototypeLabels"][index]
        scores[label] = max(scores[label], score)
    order = sorted(range(len(scores)), key=lambda i: -scores[i])
    best = order[0]
    confidence = 1 / sum(math.exp((value - scores[best]) / TEMPERATURE) for value in scores)
    return {"candidate": LABELS[best], "similarity": scores[best], "confidence": confidence,
            "margin": scores[best] - scores[order[1]], "coverage": coverage}


def decide(values, cfg):
    reject = values["coverage"] < cfg["minCoverage"] or values["similarity"] < cfg["minSimilarity"] or values["margin"] < cfg["minMargin"] or values["confidence"] < cfg["minConfidence"]
    return "unknown" if reject else values["candidate"]


def calibrate(rows):
    # Complete leave-one-out fitting: held-out text does not contribute to the
    # vocabulary, IDF, or either language centroid. Never reads evaluation files.
    loo = []
    for index, (label, text, _) in enumerate(rows):
        model = fit(rows[:index] + rows[index+1:])
        loo.append({"expected": label, "text": text, **scores_for(text, model)})
    counts = Counter(row["expected"] for row in loo)
    best = None
    for coverage, similarity, margin, confidence in itertools.product(
            (0.10, 0.20, 0.30), (0.04, 0.08, 0.12, 0.16, 0.20, 0.24), (0.005, 0.015, 0.025, 0.04, 0.06), (0.16, 0.20, 0.24, 0.28, 0.32)):
        cfg = {"minCoverage": coverage, "minSimilarity": similarity, "minMargin": margin, "minConfidence": confidence, "temperature": TEMPERATURE}
        predictions = [decide(row, cfg) for row in loo]
        correct = Counter(row["expected"] for row, pred in zip(loo, predictions) if row["expected"] == pred)
        balanced_accuracy = sum(correct[label] / counts[label] for label in LABELS) / len(LABELS)
        # Maximize class-balanced LOO accuracy. Ties prefer unknown rejection,
        # then more conservative thresholds; there is no held-out tuning.
        key = (balanced_accuracy, correct["unknown"], margin, confidence, similarity, coverage)
        if best is None or key > best[0]:
            best = (key, cfg, predictions)
    _, cfg, predictions = best
    result = {"method": "full-leave-one-out-on-train-only", "objective": "class-balanced accuracy; ties prefer unknown recall and stricter thresholds",
              "gridCandidates": 450, "selectedThresholds": cfg, "balancedAccuracy": best[0][0],
              "correct": sum(row["expected"] == pred for row, pred in zip(loo, predictions)), "total": len(loo),
              "examples": [{**row, "intent": pred} for row, pred in zip(loo, predictions)]}
    (ROOT / "calibration-results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return cfg


def train():
    raw = (ROOT / "train.json").read_bytes()
    corpus = json.loads(raw)
    rows = [(label, text, features(text)) for label in LABELS for text in corpus[label]]
    cfg = calibrate(rows)
    model = {**fit(rows), "thresholds": cfg, "trainingSha256": hashlib.sha256(raw).hexdigest(), "trainingExamples": len(rows)}
    MODEL.parent.mkdir(parents=True, exist_ok=True)
    MODEL.write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"examples": len(rows), "features": len(model["terms"]), "modelBytes": MODEL.stat().st_size, "thresholds": cfg, "path": str(MODEL)}))


def classify(text, model):
    values = scores_for(text, model)
    intent = decide(values, model["thresholds"]) if normalize(text) else "unknown"
    return {"intent": intent, **{key: round(values[key], 6) for key in ("confidence", "margin", "coverage")}}


def evaluate(filename="development-v1.json", output="development-v2-results.json"):
    model = json.loads(MODEL.read_text(encoding="utf-8"))
    corpus = json.loads((ROOT / filename).read_text(encoding="utf-8"))
    if isinstance(corpus, list):
        corpus = {label: [row["text"] for row in corpus if row["intent"] == label] for label in LABELS}
    train_corpus = json.loads((ROOT / "train.json").read_text(encoding="utf-8"))
    train_strings = {normalize(s) for samples in train_corpus.values() for s in samples}
    rows = []
    confusion = {a: {b: 0 for b in LABELS} for a in LABELS}
    for label in LABELS:
        for text in corpus[label]:
            if normalize(text) in train_strings:
                raise ValueError(f"Evaluation duplicates normalized training example: {text!r}")
            result = classify(text, model)
            confusion[label][result["intent"]] += 1
            rows.append({"text": text, "expected": label, **result})
    correct = sum(r["expected"] == r["intent"] for r in rows)
    supported = [r for r in rows if r["expected"] != "unknown"]
    unknown = [r for r in rows if r["expected"] == "unknown"]
    report = {"trainingSha256": model["trainingSha256"], "thresholds": model["thresholds"], "total": len(rows), "correct": correct,
              "accuracy": round(correct/len(rows), 6), "supportedCorrect": sum(r["expected"] == r["intent"] for r in supported),
              "supportedTotal": len(supported), "unknownRejected": sum(r["intent"] == "unknown" for r in unknown), "unknownTotal": len(unknown),
              "labels": LABELS, "confusion": confusion, "examples": rows}
    (ROOT / output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ["total", "correct", "accuracy", "supportedCorrect", "supportedTotal", "unknownRejected", "unknownTotal"]}))
    for row in rows:
        if row["expected"] != row["intent"]:
            print(json.dumps(row, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["train", "evaluate"], nargs="?", default="train")
    parser.add_argument("--input", default="development-v1.json")
    parser.add_argument("--output", default="development-v2-results.json")
    args = parser.parse_args()
    train() if args.command == "train" else evaluate(args.input, args.output)
