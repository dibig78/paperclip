import os from "node:os";
import { eq } from "drizzle-orm";
import { agents, heartbeatRuns, type Db } from "@paperclipai/db";
import { captureRunFailure, type RunFailureStatus } from "../sentry.js";
import { redactCurrentUserText } from "../log-redaction.js";
import { redactSensitiveText } from "../redaction.js";
import { loadConfig } from "../config.js";
import { logger } from "../middleware/logger.js";

type HeartbeatRun = typeof heartbeatRuns.$inferSelect;

const UNKNOWN_ADAPTER = "unknown";

/** Sentry rejects an oversized event with HTTP 413. Bound the error message. */
const MAX_ERROR_MESSAGE_LENGTH = 4096;
/** The error code is a short label. Bound it well under the message limit. */
const MAX_ERROR_CODE_LENGTH = 200;

let cachedRunFailureInstance: string | null = null;

/**
 * Remove a credential and the current user's home path from adapter-supplied
 * text, then cut the result to `maxLength`. Run the length cut after the
 * redaction, so a credential cannot survive at a cut boundary.
 */
function sanitizeAdapterText(input: string, maxLength: number): string {
  return redactSensitiveText(redactCurrentUserText(input)).slice(0, maxLength);
}

/**
 * Resolve the Paperclip instance value a Sentry event carries. Resolve it
 * once, on the first call, and return the stored value after that. Use the
 * operator's public base URL when set, else the host name. `config.host` is
 * never a candidate — it can be a bind address such as `0.0.0.0`.
 */
function resolveRunFailureInstance(): string {
  if (cachedRunFailureInstance === null) {
    cachedRunFailureInstance = loadConfig().authPublicBaseUrl ?? os.hostname();
  }
  return cachedRunFailureInstance;
}

function isRunFailureStatus(status: string): status is RunFailureStatus {
  return status === "failed" || status === "timed_out";
}

function readTaskId(run: HeartbeatRun): string | null {
  if (run.nativeIssueId) return run.nativeIssueId;
  const contextIssueId = run.contextSnapshot?.issueId;
  return typeof contextIssueId === "string" && contextIssueId.length > 0 ? contextIssueId : null;
}

/**
 * Report a terminal run failure to Sentry. Returns at once for any status
 * other than `failed` and `timed_out`. Never throws — a Sentry failure or a
 * database read failure must not change the caller's control flow.
 *
 * Call this beside the caller's own terminal-status write, with
 * `void reportRunFailure(db, run)`. Do not await it — a Sentry read must
 * not delay the caller's own required lifecycle work.
 */
export async function reportRunFailure(db: Db, run: HeartbeatRun): Promise<void> {
  if (!isRunFailureStatus(run.status)) return;
  try {
    const agent = await db
      .select({ adapterType: agents.adapterType })
      .from(agents)
      .where(eq(agents.id, run.agentId))
      .then((rows) => rows[0] ?? null);

    const taskId = readTaskId(run);
    if (!taskId) {
      logger.warn({ runId: run.id }, "run failure report has no task id, skipping Sentry report");
      return;
    }

    captureRunFailure({
      instance: resolveRunFailureInstance(),
      taskId,
      runId: run.id,
      errorMessage: sanitizeAdapterText(run.error ?? "", MAX_ERROR_MESSAGE_LENGTH),
      errorCode:
        run.errorCode === null
          ? null
          : sanitizeAdapterText(run.errorCode, MAX_ERROR_CODE_LENGTH),
      agentAdapter: agent?.adapterType ?? UNKNOWN_ADAPTER,
      runStatus: run.status,
    });
  } catch (err) {
    logger.warn({ err, runId: run.id }, "failed to report run failure to Sentry");
  }
}
