import test from "node:test";
import assert from "node:assert/strict";
import { analyzeText, evaluateAnalysisSamples, normalizeText } from "../../app";

test("normalizeText compacts whitespace and punctuation variants", () => {
  const normalized = normalizeText("  Teh   quick  fox\n\nsaid “hello”  ");
  assert.equal(normalized, 'Teh quick fox said "hello"');
});

test("analyzeText flags common correction patterns", () => {
  const result = analyzeText("Teh freind definately likes recieve letters.", { minConfidence: 0.55 });
  const recommendations = result.annotations.map((annotation) => annotation.recommendation.toLowerCase());

  assert.ok(recommendations.some((item) => item.includes("the")));
  assert.ok(recommendations.some((item) => item.includes("friend")));
  assert.ok(recommendations.some((item) => item.includes("definitely")));
  assert.ok(result.modelAccuracyEstimate < 100);
});

test("evaluation hook returns measurable score", () => {
  const evaluation = evaluateAnalysisSamples([
    { text: "Teh cat", expectedCorrections: ["the"] },
    { text: "Normal sentence", expectedCorrections: [] },
  ]);

  assert.ok(evaluation.overall >= 0 && evaluation.overall <= 1);
  assert.equal(evaluation.details.length, 2);
});
