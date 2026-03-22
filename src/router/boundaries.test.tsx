import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { Suspense } from "react";
import { RouteBoundary } from "./boundaries";
import { notFound } from "../utils/notFound";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

// ─── Suspense ─────────────────────────────────────────────────────────────────

describe("RouteBoundary: Suspense", () => {
  it("shows loading fallback while suspended", async () => {
    const { promise } = defer<void>();
    // Component throws a Promise — suspended. RouteBoundary must catch it with its Suspense.
    const Suspended = () => { throw promise; };
    const { unmount } = render(
      <RouteBoundary
        path="/test"
        loading={<div>Loading...</div>}
        onNotFound={() => {}}
      >
        <Suspended />
      </RouteBoundary>,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    unmount();
  });

  it("shows component content after resolution", async () => {
    const { promise, resolve } = defer<void>();
    let resolved = false;
    const Async = () => {
      if (!resolved) throw promise;
      return <div>Loaded</div>;
    };
    render(
      <RouteBoundary path="/test" onNotFound={() => {}}>
        <Async />
      </RouteBoundary>,
    );
    resolved = true;
    resolve();
    await waitFor(() => expect(screen.getByText("Loaded")).toBeInTheDocument());
  });

  it("uses route-level loading fallback", async () => {
    const { promise } = defer<void>();
    const Suspended = () => { throw promise; };
    const { unmount } = render(
      <RouteBoundary
        path="/test"
        loading={<div>Route loading</div>}
        defaultLoading={<div>Default loading</div>}
        onNotFound={() => {}}
      >
        <Suspended />
      </RouteBoundary>,
    );
    expect(screen.getByText("Route loading")).toBeInTheDocument();
    unmount();
  });

  it("falls back to defaultLoading when no route-level loading", async () => {
    const { promise } = defer<void>();
    const Suspended = () => { throw promise; };
    const { unmount } = render(
      <RouteBoundary
        path="/test"
        defaultLoading={<div>Default loading</div>}
        onNotFound={() => {}}
      >
        <Suspended />
      </RouteBoundary>,
    );
    expect(screen.getByText("Default loading")).toBeInTheDocument();
    unmount();
  });

  it("renders nothing (null) when neither loading nor defaultLoading is declared", async () => {
    const { promise } = defer<void>();
    const Suspended = () => { throw promise; };
    const { container, unmount } = render(
      <RouteBoundary path="/test" onNotFound={() => {}}>
        <Suspended />
      </RouteBoundary>,
    );
    expect(container.firstChild).toBeNull();
    unmount();
  });
});

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

describe("RouteBoundary: ErrorBoundary", () => {
  it("shows error fallback when a component throws", () => {
    const Throws = () => { throw new Error("oops"); };
    const ErrorUI = ({ error }: { error: Error; reset: () => void; path: string }) => (
      <div>Error: {error.message}</div>
    );
    render(
      <RouteBoundary path="/test" error={ErrorUI} onNotFound={() => {}}>
        <Throws />
      </RouteBoundary>,
    );
    expect(screen.getByText("Error: oops")).toBeInTheDocument();
  });

  it("reset() clears the boundary and re-renders the component", async () => {
    let shouldThrow = true;
    const Volatile = () => {
      if (shouldThrow) throw new Error("temporary");
      return <div>Recovered</div>;
    };
    const ErrorUI = ({ reset }: { error: Error; reset: () => void; path: string }) => (
      <button onClick={reset}>Reset</button>
    );
    render(
      <RouteBoundary path="/test" error={ErrorUI} onNotFound={() => {}}>
        <Volatile />
      </RouteBoundary>,
    );
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByText("Recovered")).toBeInTheDocument());
  });

  it("falls back to library minimal error display when no error boundary declared", () => {
    const Throws = () => { throw new Error("boom"); };
    render(
      <RouteBoundary path="/test" onNotFound={() => {}}>
        <Throws />
      </RouteBoundary>,
    );
    // Library minimal display shows the error message
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("uses defaultError when no route-level error is declared", () => {
    const Throws = () => { throw new Error("whoops"); };
    const DefaultError = ({ error }: { error: Error; reset: () => void; path: string }) => (
      <div>Default: {error.message}</div>
    );
    render(
      <RouteBoundary path="/test" defaultError={DefaultError} onNotFound={() => {}}>
        <Throws />
      </RouteBoundary>,
    );
    expect(screen.getByText("Default: whoops")).toBeInTheDocument();
  });

  it("route-level error overrides defaultError", () => {
    const Throws = () => { throw new Error("err"); };
    const RouteError = () => <div>Route error</div>;
    const DefaultError = () => <div>Default error</div>;
    render(
      <RouteBoundary path="/test" error={RouteError} defaultError={DefaultError} onNotFound={() => {}}>
        <Throws />
      </RouteBoundary>,
    );
    expect(screen.getByText("Route error")).toBeInTheDocument();
    expect(screen.queryByText("Default error")).toBeNull();
  });

  it("error in one boundary does not affect an independent boundary", () => {
    const Throws = () => { throw new Error("isolated"); };
    const Safe = () => <div>Safe</div>;
    render(
      <div>
        <RouteBoundary path="/a" onNotFound={() => {}}><Throws /></RouteBoundary>
        <RouteBoundary path="/b" onNotFound={() => {}}><Safe /></RouteBoundary>
      </div>,
    );
    expect(screen.getByText("Safe")).toBeInTheDocument();
  });
});

// ─── notFound() ───────────────────────────────────────────────────────────────

describe("RouteBoundary: notFound() sentinel", () => {
  it("calls onNotFound when a component throws the notFound sentinel", () => {
    const onNotFound = vi.fn();
    const NotFoundComponent = () => { notFound(); };
    render(
      <RouteBoundary path="/camera/missing" onNotFound={onNotFound}>
        <NotFoundComponent />
      </RouteBoundary>,
    );
    expect(onNotFound).toHaveBeenCalledOnce();
  });

  it("does NOT render the route-level error boundary for notFound()", () => {
    const ErrorUI = () => <div>Error UI</div>;
    const NotFoundComponent = () => { notFound(); };
    render(
      <RouteBoundary path="/test" error={ErrorUI} onNotFound={() => {}}>
        <NotFoundComponent />
      </RouteBoundary>,
    );
    expect(screen.queryByText("Error UI")).toBeNull();
  });
});
