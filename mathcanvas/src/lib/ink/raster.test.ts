import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/parity.json";
import { type ModelFile, SymbolNet } from "./model";
import { features, render } from "./raster";

/* The app must see exactly what the network was trained on (mathcanvas-api/ml/raster.py) and
 * compute the same probabilities as Python (mathcanvas-api/ml/parity.py writes the fixture). */

// The network lives in the handwriting API; these tests read its copy.
const MODEL = process.env.INK_MODEL ?? path.resolve(__dirname, "../../../../mathcanvas-api/models/base.json");
const model = JSON.parse(readFileSync(MODEL, "utf8")) as ModelFile;

describe("symbol pictures and network match Python", () => {
  for (const [i, c] of fixture.cases.entries()) {
    it(`case ${i + 1} (${c.label})`, () => {
      const img = render(c.strokes);
      let off = 0;
      for (let p = 0; p < img.length; p++) if (Math.abs(img[p] * 255 - c.image[p]) > 1) off++;
      expect(off).toBeLessThanOrEqual(2);
      const f = features(c.strokes, c.unit);
      f.forEach((v, k) => expect(v).toBeCloseTo(c.features[k], 4));
      const probs = new SymbolNet(model).predict(Float32Array.from(c.image, (v) => v / 255), f);
      probs.forEach((v, k) => expect(v).toBeCloseTo(c.probs[k], 3));
    });
  }
});
