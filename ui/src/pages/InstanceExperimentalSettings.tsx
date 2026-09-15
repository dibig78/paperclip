import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FlaskConical, Lock, Play } from "lucide-react";
import type {
  InstanceExperimentalSettings,
  InstanceExperimentalSettingsWithManaged,
  InstanceFeatureKey,
  ManagedSettingMetadata,
  PatchInstanceExperimentalSettings,
} from "@paperclipai/shared";
import { experimentalSettingKey } from "@paperclipai/shared";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { useHiddenSettings } from "@/hooks/useHiddenSettings";
import { getWorktreeInstanceId, isWorktreeRuntime } from "../lib/worktree-branding";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type WorktreeRunExecutionDisplayState =
  | { kind: "off" }
  | { kind: "armed"; activatedAt: string }
  | { kind: "fail_closed"; reason: "missing_cutoff" | "missing_instance_id" | "instance_mismatch" };

/**
 * Mirror of the server's `resolveWorktreeRunExecutionActivation` fail-closed
 * ladder (server/src/services/instance-settings.ts) so the card never claims a
 * copied/legacy row is arming execution. The derived fields are display-only —
 * the PATCH the toggle sends still writes just the boolean.
 */
function resolveWorktreeRunExecutionDisplayState(
  settings:
    | Pick<
        InstanceExperimentalSettings,
        | "enableWorktreeRunExecution"
        | "worktreeRunExecutionActivatedAt"
        | "worktreeRunExecutionActivationInstanceId"
      >
    | undefined,
  currentInstanceId: string | null,
): WorktreeRunExecutionDisplayState {
  if (settings?.enableWorktreeRunExecution !== true) return { kind: "off" };
  if (!settings.worktreeRunExecutionActivatedAt) return { kind: "fail_closed", reason: "missing_cutoff" };
  if (!currentInstanceId) return { kind: "fail_closed", reason: "missing_instance_id" };
  if (settings.worktreeRunExecutionActivationInstanceId !== currentInstanceId) {
    return { kind: "fail_closed", reason: "instance_mismatch" };
  }
  return { kind: "armed", activatedAt: settings.worktreeRunExecutionActivatedAt };
}

function formatActivationTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// PAP-11233: keep Conference Room code intact, but hide the user-facing opt-in for now.
const SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING = false;

function ManagedByCloudBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Lock aria-hidden="true" />
      Managed by Paperclip Cloud
    </Badge>
  );
}

function ExperimentalToggleCard({
  title,
  description,
  footnote,
  checked,
  onCheckedChange,
  disabled,
  settingKey,
  managed,
  ariaLabel,
}: {
  title: string;
  description: string;
  footnote?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  /** Flag key backing this card; operator-hidden keys render nothing. */
  settingKey: InstanceFeatureKey;
  managed?: ManagedSettingMetadata;
  ariaLabel: string;
}) {
  const { hidden: hiddenSettings } = useHiddenSettings();
  const isManaged = managed?.managed === true;
  if (hiddenSettings.has(experimentalSettingKey(settingKey))) return null;
  return (
    <Card className="block bg-transparent p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            {isManaged ? <ManagedByCloudBadge /> : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          {footnote ? <p className="max-w-2xl text-xs text-muted-foreground">{footnote}</p> : null}
        </div>
        <ToggleSwitch
          checked={checked}
          onCheckedChange={(next) => {
            if (isManaged) return;
            onCheckedChange(next);
          }}
          disabled={disabled || isManaged}
          aria-label={ariaLabel}
        />
      </div>
    </Card>
  );
}

