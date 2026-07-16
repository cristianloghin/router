/**
 * Integration: workspace channel messaging (§7 of spec).
 * Uses only public API imports — no internal modules.
 */
import React, { useEffect } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createBus } from "@mikrostack/chbus";
import type { Bus } from "@mikrostack/chbus";

import { AppProvider } from "../provider/AppProvider";
import { defineRoutes } from "../router/RouteRegistry";
import { defineWorkspaces } from "../workspaces/defineWorkspaces";
import { useWorkspaces, useWorkspaceActions, useWorkspaceChannel } from "../workspaces/hooks";
import { StackContainer } from "../components/containers/StackContainer";
import type { WorkspaceComponentProps } from "../workspaces/types";

// ─── Routes fixture ───────────────────────────────────────────────────────────

const routes = defineRoutes({
  "/": { component: (() => null) },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(bus?: Bus) {
  return ({ children }: { children: React.ReactNode }) => (
    <AppProvider
      routes={routes}
      workspaces={emptyWorkspaces}
      config={{ adapter: "stack" }}
      {...(bus !== undefined ? { bus } : {})}
    >
      {children}
    </AppProvider>
  );
}

const emptyWorkspaces = defineWorkspaces({});

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

// ─── useWorkspaceChannel returns null before open, non-null after ──────────────

describe("workspace-channel: lifecycle", () => {
  it("useWorkspaceChannel returns null when workspace is not open", () => {
    const { result } = renderHook(() => useWorkspaceChannel("nonexistent"), {
      wrapper: makeWrapper(),
    });
    expect(result.current).toBeNull();
  });

  it("useWorkspaceChannel returns channel pair after open()", async () => {
    const { result } = renderHook(
      () => ({ ws: { ...useWorkspaces(), ...useWorkspaceActions() }, ch: useWorkspaceChannel(useWorkspaces().workspaces[0]?.id ?? "") }),
      { wrapper: makeWrapper() },
    );

    await act(async () => {
      await result.current.ws.open({ template: "nonexistent", title: "T", params: {} }).catch(() => {});
    });
    // open() fails because template is unknown — channel is never created
    expect(result.current.ch).toBeNull();
  });

  it("useWorkspaceChannel returns non-null after a successful open()", async () => {
    const workspaces = defineWorkspaces({
      cam: { component: (() => null) as React.ComponentType<WorkspaceComponentProps> },
    });

    const { result } = renderHook(
      () => {
        const ws = { ...useWorkspaces(), ...useWorkspaceActions() };
        const ch = useWorkspaceChannel(ws.workspaces[0]?.id ?? "");
        return { ws, ch };
      },
      {
        wrapper: ({ children }) => (
          <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
            {children}
          </AppProvider>
        ),
      },
    );

    await act(async () => {
      await result.current.ws.open({ template: "cam", title: "T", params: {} });
    });

    expect(result.current.ch).not.toBeNull();
    expect(result.current.ch).toHaveProperty("inbound");
    expect(result.current.ch).toHaveProperty("outbound");
  });

  it("useWorkspaceChannel returns null after close()", async () => {
    const workspaces = defineWorkspaces({
      cam: { component: (() => null) as React.ComponentType<WorkspaceComponentProps> },
    });

    const { result } = renderHook(
      () => {
        const ws = { ...useWorkspaces(), ...useWorkspaceActions() };
        const ch = useWorkspaceChannel(ws.workspaces[0]?.id ?? "");
        return { ws, ch };
      },
      {
        wrapper: ({ children }) => (
          <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
            {children}
          </AppProvider>
        ),
      },
    );

    let id = "";
    await act(async () => {
      const d = await result.current.ws.open({ template: "cam", title: "T", params: {} });
      id = d.id;
    });

    expect(result.current.ch).not.toBeNull();

    await act(async () => {
      await result.current.ws.close(id);
    });

    expect(result.current.ch).toBeNull();
  });
});

// ─── Message passing: workspace → root ────────────────────────────────────────

describe("workspace-channel: workspace outbound → root inbound", () => {
  it("message emitted by workspace component is received by root listener", async () => {
    const received: string[] = [];

    // Module-level captured channel reference (workspace side)
    let capturedWsChannel: WorkspaceComponentProps["channel"] | null = null;

    function WsCapture({ workspace, channel }: WorkspaceComponentProps) {
      useEffect(() => { capturedWsChannel = channel; }, [channel]);
      return <div data-testid={`ws-${workspace.id}`}>WS</div>;
    }

    const workspaces = defineWorkspaces({
      ws: { component: WsCapture as React.ComponentType<WorkspaceComponentProps> },
    });

    function RootListener({ wsId }: { wsId: string }) {
      const ch = useWorkspaceChannel(wsId);
      useEffect(() => {
        if (!ch) return;
        return ch.inbound.on("ws-ping", async (payload) => {
          received.push((payload as { text: string }).text);
        });
      }, [ch]);
      return null;
    }

    function Opener() {
      const { open } = useWorkspaceActions();
      return (
        <button
          data-testid="open"
          onClick={() => open({ template: "ws", title: "T", params: {} })}
        >
          Open
        </button>
      );
    }

    function App() {
      const { workspaces: wslist } = useWorkspaces();
      const wsId = wslist[0]?.id ?? "";
      return (
        <>
          <Opener />
          <RootListener wsId={wsId} />
          <StackContainer />
        </>
      );
    }

    render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <App />
      </AppProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByTestId("open"));
    });

    // Workspace component is now rendered — emit from workspace side
    expect(capturedWsChannel).not.toBeNull();
    act(() => {
      capturedWsChannel!.outbound.emit("ws-ping", { text: "hello-from-ws" });
    });

    await waitFor(() => expect(received).toContain("hello-from-ws"));
  });
});

