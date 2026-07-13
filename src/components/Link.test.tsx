import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { Link } from "./Link";
import { RouterTestProvider } from "../test-utils/RouterTestProvider";
import { defineRoutes } from "../router/RouteRegistry";
import { useLocation } from "../router/hooks";

// ─── Setup ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stub: React.ComponentType<any> = ({ outlet }) => <div>{outlet}</div>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CameraStub: React.ComponentType<any> = ({ outlet }) => <div>{outlet}</div>;

const routes = defineRoutes({
  "/":           { component: Stub },
  "/settings":   { component: Stub },
  "/camera/:id": { component: CameraStub },
});

function Wrapper({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <RouterTestProvider routes={routes} initialPath={path}>
      {children}
    </RouterTestProvider>
  );
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("Link: rendering", () => {
  it("renders an <a> element", () => {
    render(
      <Link to="/settings">Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  it("builds href from route key and params", () => {
    render(
      <Link to="/camera/:id" params={{ id: "cam-4" }}>Cam</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/camera/cam-4");
  });

  it("renders href for param-less route", () => {
    render(
      <Link to="/">Home</Link>,
      { wrapper: ({ children }) => <Wrapper path="/settings">{children}</Wrapper> },
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/");
  });

  it("renders plain <a> when href prop is used (escape hatch)", () => {
    render(
      <Link href="https://example.com">External</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    const a = screen.getByRole("link");
    expect(a).toHaveAttribute("href", "https://example.com");
  });
});

// ─── Click behaviour ──────────────────────────────────────────────────────────

describe("Link: click behaviour", () => {
  it("normal click calls navigate and prevents default", async () => {
    const user = userEvent.setup();
    render(
      <Link to="/settings">Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    await user.click(screen.getByRole("link"));
    expect(window.location.pathname).toBe("/settings");
  });

  it("Cmd+click does not call navigate", async () => {
    const user = userEvent.setup();
    render(
      <Link to="/settings">Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("link"));
    await user.keyboard("{/Meta}");
    expect(window.location.pathname).toBe("/");
  });

  it("Ctrl+click does not call navigate", async () => {
    const user = userEvent.setup();
    render(
      <Link to="/settings">Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("link"));
    await user.keyboard("{/Control}");
    expect(window.location.pathname).toBe("/");
  });

  it("Shift+click does not call navigate", async () => {
    const user = userEvent.setup();
    render(
      <Link to="/settings">Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("link"));
    await user.keyboard("{/Shift}");
    expect(window.location.pathname).toBe("/");
  });
});

// ─── Active state ─────────────────────────────────────────────────────────────

describe("Link: active state", () => {
  it("applies activeClassName when route is matched (exact)", () => {
    render(
      <Link to="/settings" activeClassName="active">Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/settings">{children}</Wrapper> },
    );
    expect(screen.getByRole("link")).toHaveClass("active");
  });

  it("applies exactActiveClassName only on exact match", () => {
    render(
      <Link to="/settings" exactActiveClassName="exact-active">Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/settings">{children}</Wrapper> },
    );
    expect(screen.getByRole("link")).toHaveClass("exact-active");
  });

  it("applies activeClassName for ancestor match (not exact)", () => {
    render(
      <Link to="/settings" activeClassName="active" exactActiveClassName="exact-active">Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/settings/profile">{children}</Wrapper> },
    );
    const link = screen.getByRole("link");
    expect(link).toHaveClass("active");
    expect(link).not.toHaveClass("exact-active");
  });

  it("does not apply activeClassName when route is not matched", () => {
    render(
      <Link to="/settings" activeClassName="active">Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    expect(screen.getByRole("link")).not.toHaveClass("active");
  });

  it("applies activeStyle when matched", () => {
    render(
      <Link to="/settings" activeStyle={{ fontWeight: "bold" }}>Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/settings">{children}</Wrapper> },
    );
    expect(screen.getByRole("link")).toHaveStyle({ fontWeight: "bold" });
  });

  it("applies exactActiveStyle only on exact match", () => {
    render(
      <Link to="/settings" exactActiveStyle={{ textDecoration: "underline" }}>Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/settings">{children}</Wrapper> },
    );
    expect(screen.getByRole("link")).toHaveStyle({ textDecoration: "underline" });
  });
});

// ─── replace / state props ────────────────────────────────────────────────────

describe("Link: replace and state props", () => {
  it("calls navigate with replace: true when replace prop is set", async () => {
    const user = userEvent.setup();
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    render(
      <Link to="/settings" replace>Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    await user.click(screen.getByRole("link"));
    expect(replaceSpy).toHaveBeenCalled();
    replaceSpy.mockRestore();
  });
});

// ─── anchor attribute passthrough (pre-adoption plan item 1) ─────────────────

describe("Link: anchor attribute passthrough", () => {
  it("forwards arbitrary anchor props (target, data-*, aria-*) to the DOM", () => {
    render(
      <Link to="/settings" target="_blank" data-testid="my-link" aria-label="go-settings">
        Settings
      </Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    const a = screen.getByTestId("my-link");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("aria-label", "go-settings");
  });

  it("fires the user's onTouchStart handler", () => {
    const onTouchStart = vi.fn();
    render(
      <Link to="/settings" onTouchStart={onTouchStart}>Settings</Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    fireEvent.touchStart(screen.getByRole("link"));
    expect(onTouchStart).toHaveBeenCalledOnce();
  });

  it("runs the user's onClick before navigating", async () => {
    const order: string[] = [];
    const onClick = vi.fn(() => order.push("user-onClick"));
    render(
      <>
        <Link to="/settings" onClick={onClick}>Settings</Link>
        <PathProbe onPath={(p) => order.push(`path:${p}`)} />
      </>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    await userEvent.click(screen.getByRole("link"));
    expect(order[0]).toBe("path:/");
    expect(order).toContain("user-onClick");
    expect(order[order.length - 1]).toBe("path:/settings");
    expect(order.indexOf("user-onClick")).toBeLessThan(order.indexOf("path:/settings"));
  });

  it("preventDefault() in the user's onClick blocks router navigation", async () => {
    let currentPath = "";
    render(
      <>
        <Link to="/settings" onClick={(e) => e.preventDefault()}>Settings</Link>
        <PathProbe onPath={(p) => { currentPath = p; }} />
      </>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    await userEvent.click(screen.getByRole("link"));
    expect(currentPath).toBe("/");
  });

  it("href escape hatch forwards anchor props and handlers", async () => {
    const onClick = vi.fn();
    render(
      <Link href="https://example.com" target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); onClick(); }}>
        External
      </Link>,
      { wrapper: ({ children }) => <Wrapper path="/">{children}</Wrapper> },
    );
    const a = screen.getByRole("link");
    expect(a).toHaveAttribute("rel", "noreferrer");
    await userEvent.click(a);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

// Reports the router's current path on every render.
function PathProbe({ onPath }: { onPath: (path: string) => void }) {
  const { path } = useLocation();
  onPath(path);
  return null;
}
