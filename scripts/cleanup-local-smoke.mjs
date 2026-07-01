import { spawn } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const dryRun = process.argv.slice(2).includes("--dry-run");
const timeoutMs = Number(process.env.WRANGLER_D1_EXECUTE_TIMEOUT_MS ?? 180_000);
const wrangler = process.platform === "win32" ? "wrangler.cmd" : "wrangler";
const sourceFilter = `
  filename LIKE 'browser-smoke-%'
  OR filename LIKE 'smoke-%'
  OR filename LIKE 'sample-%'
`;
const userFilter = `
  email LIKE 'reviewer-%@example.com'
  AND display_name = 'Browser Smoke'
`;
const countSql = `
  SELECT
    (SELECT COUNT(*) FROM source_files WHERE ${sourceFilter}) AS source_files,
    (SELECT COUNT(*) FROM import_jobs WHERE source_file_id IN (
      SELECT id FROM source_files WHERE ${sourceFilter}
    )) AS import_jobs,
    (SELECT COUNT(*) FROM example_staged_records WHERE source_file_id IN (
      SELECT id FROM source_files WHERE ${sourceFilter}
    )) AS staged_records,
    (SELECT COUNT(*) FROM example_committed_records WHERE source_file_id IN (
      SELECT id FROM source_files WHERE ${sourceFilter}
    )) AS committed_records,
    (SELECT COUNT(*) FROM users WHERE ${userFilter}) AS smoke_users,
    (SELECT COUNT(*) FROM invitations WHERE email LIKE 'reviewer-%@example.com') AS smoke_invitations,
    (SELECT COUNT(*) FROM email_messages WHERE recipient_email LIKE 'reviewer-%@example.com') AS smoke_emails;
`;
const deleteSql = `
  DELETE FROM ai_advisory_artifacts
  WHERE import_job_id IN (
    SELECT import_jobs.id
    FROM import_jobs
    INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
    WHERE ${sourceFilter}
  );

  DELETE FROM import_job_events
  WHERE import_job_id IN (
    SELECT import_jobs.id
    FROM import_jobs
    INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
    WHERE ${sourceFilter}
  );

  DELETE FROM import_review_record_decisions
  WHERE import_job_id IN (
    SELECT import_jobs.id
    FROM import_jobs
    INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
    WHERE ${sourceFilter}
  );

  DELETE FROM import_review_decisions
  WHERE import_job_id IN (
    SELECT import_jobs.id
    FROM import_jobs
    INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
    WHERE ${sourceFilter}
  );

  DELETE FROM import_review_issues
  WHERE import_job_id IN (
    SELECT import_jobs.id
    FROM import_jobs
    INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
    WHERE ${sourceFilter}
  );

  DELETE FROM example_committed_records
  WHERE source_file_id IN (SELECT id FROM source_files WHERE ${sourceFilter});

  DELETE FROM example_staged_records
  WHERE source_file_id IN (SELECT id FROM source_files WHERE ${sourceFilter});

  DELETE FROM audit_events
  WHERE actor_id IN (SELECT id FROM users WHERE ${userFilter})
     OR subject_id IN (SELECT id FROM users WHERE ${userFilter})
     OR subject_id IN (SELECT id FROM source_files WHERE ${sourceFilter})
     OR subject_id IN (
       SELECT import_jobs.id
       FROM import_jobs
       INNER JOIN source_files ON source_files.id = import_jobs.source_file_id
       WHERE ${sourceFilter}
     )
     OR metadata_json LIKE '%browser-smoke-%'
     OR metadata_json LIKE '%sample-%';

  DELETE FROM import_jobs
  WHERE source_file_id IN (SELECT id FROM source_files WHERE ${sourceFilter});

  DELETE FROM source_files
  WHERE ${sourceFilter};

  DELETE FROM security_events
  WHERE actor_user_id IN (SELECT id FROM users WHERE ${userFilter})
     OR target_user_id IN (SELECT id FROM users WHERE ${userFilter})
     OR metadata_json LIKE '%reviewer-%@example.com%';

  DELETE FROM login_attempts
  WHERE user_id IN (SELECT id FROM users WHERE ${userFilter});

  DELETE FROM sessions
  WHERE user_id IN (SELECT id FROM users WHERE ${userFilter});

  DELETE FROM password_credentials
  WHERE user_id IN (SELECT id FROM users WHERE ${userFilter});

  DELETE FROM password_reset_tokens
  WHERE email LIKE 'reviewer-%@example.com'
     OR user_id IN (SELECT id FROM users WHERE ${userFilter});

  DELETE FROM email_messages
  WHERE recipient_email LIKE 'reviewer-%@example.com';

  DELETE FROM invitations
  WHERE email LIKE 'reviewer-%@example.com';

  DELETE FROM users
  WHERE ${userFilter};
`;

console.log("Local smoke/demo cleanup targets qitu-dev --local only.");
await runD1(countSql, "count");

if (dryRun) {
  console.log("Dry run complete. Re-run without --dry-run to delete matching local rows.");
  process.exit(0);
}

await runD1(deleteSql, "delete");
await runD1(countSql, "count");
console.log("Local smoke/demo cleanup complete.");

function runD1(sql, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      wrangler,
      ["d1", "execute", "qitu-dev", "--local", "--command", compactSql(sql)],
      {
        cwd: join(root, "apps", "worker"),
        env: {
          ...process.env,
          CI: process.env.CI ?? "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Wrangler local D1 ${label} did not finish within ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Wrangler local D1 ${label} exited with code ${code ?? "none"} signal ${
            signal ?? "none"
          }.`,
        ),
      );
    });
  });
}

function compactSql(sql) {
  return sql.trim().replace(/\s+/g, " ");
}