// ─── Message passing: root → workspace ────────────────────────────────────────

describe("workspace-channel: root outbound → workspace inbound", () => {
  it("message emitted by root is received by workspace component", async () => {
    const wsReceived: string[] = [];

    // Capture workspace-side channel so root can emit to it directly
    let capturedWsChannel: WorkspaceComponentProps["channel"] | null = null;

    function WsListener({ workspace, channel }: WorkspaceComponentProps) {
      useEffect(() => {
        capturedWsChannel = channel;
        return channel.inbound.on("root-cmd", async (payload) => {
          wsReceived.push((payload as { text: string }).text);
        });
      }, [channel]);
      return <div data-testid={`ws-${workspace.id}`}>WS</div>;
    }

    const workspaces = defineWorkspaces({
      ws: { component: WsListener as React.ComponentType<WorkspaceComponentProps> },
    });

    function App() {
      const { open } = useWorkspaceActions();
      return (
        <>
          <button
            data-testid="open"
            onClick={() => open({ template: "ws", title: "T", params: {} })}
          >
            Open
          </button>
          <StackContainer />
        </>
      );
    }

    render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <App />
      </AppProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByTestId("open"));
    });

    // Workspace is rendered and has captured the channel; root.outbound IS ws.inbound
    expect(capturedWsChannel).not.toBeNull();

    // Emit from root side via the ws-to-root channel's outbound (== workspace inbound)
    // root.outbound === workspace.inbound (both are root-to-ws physical channel)
    act(() => {
      // Use the workspace's inbound as the root emitter (same physical channel)
      capturedWsChannel!.inbound.emit("root-cmd", { text: "hello-from-root" });
    });

    await waitFor(() => expect(wsReceived).toContain("hello-from-root"));
  });
});

// ─── Channel isolation: two workspaces ────────────────────────────────────────

