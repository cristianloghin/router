import type { WorkspaceAuthRule, AuthCheckContext, CredentialInput } from "../types";

interface GuardConfig {
  isAuthenticated: () => boolean | Promise<boolean>;
  /** Fixed credential input — takes precedence over requestCredential (testing seam). */
  credentialInput?: CredentialInput;
  /**
   * Asks the user for credentials (the library's built-in dialog, wired by
   * AppProvider). Resolving null means the user cancelled → auth fails.
   */
  requestCredential?: (workspaceId: string) => Promise<CredentialInput | null>;
}

// ─── WorkspaceGuard ───────────────────────────────────────────────────────────

/**
 * Evaluates workspace auth rules.
 * Called by WorkspaceManager before open() proceeds and on direct URL access.
 */
export class WorkspaceGuard {
  private config: GuardConfig;

  constructor(config: GuardConfig) {
    this.config = config;
  }

  async evaluate(
    rule: WorkspaceAuthRule,
    context: AuthCheckContext,
    credentialOverride?: CredentialInput,
  ): Promise<boolean> {
    switch (rule.type) {
      case "public":
        return true;

      case "authenticated": {
        const result = await Promise.resolve(this.config.isAuthenticated());
        return result;
      }

      case "time-limited": {
        const expiresAt =
          typeof rule.expiresAt === "function" ? rule.expiresAt() : rule.expiresAt;
        return Date.now() < expiresAt;
      }

      case "credential": {
        const input =
          credentialOverride ??
          this.config.credentialInput ??
          (this.config.requestCredential
            ? await this.config.requestCredential(context.workspaceId)
            : { username: "", password: "" });
        if (input === null) return false;
        const result = await Promise.resolve(rule.validate(input));
        return result;
      }

      case "custom": {
        try {
          const result = await Promise.resolve(rule.check(context));
          return result;
        } catch {
          return false;
        }
      }
    }
  }
}
