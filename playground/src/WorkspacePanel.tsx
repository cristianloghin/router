import { useEffect, useRef, useState } from "react";
import { useWorkspaces, useWorkspaceChannel, WorkspaceError } from "@mikrostack/router";

let cameraCounter = 0;

/**
 * Root-side channel demo: sends "take-snapshot" to one workspace and shows
 * the last "snapshot-ready" reply. Works from the panel rows and from the
 * workspace frame title bar (chrome is rendered by the root).
 */
export function PingButton({ wsId }: { wsId: string }) {
  const channel = useWorkspaceChannel(wsId);
  const [reply, setReply] = useState<string | null>(null);

  useEffect(() => {
    if (!channel) return;
    return channel.inbound.on("snapshot-ready", async (payload) => {
      const { at } = payload as { at: string };
      setReply(new Date(at).toLocaleTimeString());
    });
  }, [channel]);

  if (!channel) return null;
  return (
    <button onClick={() => channel.outbound.emit("take-snapshot", { quality: "high" })}>
      📸 snapshot{reply ? ` (◂ ${reply})` : ""}
    </button>
  );
}

/** Root-side workspace controls: open/focus/close, plus channel messaging. */
export function WorkspacePanel() {
  const { workspaces, current, open, focus, close, adapterType } = useWorkspaces();
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const append = (line: string) =>
    setLog((prev) => [...prev.slice(-50), `${new Date().toLocaleTimeString()}  ${line}`]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const tryOpen = async (fn: () => ReturnType<typeof open>) => {
    try {
      const ws = await fn();
      append(`opened ${ws.template} → ${ws.id.slice(0, 8)}`);
    } catch (err) {
      if (err instanceof WorkspaceError) {
        append(`✗ WorkspaceError ${err.code}`);
      } else {
        append(`✗ ${String(err)}`);
      }
    }
  };

  return (
    <div className="card">
      <h3>Workspaces <span className="badge">{adapterType}</span></h3>

      <div className="row">
        <button
          className="primary"
          onClick={() => {
            const n = ++cameraCounter;
            tryOpen(() =>
              open({
                template: "cameraFeed",
                title: `Camera ${n}`,
                params: { cameraId: `cam-${String(n).padStart(3, "0")}`, quality: 1080 },
              }),
            );
          }}
        >
          Open camera (auth, max 2)
        </button>
        <button
          onClick={() =>
            tryOpen(() =>
              open({
                template: "report",
                title: "Q1 Report",
                params: { reportId: "r-2026-q1", sections: ["revenue", "growth", "churn"] },
              }),
            )
          }
        >
          Open report (public)
        </button>
        <button
          onClick={() =>
            tryOpen(() => open({ template: "scratchpad", title: "Scratchpad", params: { note: "hello" } }))
          }
        >
          Open scratchpad
        </button>
      </div>

      {workspaces.length > 0 && (
        <div style={{ margin: "8px 0" }}>
          {workspaces.map((ws) => (
            <div className="ws-list-item" key={ws.id}>
              <span style={{ flex: 1 }}>
                {current?.id === ws.id ? "▸ " : ""}
                {ws.title} <span className="muted">({ws.template})</span>
              </span>
              {ws.template === "cameraFeed" && <PingButton wsId={ws.id} />}
              <button onClick={() => focus(ws.id)}>Focus</button>
              <button className="danger" onClick={() => close(ws.id)}>
                Close
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="log" ref={logRef}>
        {log.length === 0 ? <div>— event log —</div> : log.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    </div>
  );
}