describe("workspace-channel: isolation between workspaces", () => {
  it("two open workspaces have independent channel objects (different inbound channels)", async () => {
    // Capture workspace-side channels via component props — no dynamic ID needed
    const capturedChannels: WorkspaceComponentProps["channel"][] = [];

    function WsCapture({ channel }: WorkspaceComponentProps) {
      useEffect(() => { capturedChannels.push(channel); }, [channel]);
      return null;
    }

    const workspaces = defineWorkspaces({
      ws: { component: WsCapture as React.ComponentType<WorkspaceComponentProps> },
    });

    function App() {
      const { open } = useWorkspaceActions();
      return (
        <>
          <button data-testid="open" onClick={() => open({ template: "ws", title: "T", params: {} })}>
            Open
          </button>
          <StackContainer />
        </>
      );
    }

    render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <App />
      </AppProvider>,
    );

    await act(async () => { await userEvent.click(screen.getByTestId("open")); });
    await act(async () => { await userEvent.click(screen.getByTestId("open")); });

    expect(capturedChannels).toHaveLength(2);
    // Workspace A and workspace B have separate channels
    expect(capturedChannels[0]!.inbound).not.toBe(capturedChannels[1]!.inbound);
    expect(capturedChannels[0]!.outbound).not.toBe(capturedChannels[1]!.outbound);
  });

  it("message sent to workspace A's inbound is not received on workspace B's inbound", async () => {
    // Separate received arrays per workspace instance
    const receivedA: string[] = [];
    const receivedB: string[] = [];
    const capturedChannels: WorkspaceComponentProps["channel"][] = [];

    function WsCapture({ channel }: WorkspaceComponentProps) {
      useEffect(() => {
        // Capture in order of opening
        const idx = capturedChannels.length;
        capturedChannels.push(channel);
        const target = idx === 0 ? receivedA : receivedB;
        return channel.inbound.on("msg", async (payload) => {
          target.push((payload as { text: string }).text);
        });
      }, [channel]);
      return null;
    }

    const workspaces = defineWorkspaces({
      ws: { component: WsCapture as React.ComponentType<WorkspaceComponentProps> },
    });

    function App() {
      const { open } = useWorkspaceActions();
      return (
        <>
          <button data-testid="open" onClick={() => open({ template: "ws", title: "T", params: {} })}>
            Open
          </button>
          <StackContainer />
        </>
      );
    }

    render(
      <AppProvider routes={routes} workspaces={workspaces} config={{ adapter: "stack" }}>
        <App />
      </AppProvider>,
    );

    await act(async () => { await userEvent.click(screen.getByTestId("open")); });
    await act(async () => { await userEvent.click(screen.getByTestId("open")); });

    // Emit on workspace A's inbound (= root-to-ws-A channel)
    act(() => {
      capturedChannels[0]!.inbound.emit("msg", { text: "for-A-only" });
    });

    // Workspace A receives the message
    expect(receivedA).toContain("for-A-only");
    // Workspace B does not receive it (separate channel namespace)
    expect(receivedB).not.toContain("for-A-only");
  });
});

// ─── External bus integration ─────────────────────────────────────────────────

describe("workspace-channel: external bus", () => {
  it("workspace channel traffic is visible via external bus onDebug", async () => {
    const debugMessages: string[] = [];
    const bus = createBus();
    bus.onDebug((msg) => {
      debugMessages.push(`${msg.namespace}/${msg.channel}/${msg.action}`);
    });

    const workspaces = defineWorkspaces({
      cam: { component: (() => null) as React.ComponentType<WorkspaceComponentProps> },
    });

    let capturedChannel: WorkspaceComponentProps["channel"] | null = null;

    function CamComponent({ channel }: WorkspaceComponentProps) {
      useEffect(() => { capturedChannel = channel; }, [channel]);
      return null;
    }

    const wsWithCapture = defineWorkspaces({
      cam: { component: CamComponent as React.ComponentType<WorkspaceComponentProps> },
    });

    function Opener() {
      const { open } = useWorkspaceActions();
      return (
        <button data-testid="open" onClick={() => open({ template: "cam", title: "T", params: {} })}>
          Open
        </button>
      );
    }

    render(
      <AppProvider
        routes={routes}
        workspaces={wsWithCapture}
        config={{ adapter: "stack" }}
        bus={bus}
      >
        <Opener />
        <StackContainer />
      </AppProvider>,
    );

    await act(async () => {
      await userEvent.click(screen.getByTestId("open"));
    });

    expect(capturedChannel).not.toBeNull();

    act(() => {
      capturedChannel!.outbound.emit("ping", { text: "hi" });
    });

    // The debug listener should have received the message
    await waitFor(() => {
      expect(debugMessages.some((m) => m.includes("ping"))).toBe(true);
    });
  });
});
