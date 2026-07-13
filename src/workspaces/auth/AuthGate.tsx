import React, { useState } from "react";
import { useAppConfig } from "../../provider/context";
import { useWorkspaceManagerContext, useWorkspaceTemplates } from "../context";
import type {
  AuthGateProps,
  CredentialInput,
  WorkspaceChannel,
  WorkspaceDescriptor,
} from "../types";

// ─── CredentialForm ───────────────────────────────────────────────────────────

/**
 * Minimal unstyled username/password form (spec §15.4: semantic, accessible
 * markup only — the consuming app is responsible for all styling).
 */
export function CredentialForm({
  label,
  onSubmit,
  onCancel,
}: {
  label: string;
  onSubmit: (input: CredentialInput) => void;
  onCancel?: () => void;
}): React.ReactElement {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      aria-label={label}
      data-component="credential-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ username, password });
      }}
    >
      <label>
        Username
        <input
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button type="submit">Submit</button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}

// ─── DefaultAuthGate ──────────────────────────────────────────────────────────

/**
 * Built-in gate rendered in place of a workspace whose direct-access auth
 * failed (spec §6.4). Credential rules get the credential form; other rules
 * get a retry affordance.
 */
export function DefaultAuthGate({
  workspace,
  authRule,
  retry,
}: AuthGateProps): React.ReactElement {
  if (authRule.type === "credential") {
    return (
      <CredentialForm
        label={`Credentials required for ${workspace.title}`}
        onSubmit={(input) => {
          void retry(input);
        }}
      />
    );
  }
  return (
    <div role="alert" data-component="auth-gate">
      <p>Access to {workspace.title} requires authorization.</p>
      <button onClick={() => void retry()}>Retry</button>
    </div>
  );
}

// ─── GatedWorkspaceContent ────────────────────────────────────────────────────

/**
 * Renders the workspace component when its auth is granted; otherwise renders
 * the AuthGate (custom via AppConfig.components.AuthGate, or the built-in).
 * Used by all containers.
 */
export function GatedWorkspaceContent({
  workspace,
  channel,
  Component,
}: {
  workspace: WorkspaceDescriptor;
  channel: WorkspaceChannel;
  Component: React.ComponentType<{
    workspace: WorkspaceDescriptor;
    channel: WorkspaceChannel;
  }>;
}): React.ReactElement {
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  const { AuthGate } = useAppConfig();

  if (workspace.auth.granted) {
    return <Component workspace={workspace} channel={channel} />;
  }

  const authRule = templates[workspace.template]?.auth ?? { type: "public" as const };
  const Gate = AuthGate ?? DefaultAuthGate;
  return (
    <Gate
      workspace={workspace}
      authRule={authRule}
      retry={(input) => manager.retryAuth(workspace.id, input)}
    />
  );
}
