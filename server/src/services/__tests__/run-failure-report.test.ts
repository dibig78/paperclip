import { randomUUID } from "node:crypto";
import os from "node:os";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agents, companies, createDb, heartbeatRuns, type Db } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";

const mockCaptureRunFailure = vi.hoisted(() => vi.fn());
const mockRedactCurrentUserText = vi.hoisted(() =>
  vi.fn((input: string) => `redacted(${input})`),
);
const mockLoadConfig = vi.hoisted(() => vi.fn(() => ({ authPublicBaseUrl: undefined as string | undefined })));

vi.mock("../../sentry.js", () => ({
  captureRunFailure: mockCaptureRunFailure,
}));
vi.mock("../../log-redaction.js", () => ({
  redactCurrentUserText: mockRedactCurrentUserText,
}));
vi.mock("../../config.js", () => ({
  loadConfig: mockLoadConfig,
}));

import { reportRunFailure } from "../run-failure-report.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("reportRunFailure", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId!: string;
  let agentId!: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-run-failure-report-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    vi.clearAllMocks();
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompanyAndAgent(agentOverrides: Partial<typeof agents.$inferInsert> = {}) {
    companyId = randomUUID();
    agentId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Paperclip",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
      defaultResponsibleUserId: "responsible-user",
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "CodexCoder",
      role: "engineer",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
      ...agentOverrides,
    });
    return { companyId, agentId };
  }

  function buildRun(
    overrides: Partial<typeof heartbeatRuns.$inferSelect> = {},
  ): typeof heartbeatRuns.$inferSelect {
    return {
      id: randomUUID(),
      companyId,
      agentId,
      status: "failed",
      error: "the provider process exited with code 1",
      errorCode: "process_lost",
      nativeIssueId: randomUUID(),
      contextSnapshot: null,
      ...overrides,
    } as unknown as typeof heartbeatRuns.$inferSelect;
  }

  it("captures once for the status failed", async () => {
    await seedCompanyAndAgent();
    const run = buildRun({ status: "failed" });

    await reportRunFailure(db, run);

    expect(mockCaptureRunFailure).toHaveBeenCalledTimes(1);
  });

  it("captures once for the status timed_out", async () => {
    await seedCompanyAndAgent();
    const run = buildRun({ status: "timed_out" });

    await reportRunFailure(db, run);

    expect(mockCaptureRunFailure).toHaveBeenCalledTimes(1);
    expect(mockCaptureRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({ runStatus: "timed_out" }),
    );
  });

  it("captures nothing for succeeded, cancelled, and interrupted", async () => {
    await seedCompanyAndAgent();
    for (const status of ["succeeded", "cancelled", "interrupted"] as const) {
      const run = buildRun({ status });
      await reportRunFailure(db, run);
    }

    expect(mockCaptureRunFailure).not.toHaveBeenCalled();
  });

  it("sends agents.adapterType from the loaded agent row", async () => {
    await seedCompanyAndAgent({ adapterType: "claude_managed" });
    const run = buildRun({ status: "failed" });

    await reportRunFailure(db, run);

    expect(mockCaptureRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({ agentAdapter: "claude_managed" }),
    );
  });

  it("sends the adapter value unknown when the agent row is absent", async () => {
    await seedCompanyAndAgent();
    const run = buildRun({ status: "failed", agentId: randomUUID() });

    await reportRunFailure(db, run);

    expect(mockCaptureRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({ agentAdapter: "unknown" }),
    );
  });

  it("applies redactCurrentUserText to the error message", async () => {
    await seedCompanyAndAgent();
    const run = buildRun({ status: "failed", error: "raw message" });

    await reportRunFailure(db, run);

    expect(mockRedactCurrentUserText).toHaveBeenCalledWith("raw message");
    expect(mockCaptureRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: "redacted(raw message)" }),
    );
  });

  it("reads the task id from nativeIssueId, falling back to contextSnapshot.issueId", async () => {
    await seedCompanyAndAgent();
    const nativeIssueId = randomUUID();
    const runWithNativeIssueId = buildRun({
      status: "failed",
      nativeIssueId,
      contextSnapshot: { issueId: randomUUID() },
    });

    await reportRunFailure(db, runWithNativeIssueId);

    expect(mockCaptureRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: nativeIssueId }),
    );

    mockCaptureRunFailure.mockClear();
    const contextIssueId = randomUUID();
    const runWithContextIssueId = buildRun({
      status: "failed",
      nativeIssueId: null,
      contextSnapshot: { issueId: contextIssueId },
    });

    await reportRunFailure(db, runWithContextIssueId);

    expect(mockCaptureRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: contextIssueId }),
    );
  });

  it("does not throw when the database read fails", async () => {
    const throwingDb = {
      select: () => {
        throw new Error("connection reset");
      },
    } as unknown as Db;
    const run = buildRun({ status: "failed", agentId: randomUUID() });

    await expect(reportRunFailure(throwingDb, run)).resolves.toBeUndefined();
    expect(mockCaptureRunFailure).not.toHaveBeenCalled();
  });

  it("sends config.authPublicBaseUrl as the instance when it is set", async () => {
    await seedCompanyAndAgent();
    mockLoadConfig.mockReturnValue({ authPublicBaseUrl: "https://paperclip.example.com" });
    vi.resetModules();
    const { reportRunFailure: freshReportRunFailure } = await import("../run-failure-report.js");
    const run = buildRun({ status: "failed" });

    await freshReportRunFailure(db, run);

    expect(mockCaptureRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({ instance: "https://paperclip.example.com" }),
    );
  });

  it("sends os.hostname() as the instance when authPublicBaseUrl is absent", async () => {
    await seedCompanyAndAgent();
    mockLoadConfig.mockReturnValue({ authPublicBaseUrl: undefined });
    vi.resetModules();
    const { reportRunFailure: freshReportRunFailure } = await import("../run-failure-report.js");
    const run = buildRun({ status: "failed" });

    await freshReportRunFailure(db, run);

    expect(mockCaptureRunFailure).toHaveBeenCalledWith(
      expect.objectContaining({ instance: os.hostname() }),
    );
  });
});