export function InstanceExperimentalSettings() {
  const { t } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: t("ui.breadcrumb_settings"), href: "/company/settings" },
      { label: t("ui.breadcrumb_experimental") },
    ]);
  }, [setBreadcrumbs]);

  const experimentalQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });

  const toggleMutation = useMutation<
    InstanceExperimentalSettingsWithManaged,
    Error,
    PatchInstanceExperimentalSettings,
    { previousSettings?: InstanceExperimentalSettingsWithManaged }
  >({
    mutationFn: async (patch: PatchInstanceExperimentalSettings) =>
      instanceSettingsApi.updateExperimental(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.instance.experimentalSettings });
      const previousSettings = queryClient.getQueryData<InstanceExperimentalSettingsWithManaged>(
        queryKeys.instance.experimentalSettings,
      );
      if (previousSettings) {
        queryClient.setQueryData<InstanceExperimentalSettingsWithManaged>(
          queryKeys.instance.experimentalSettings,
          { ...previousSettings, ...patch },
        );
      }
      return { previousSettings };
    },
    onSuccess: async (updatedSettings) => {
      setActionError(null);
      queryClient.setQueryData(queryKeys.instance.experimentalSettings, updatedSettings);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.instance.experimentalSettings }),
        queryClient.invalidateQueries({ queryKey: queryKeys.adapters.all }),
        queryClient.invalidateQueries({ queryKey: ["built-in-agents"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.health }),
      ]);
    },
    onError: (error, _patch, context) => {
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.instance.experimentalSettings, context.previousSettings);
      }
      setActionError(error instanceof Error ? error.message : "Failed to update experimental settings.");
    },
  });

  if (experimentalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading experimental settings...</div>;
  }

  if (experimentalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {experimentalQuery.error instanceof Error
          ? experimentalQuery.error.message
          : "Failed to load experimental settings."}
      </div>
    );
  }

  const inWorktree = isWorktreeRuntime();
  // Present only on cloud-managed instances: keys the managed overlay controls
  // render locked with the "Managed by Paperclip Cloud" badge. Self-hosted
  // responses carry no `managedKeys`, so every card stays editable.
  const managedKeys = experimentalQuery.data?.managedKeys ?? {};
  const enableWorktreeRunExecution = experimentalQuery.data?.enableWorktreeRunExecution === true;
  const worktreeRunExecutionManaged = managedKeys.enableWorktreeRunExecution?.managed === true;
  const worktreeRunExecutionState = resolveWorktreeRunExecutionDisplayState(
    experimentalQuery.data,
    getWorktreeInstanceId(),
  );
  const enableEnvironments = experimentalQuery.data?.enableEnvironments === true;
  const enableNativeRunner = experimentalQuery.data?.enableNativeRunner === true;
  const enableChatConnectors = experimentalQuery.data?.enableChatConnectors === true;
  const enableManagedSandboxOnly = experimentalQuery.data?.enableManagedSandboxOnly === true;
  const enableIsolatedWorkspaces = experimentalQuery.data?.enableIsolatedWorkspaces === true;
  // Streamlined left navigation is now the standard sidebar (PAP-12472); the
  // experimental opt-out was retired, so it no longer surfaces a toggle here.
  const enableStreamlinedUi = experimentalQuery.data?.enableStreamlinedUi !== false;
  const enableConferenceRoomChat = experimentalQuery.data?.enableConferenceRoomChat === true;
  const enableClassicTaskInterface = experimentalQuery.data?.enableClassicTaskInterface === true;
  const enableIssuePlanDecompositions =
    experimentalQuery.data?.enableIssuePlanDecompositions === true;
  const enableExperimentalFileViewer =
    experimentalQuery.data?.enableExperimentalFileViewer === true;
  const enableExternalObjects = experimentalQuery.data?.enableExternalObjects === true;
  const enableBuiltInAgents = experimentalQuery.data?.enableBuiltInAgents === true;
  const enableBetaSkills = experimentalQuery.data?.enableBetaSkills === true;
  const enableSummaries = experimentalQuery.data?.enableSummaries === true;
  const enableStatusCards = experimentalQuery.data?.enableStatusCards === true;
  const summariesManaged = managedKeys.enableSummaries?.managed === true;
  const statusCardsManaged = managedKeys.enableStatusCards?.managed === true;
  const statusCardsBlockedByManagedSummaries = summariesManaged && !enableSummaries;
  const summariesRequiredByManagedStatusCards = statusCardsManaged && enableStatusCards;
  const enableDecisions = experimentalQuery.data?.enableDecisions === true;
  const enableGoalsSidebarLink = experimentalQuery.data?.enableGoalsSidebarLink === true;
  const enableCases = experimentalQuery.data?.enableCases === true;
  const enableServerInfoDebugView = experimentalQuery.data?.enableServerInfoDebugView === true;
  const enablePaperclipDeveloperMode =
    experimentalQuery.data?.enablePaperclipDeveloperMode === true;
  const enableSimplifiedEnglishInteractions =
    experimentalQuery.data?.enableSimplifiedEnglishInteractions === true;
  const enableFirstTaskPlanProposal =
    experimentalQuery.data?.enableFirstTaskPlanProposal === true;
  const enableSmokeLab = experimentalQuery.data?.enableSmokeLab === true;
  const autoRestartDevServerWhenIdle = experimentalQuery.data?.autoRestartDevServerWhenIdle === true;
  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("ui.breadcrumb_experimental")}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("ui.experimental_description")}
        </p>
      </div>

      <div
        role="alert"
        className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">{t("ui.experimental_warning_title")}</p>
            <p className="text-muted-foreground">
              {t("ui.experimental_warning_description")}
            </p>
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <section className="space-y-3" aria-labelledby="experimental-features-heading">
        <div className="space-y-1">
          <h2 id="experimental-features-heading" className="text-sm font-semibold">
            {t("ui.experimental_features_heading")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("ui.experimental_features_description")}
          </p>
        </div>

        <ExperimentalToggleCard
          title={t("ui.exp_beta_skills_title")}
          description={t("ui.exp_beta_skills_desc")}
          checked={enableBetaSkills}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBetaSkills: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBetaSkills"
          managed={managedKeys.enableBetaSkills}
          ariaLabel="Toggle beta skills experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_builtin_agents_title")}
          description={t("ui.exp_builtin_agents_desc")}
          checked={enableBuiltInAgents}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableBuiltInAgents: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableBuiltInAgents"
          managed={managedKeys.enableBuiltInAgents}
          ariaLabel="Toggle built-in agents experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_cases_title")}
          description={t("ui.exp_cases_desc")}
          footnote={t("ui.exp_cases_footnote")}
          checked={enableCases}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableCases: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableCases"
          managed={managedKeys.enableCases}
          ariaLabel="Toggle cases experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_chat_connectors_title")}
          description={t("ui.exp_chat_connectors_desc")}
          footnote={t("ui.exp_chat_connectors_footnote")}
          checked={enableChatConnectors}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableChatConnectors: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableChatConnectors"
          managed={managedKeys.enableChatConnectors}
          ariaLabel="Toggle chat connectors experimental setting"
        />

        {SHOW_CONFERENCE_ROOM_EXPERIMENTAL_SETTING ? (
          <ExperimentalToggleCard
            title={t("ui.exp_conference_room_title")}
            description={t("ui.exp_conference_room_desc")}
            checked={enableConferenceRoomChat}
            onCheckedChange={(checked) => toggleMutation.mutate({ enableConferenceRoomChat: checked })}
            disabled={toggleMutation.isPending}
            settingKey="enableConferenceRoomChat"
            managed={managedKeys.enableConferenceRoomChat}
            ariaLabel="Toggle conference room chat experimental setting"
          />
        ) : null}

        <ExperimentalToggleCard
          title={t("ui.exp_decisions_title")}
          description={t("ui.exp_decisions_desc")}
          checked={enableDecisions}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableDecisions: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableDecisions"
          managed={managedKeys.enableDecisions}
          ariaLabel="Toggle decisions experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_environments_title")}
          description={t("ui.exp_environments_desc")}
          checked={enableEnvironments}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableEnvironments: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableEnvironments"
          managed={managedKeys.enableEnvironments}
          ariaLabel="Toggle environments experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_external_objects_title")}
          description={t("ui.exp_external_objects_desc")}
          checked={enableExternalObjects}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExternalObjects: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExternalObjects"
          managed={managedKeys.enableExternalObjects}
          ariaLabel="Toggle external objects experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_isolated_workspaces_title")}
          description={t("ui.exp_isolated_workspaces_desc")}
          checked={enableIsolatedWorkspaces}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableIsolatedWorkspaces: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableIsolatedWorkspaces"
          managed={managedKeys.enableIsolatedWorkspaces}
          ariaLabel="Toggle isolated workspaces experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_file_viewer_title")}
          description={t("ui.exp_file_viewer_desc")}
          checked={enableExperimentalFileViewer}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableExperimentalFileViewer: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableExperimentalFileViewer"
          managed={managedKeys.enableExperimentalFileViewer}
          ariaLabel="Toggle experimental file viewer setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_paperclip_runner_title")}
          description={t("ui.exp_paperclip_runner_desc")}
          checked={enableNativeRunner}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableNativeRunner: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableNativeRunner"
          managed={managedKeys.enableNativeRunner}
          ariaLabel="Toggle Paperclip Runner experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_simplified_english_title")}
          description={t("ui.exp_simplified_english_desc")}
          checked={enableSimplifiedEnglishInteractions}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableSimplifiedEnglishInteractions: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableSimplifiedEnglishInteractions"
          managed={managedKeys.enableSimplifiedEnglishInteractions}
          ariaLabel="Toggle simplified english interactions experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_first_task_plan_title")}
          description={t("ui.exp_first_task_plan_desc")}
          checked={enableFirstTaskPlanProposal}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableFirstTaskPlanProposal: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableFirstTaskPlanProposal"
          managed={managedKeys.enableFirstTaskPlanProposal}
          ariaLabel="Toggle first task plan proposal experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_status_cards_title")}
          description={t("ui.exp_status_cards_desc")}
          footnote="Enabling Status Cards also enables Summaries."
          checked={enableStatusCards}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked
                ? { enableSummaries: true, enableStatusCards: true }
                : { enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || statusCardsBlockedByManagedSummaries}
          settingKey="enableStatusCards"
          managed={managedKeys.enableStatusCards}
          ariaLabel="Toggle status cards experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_streamlined_ui_title")}
          description={t("ui.exp_streamlined_ui_desc")}
          footnote={t("ui.exp_streamlined_ui_footnote")}
          checked={enableStreamlinedUi}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableStreamlinedUi: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableStreamlinedUi"
          managed={managedKeys.enableStreamlinedUi}
          ariaLabel="Toggle Streamlined UI experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_summaries_title")}
          description={t("ui.exp_summaries_desc")}
          footnote="Status Cards requires Summaries. Disabling Summaries also disables Status Cards."
          checked={enableSummaries}
          onCheckedChange={(checked) =>
            toggleMutation.mutate(
              checked || !enableStatusCards
                ? { enableSummaries: checked }
                : { enableSummaries: false, enableStatusCards: false },
            )
          }
          disabled={toggleMutation.isPending || summariesRequiredByManagedStatusCards}
          settingKey="enableSummaries"
          managed={managedKeys.enableSummaries}
          ariaLabel="Toggle summaries experimental setting"
        />

      </section>

      <section className="space-y-3" aria-labelledby="developer-mode-heading">
        <div className="space-y-1">
          <h2 id="developer-mode-heading" className="text-sm font-semibold">
            Paperclip Developer Mode
          </h2>
          <p className="text-sm text-muted-foreground">
            Internal tools for developing, testing, and debugging Paperclip.
          </p>
        </div>

        <ExperimentalToggleCard
          title={t("ui.exp_developer_mode_title")}
          description={t("ui.exp_developer_mode_desc")}
          checked={enablePaperclipDeveloperMode}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enablePaperclipDeveloperMode: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enablePaperclipDeveloperMode"
          managed={managedKeys.enablePaperclipDeveloperMode}
          ariaLabel="Toggle Paperclip developer mode experimental setting"
        />

        <ExperimentalToggleCard
          title={t("ui.exp_managed_sandbox_title")}
          description={t("ui.exp_managed_sandbox_desc")}
          checked={enableManagedSandboxOnly}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableManagedSandboxOnly: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableManagedSandboxOnly"
          managed={managedKeys.enableManagedSandboxOnly}
          ariaLabel="Toggle managed environment only experimental setting"
        />

        {inWorktree ? (
          <Card className="block bg-transparent p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">Run tasks in this worktree</h3>
                    {worktreeRunExecutionManaged ? <ManagedByCloudBadge /> : null}
                  </div>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    This is an isolated git-worktree preview instance. Turn this on to let the scheduler execute runs
                    here. Only tasks created after enabling will run automatically — copied/pre-existing tasks stay
                    parked. Toggling off and on resets the cutoff.
                  </p>
                </div>
                <ToggleSwitch
                  checked={enableWorktreeRunExecution}
                  onCheckedChange={(checked) => {
                    if (worktreeRunExecutionManaged) return;
                    toggleMutation.mutate({ enableWorktreeRunExecution: checked });
                  }}
                  disabled={toggleMutation.isPending || worktreeRunExecutionManaged}
                  aria-label="Toggle worktree run execution setting"
                />
              </div>

              {worktreeRunExecutionState.kind === "armed" ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-foreground">
                  <Play className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    Running tasks created after{" "}
                    <span className="font-medium">
                      {formatActivationTimestamp(worktreeRunExecutionState.activatedAt)}
                    </span>
                    .
                  </span>
                </div>
              ) : null}

              {worktreeRunExecutionState.kind === "fail_closed" ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">Execution is suppressed — effectively off.</p>
                    <p className="text-muted-foreground">
                      {worktreeRunExecutionState.reason === "instance_mismatch"
                        ? "This setting was armed in a different instance and copied here, so no tasks run automatically."
                        : "This setting is missing its activation cutoff, so no tasks run automatically."}{" "}
                      Toggle it off and back on to arm execution for tasks created here.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <ExperimentalToggleCard
          title="Auto-Restart Dev Server When Idle"
          description="In `pnpm dev:once`, wait for all queued and running local agent runs to finish, then restart the server automatically when backend changes or migrations make the current boot stale."
          checked={autoRestartDevServerWhenIdle}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ autoRestartDevServerWhenIdle: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="autoRestartDevServerWhenIdle"
          managed={managedKeys.autoRestartDevServerWhenIdle}
          ariaLabel="Toggle guarded dev-server auto-restart"
        />

        <ExperimentalToggleCard
          title="Server Info Debug View"
          description='Show a "Server" section in the account drawer with the current server restart time and running commit.'
          checked={enableServerInfoDebugView}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableServerInfoDebugView: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableServerInfoDebugView"
          managed={managedKeys.enableServerInfoDebugView}
          ariaLabel="Toggle server info debug view experimental setting"
        />

        <ExperimentalToggleCard
          title="Smoke Lab"
          description='Add a "Smoke Lab" tab under Apps → Developer and an "Integration smoke" card on the dashboard for exercising every integration path against deterministic local fixtures (fake OAuth provider + loopback MCP servers). Private (non-public) deployments only.'
          checked={enableSmokeLab}
          onCheckedChange={(checked) => toggleMutation.mutate({ enableSmokeLab: checked })}
          disabled={toggleMutation.isPending}
          settingKey="enableSmokeLab"
          managed={managedKeys.enableSmokeLab}
          ariaLabel="Toggle smoke lab experimental setting"
        />

        <ExperimentalToggleCard
          title="Task Plan Decomposition"
          description="Show accepted-plan decomposition history on task detail pages. Intended for debugging and validating subtask creation behavior while the presentation is still being refined."
          checked={enableIssuePlanDecompositions}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableIssuePlanDecompositions: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableIssuePlanDecompositions"
          managed={managedKeys.enableIssuePlanDecompositions}
          ariaLabel="Toggle task plan decomposition panel experimental setting"
        />
      </section>

      <section className="space-y-3" aria-labelledby="legacy-heading">
        <div className="space-y-1">
          <h2 id="legacy-heading" className="text-sm font-semibold">
            Legacy
          </h2>
          <p className="text-sm text-muted-foreground">These features are going to be removed.</p>
        </div>

        <ExperimentalToggleCard
          title="Classic Task Interface"
          description="Restores the previous task detail page: the page-level header with inline description editing, the plain comment thread, and the fixed Properties sidebar. Chat-only features — streaming activity folding, inline plan and question cards, the three-mode composer — are unavailable in the classic view."
          footnote="Switching takes effect immediately. No task data is affected."
          checked={enableClassicTaskInterface}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableClassicTaskInterface: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableClassicTaskInterface"
          managed={managedKeys.enableClassicTaskInterface}
          ariaLabel="Toggle classic task interface experimental setting"
        />

        <ExperimentalToggleCard
          title="Goals Sidebar Link"
          description="Restore the Goals item in the main sidebar while the goals surface is being evaluated."
          checked={enableGoalsSidebarLink}
          onCheckedChange={(checked) =>
            toggleMutation.mutate({ enableGoalsSidebarLink: checked })
          }
          disabled={toggleMutation.isPending}
          settingKey="enableGoalsSidebarLink"
          managed={managedKeys.enableGoalsSidebarLink}
          ariaLabel="Toggle goals sidebar link experimental setting"
        />
      </section>
    </div>
  );
}
