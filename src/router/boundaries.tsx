import React, { Component, Suspense } from "react";
import { isNotFoundError } from "../utils/notFound";
import type { RouteErrorProps } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteBoundaryProps {
  path: string;
  children: React.ReactNode;
  loading?: React.ComponentType | React.ReactNode;
  defaultLoading?: React.ComponentType | React.ReactNode;
  error?: React.ComponentType<RouteErrorProps>;
  defaultError?: React.ComponentType<RouteErrorProps>;
  onNotFound: () => void;
}

// ─── ErrorBoundary (class component — required by React) ─────────────────────

interface ErrorBoundaryState {
  error: Error | null;
  isNotFound: boolean;
}

interface ErrorBoundaryProps {
  path: string;
  error?: React.ComponentType<RouteErrorProps>;
  defaultError?: React.ComponentType<RouteErrorProps>;
  onNotFound: () => void;
  children: React.ReactNode;
}

class RouteErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, isNotFound: false };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    if (isNotFoundError(error)) {
      return { error: null, isNotFound: true };
    }
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      isNotFound: false,
    };
  }

  componentDidCatch(error: unknown): void {
    // Fire the notFound callback here where we have access to the raw thrown value.
    if (isNotFoundError(error)) {
      this.props.onNotFound();
    }
  }

  reset(): void {
    this.setState({ error: null, isNotFound: false });
  }

  render(): React.ReactNode {
    const { error, isNotFound } = this.state;

    // notFound() — render nothing here; onNotFound callback has been fired.
    if (isNotFound) return null;

    if (error !== null) {
      const { path } = this.props;
      const ErrorComponent =
        this.props.error ?? this.props.defaultError ?? DefaultErrorDisplay;
      return <ErrorComponent error={error} reset={this.reset} path={path} />;
    }

    return this.props.children;
  }
}

// ─── Default minimal error display ───────────────────────────────────────────

function DefaultErrorDisplay({ error, reset }: RouteErrorProps): React.ReactElement {
  return (
    <div role="alert" style={{ padding: "1rem", border: "1px solid red" }}>
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  );
}

// ─── RouteBoundary ────────────────────────────────────────────────────────────

/**
 * Wraps a single route component with:
 *  - A Suspense boundary (loading fallback resolution order: route → default → null)
 *  - An error boundary (error fallback resolution order: route → default → library minimal)
 *  - notFound() sentinel detection (calls onNotFound, does not show error UI)
 */
export function RouteBoundary({
  path,
  children,
  loading,
  defaultLoading,
  error,
  defaultError,
  onNotFound,
}: RouteBoundaryProps): React.ReactElement {
  const loadingFallback = resolveLoading(loading ?? defaultLoading);

  const errorBoundaryProps: ErrorBoundaryProps = { path, onNotFound, children: null };
  if (error !== undefined) errorBoundaryProps.error = error;
  if (defaultError !== undefined) errorBoundaryProps.defaultError = defaultError;

  return (
    <RouteErrorBoundary {...errorBoundaryProps}>
      <Suspense fallback={loadingFallback}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveLoading(loading: React.ComponentType | React.ReactNode): React.ReactNode {
  if (loading === undefined || loading === null) return null;
  if (typeof loading === "function") {
    const LoadingComponent = loading as React.ComponentType;
    return <LoadingComponent />;
  }
  return loading as React.ReactNode;
}
