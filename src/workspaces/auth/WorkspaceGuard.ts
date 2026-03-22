import type { WorkspaceAuthRule, AuthCheckContext, CredentialInput } from "../types";

interface GuardConfig {
  isAuthenticated: () => boolean | Promise<boolean>;
  credentialInput?: CredentialInput;
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

  async evaluate(rule: WorkspaceAuthRule, context: AuthCheckContext): Promise<boolean> {
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
        const input = this.config.credentialInput ?? { username: "", password: "" };
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
