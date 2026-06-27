import type { ImportFeatureAdapter, ReviewIssue } from "@qitu/import-pipeline";

export type JsonParsedRecord = {
  key: string;
  value: unknown;
  sourcePath: string;
};

export type JsonStagedRecord = JsonParsedRecord & {
  normalizedKey: string;
  valueType: string;
};

export type JsonCommittedRecord = JsonStagedRecord & {
  committedAt: string;
  commitKey: string;
};

export function parseJsonStagedRecord(value: unknown): JsonStagedRecord {
  if (!isRecord(value)) {
    throw new Error("JSON staged record must be an object.");
  }

  if (
    typeof value.key !== "string" ||
    typeof value.sourcePath !== "string" ||
    typeof value.normalizedKey !== "string" ||
    typeof value.valueType !== "string"
  ) {
    throw new Error("JSON staged record has an invalid shape.");
  }

  return {
    key: value.key,
    value: value.value,
    sourcePath: value.sourcePath,
    normalizedKey: value.normalizedKey,
    valueType: value.valueType,
  };
}

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

function parsedRecordsFromJson(value: unknown): JsonParsedRecord[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (isRecord(item) && typeof item.key === "string" && "value" in item) {
        return {
          key: item.key,
          value: item.value,
          sourcePath: `$[${index}]`,
        };
      }

      return {
        key: String(index + 1),
        value: item,
        sourcePath: `$[${index}]`,
      };
    });
  }

  if (isRecord(value)) {
    return Object.entries(value).map(([key, item]) => ({
      key,
      value: item,
      sourcePath: `$.${key}`,
    }));
  }

  throw new Error("JSON source must be an object or an array.");
}

function valueType(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const jsonRecordsAdapter: ImportFeatureAdapter<
  JsonParsedRecord,
  JsonStagedRecord,
  JsonCommittedRecord
> = {
  id: "example.json-records",
  canHandle(source) {
    return source.filename.endsWith(".json") || source.contentType.includes("application/json");
  },
  async parse(source) {
    return parsedRecordsFromJson(JSON.parse(await readAll(source)) as unknown);
  },
  async stage(parsed) {
    return parsed.map((record) => ({
      ...record,
      normalizedKey: record.key.trim().toLowerCase(),
      valueType: valueType(record.value),
    }));
  },
  validate(staged): ReviewIssue[] {
    if (staged.normalizedKey) {
      return [];
    }

    return [
      {
        code: "empty_key",
        message: "JSON record key must not be empty.",
        severity: "error",
      },
    ];
  },
  async commitApproved({ records, context }) {
    const committedAt = new Date().toISOString();
    return records.map((record) => ({
      ...record,
      committedAt,
      commitKey: `${context.importJobId}:${record.normalizedKey}`,
    }));
  },
};
