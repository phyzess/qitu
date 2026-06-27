import type { ImportFeatureAdapter, ReviewIssue } from "@qitu/import-pipeline";

export type StarterParsedRecord = {
  label: string;
  value: number;
};

export type StarterStagedRecord = StarterParsedRecord & {
  normalizedLabel: string;
};

export type StarterCommittedRecord = StarterStagedRecord & {
  committedAt: string;
};

export function parseStarterStagedRecord(value: unknown): StarterStagedRecord {
  if (!value || typeof value !== "object") {
    throw new Error("Starter staged record must be an object.");
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.label !== "string" ||
    typeof record.value !== "number" ||
    typeof record.normalizedLabel !== "string"
  ) {
    throw new Error("Starter staged record has an invalid shape.");
  }

  return {
    label: record.label,
    value: record.value,
    normalizedLabel: record.normalizedLabel,
  };
}

export const starterImportReviewAdapter: ImportFeatureAdapter<
  StarterParsedRecord,
  StarterStagedRecord,
  StarterCommittedRecord
> = {
  id: "starter.import-review",
  canHandle(source) {
    return source.filename.endsWith(".txt") || source.contentType.startsWith("text/");
  },
  async parse(source) {
    const text = await readAll(source);
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line, index) => index !== 0 || line.toLowerCase() !== "label,value")
      .map((line) => {
        const [label = "", value = "0"] = line.split(",");
        return { label, value: Number(value) };
      });
  },
  async stage(parsed) {
    return parsed.map((record) => ({
      ...record,
      normalizedLabel: record.label.trim().toLowerCase(),
    }));
  },
  validate(staged): ReviewIssue[] {
    if (Number.isFinite(staged.value)) {
      return [];
    }

    return [
      {
        code: "invalid_number",
        message: "Value must be a finite number.",
        severity: "error",
      },
    ];
  },
  async commitApproved({ records }) {
    const committedAt = new Date().toISOString();
    return records.map((record) => ({ ...record, committedAt }));
  },
};

async function readAll(source: ReadableStream<Uint8Array>): Promise<string> {
  const reader = source.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    chunks.push(result.value);
  }

  return new TextDecoder().decode(concat(chunks));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const merged = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}
