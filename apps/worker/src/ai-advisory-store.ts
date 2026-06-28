import type { AdvisoryArtifact } from "@qitu/ai-advisory";

export type AiAdvisoryArtifactRow = {
  id: string;
  import_job_id: string;
  kind: string;
  status: string;
  provider: string;
  model: string;
  prompt_version: string;
  summary: string;
  output_json: string;
  created_by: string;
  created_at: string;
  confirmed_by: string | null;
  confirmed_at: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
};

export async function readAiAdvisoryArtifacts(
  env: Env,
  jobId: string,
): Promise<AiAdvisoryArtifactRow[]> {
  const result = await env.DB.prepare(
    `
      SELECT
        id,
        import_job_id,
        kind,
        status,
        provider,
        model,
        prompt_version,
        summary,
        output_json,
        created_by,
        created_at,
        confirmed_by,
        confirmed_at,
        dismissed_by,
        dismissed_at
      FROM ai_advisory_artifacts
      WHERE import_job_id = ?
      ORDER BY created_at DESC
    `,
  )
    .bind(jobId)
    .all<AiAdvisoryArtifactRow>();

  return result.results;
}

export function prepareAiAdvisoryInsert(env: Env, artifact: AdvisoryArtifact): D1PreparedStatement {
  return env.DB.prepare(
    `
      INSERT INTO ai_advisory_artifacts (
        id,
        import_job_id,
        kind,
        status,
        provider,
        model,
        prompt_version,
        summary,
        output_json,
        created_by,
        created_at,
        confirmed_by,
        confirmed_at,
        dismissed_by,
        dismissed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).bind(
    artifact.id,
    artifact.importJobId,
    artifact.kind,
    artifact.status,
    artifact.provider,
    artifact.model,
    artifact.promptVersion,
    artifact.summary,
    JSON.stringify(artifact.output),
    artifact.createdBy,
    artifact.createdAt,
    artifact.confirmedBy ?? null,
    artifact.confirmedAt ?? null,
    artifact.dismissedBy ?? null,
    artifact.dismissedAt ?? null,
  );
}

export function publicAiAdvisoryArtifact(row: AiAdvisoryArtifactRow): Record<string, unknown> {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    importJobId: row.import_job_id,
    provider: row.provider,
    model: row.model,
    promptVersion: row.prompt_version,
    summary: row.summary,
    output: JSON.parse(row.output_json),
    createdAt: row.created_at,
    createdBy: row.created_by,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
    dismissedBy: row.dismissed_by,
    dismissedAt: row.dismissed_at,
  };
}
