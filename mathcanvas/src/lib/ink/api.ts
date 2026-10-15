import type { BatchClassifier, Candidate } from "./recognize";
import type { InkSample } from "./samples";
import type { Sym } from "./symbols";

/**
 * The handwriting API (mathcanvas-api): the symbol network runs there, and it
 * keeps the symbols each learner fixed so it can fine-tune a model on their hand.
 */
// Same-site path, forwarded to the API by next.config.ts. NEXT_PUBLIC_MATHCANVAS_API
// points the browser straight at an API instead (that API must allow this site in MC_CORS_ORIGINS).
export const API_URL = (process.env.NEXT_PUBLIC_MATHCANVAS_API || "/api/ink").replace(/\/$/, "");

const LEARNER_KEY = "mathcanvas:learner";

/** A random id for this browser: the learner's samples and personal model live under it. */
export function learnerId(): string {
  try {
    let id = localStorage.getItem(LEARNER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(LEARNER_KEY, id);
    }
    return id;
  } catch {
    return "anonymous-learner";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!r.ok) {
    const detail = await r.json().then((b: { detail?: unknown }) => b.detail, () => null);
    throw new ApiError(r.status, typeof detail === "string" ? detail : `Handwriting service error (${r.status})`);
  }
  return (r.status === 204 ? null : r.json()) as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const round = (v: number) => Math.round(v * 10) / 10;

/** Scores stroke groups on the server, with the learner's own model when they have one. */
export const classifyRemote: BatchClassifier = async (groups) => {
  if (groups.length === 0) return [];
  const body = {
    learner: learnerId(),
    groups: groups.map((g) => ({ strokes: g.strokes.map((s) => s.map((p) => [round(p.x), round(p.y)])), unit: g.unit })),
  };
  const res = await call<{ classes: Sym[]; costs: number[][] }>("/v1/classify", { method: "POST", body: JSON.stringify(body) });
  return res.costs.map((row) => row.map((cost, i): Candidate => ({ symbol: res.classes[i], cost })).sort((a, b) => a.cost - b.cost));
};

export function sendSamples(samples: InkSample[]): Promise<{ total: number }> {
  return call(`/v1/learners/${learnerId()}/samples`, { method: "POST", body: JSON.stringify({ samples }) });
}

export type TrainingJob = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  installed?: boolean;
  /** Why a finished job did or didn't install its model. */
  verdict?: "installed" | "worse_base" | "worse_personal";
  reason?: string;
  error?: string;
};

export type LearnerInfo = { samples: number; minSamples: number; model: { personal: boolean }; job: TrainingJob | null };

export const learnerInfo = () => call<LearnerInfo>(`/v1/learners/${learnerId()}`);
export const startTraining = () => call<TrainingJob>(`/v1/learners/${learnerId()}/finetune`, { method: "POST" });
export const trainingJob = (id: string) => call<TrainingJob>(`/v1/jobs/${id}`);
export const forgetLearner = () => call<null>(`/v1/learners/${learnerId()}`, { method: "DELETE" });
