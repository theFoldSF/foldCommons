// Signature tuning log — a local, exportable record of what a signature
// generation looked like and what the tuner thought of it. Hidden page only
// (#tune in main.ts); no backend table, same local-first pattern the gallery
// started with before it grew an optional remote layer.

export interface SigSample {
  id: string;
  seed: number;
  params: Record<string, number>;
  ground: string; // hex the sample was previewed on
  ink: string;
  comment: string;
  rating: "up" | "down" | "";
  createdAt: string;
}

const KEY = "foldCommons.sigTuning.v1";

export function loadSamples(): SigSample[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(samples: SigSample[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(samples));
  } catch {
    // private mode etc — the note just won't stick around
  }
}

export function addSample(s: Omit<SigSample, "id" | "createdAt">): SigSample {
  const sample: SigSample = {
    ...s,
    id: Math.random().toString(36).slice(2, 10),
    createdAt: new Date().toISOString(),
  };
  const samples = loadSamples();
  samples.unshift(sample);
  save(samples);
  return sample;
}

export function removeSample(id: string) {
  save(loadSamples().filter((s) => s.id !== id));
}

export function exportSamplesJson(): string {
  return JSON.stringify(loadSamples(), null, 2);
}
