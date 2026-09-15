import { useState, type ReactNode } from "react";
import portraits from "../../public/agent-portraits/dib39/manifest.json";
import { cn } from "@/lib/utils";

/** Deployment-specific, immutable identity allowlist; never match display names. */
export function AgentPortrait({ agent, fallback = null, className }: {
  agent: { id: string; companyId?: string; name: string };
  fallback?: ReactNode;
  className?: string;
}) {
  const portrait = portraits.find(p => p.agentId === agent.id && p.companyId === agent.companyId);
  const src = portrait ? `${portrait.path}?v=${portrait.sha256.slice(0, 12)}` : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return <img src={src} alt={agent.name} data-agent-id={agent.id}
    className={cn("size-8 shrink-0 rounded-full object-cover", className)}
    onError={() => setFailedSrc(src)} />;
}
