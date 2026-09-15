import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Agent, ActivityEvent } from "@paperclipai/shared";
import portraits from "../../public/agent-portraits/dib39/manifest.json";
vi.mock("./IssueReferenceActivitySummary", () => ({ IssueReferenceActivitySummary: () => null }));
import { ActivityRow } from "./ActivityRow";
describe("recent activity portraits", () => {
 it.each(portraits)("uses approved identity for $name", p => {
  const event = { actorType: "agent", actorId: p.agentId, action: "environment.lease_released", entityType: "environment", entityId: "test", createdAt: new Date() } as ActivityEvent;
  const actor = { id: p.agentId, companyId: p.companyId, name: p.name } as Agent;
  const html = renderToStaticMarkup(<ActivityRow event={event} agentMap={new Map([[actor.id, actor]])} entityNameMap={new Map()} />);
  expect(html).toContain(p.path);
 });
});
