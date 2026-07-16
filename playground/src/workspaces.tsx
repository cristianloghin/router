import { useEffect, useState } from "react";
import {
  defineWorkspaces,
  useWorkspaceActions,
  type WorkspaceComponentProps,
} from "@mikrostack/router";

// ─── Camera feed — authenticated, schema-typed params, instance limit ─────────

function CameraFeed({ workspace, channel }: WorkspaceComponentProps<{ cameraId: string; quality: number }>) {
  const { updateParams, updateTitle } = useWorkspaceActions();
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  useEffect(() => {
    // Root sends "take-snapshot" → workspace replies "snapshot-ready"
    return channel.inbound.on("take-snapshot", async (payload) => {
      setLastCommand(`take-snapshot ${JSON.stringify(payload)}`);
      channel.outbound.emit("snapshot-ready", {
        cameraId: workspace.params.cameraId,
        at: new Date().toISOString(),
      });
    });
  }, [channel, workspace.params.cameraId]);

  return (
    <div>
      <h3>📷 Camera feed</h3>
      <pre>{JSON.stringify(workspace.params, null, 2)}</pre>
      <p className="muted">
        Params are typed from the template <code>schema</code> — quality is a real{" "}
        <code>number</code>: {workspace.params.quality * 2} (doubled).
      </p>
      <div className="row">
        <button onClick={() => updateParams(workspace.id, { quality: workspace.params.quality === 1080 ? 720 : 1080 })}>
          Toggle quality (updateParams → URL)
        </button>
        <button onClick={() => updateTitle(workspace.id, `Cam ${workspace.params.cameraId} @ ${new Date().toLocaleTimeString()}`)}>
          Rename (updateTitle)
        </button>
      </div>
      <p className="muted">Last channel command: <code>{lastCommand ?? "(none yet)"}</code></p>
    </div>
  );
}

// ─── Report viewer — public, no auth needed ───────────────────────────────────

function ReportViewer({ workspace }: WorkspaceComponentProps<{ reportId: string; sections: string[] }>) {
  return (
    <div>
      <h3>📄 Report {workspace.params.reportId}</h3>
      <p className="muted">
        <code>string[]</code> param round-trips through the URL as repeated query params:
      </p>
      <pre>{JSON.stringify(workspace.params.sections, null, 2)}</pre>
    </div>
  );
}

// ─── Scratchpad — schemaless template, loose string params ────────────────────

function Scratchpad({ workspace }: WorkspaceComponentProps) {
  return (
    <div>
      <h3>📝 {workspace.title}</h3>
      <p className="muted">No schema on this template — params are loose strings.</p>
      <pre>{JSON.stringify(workspace.params, null, 2)}</pre>
    </div>
  );
}

// ─── Template map ─────────────────────────────────────────────────────────────

export const workspaces = defineWorkspaces({
  cameraFeed: {
    component: CameraFeed,
    auth: { type: "authenticated" },
    maxInstances: 2,
    schema: {
      cameraId: "string",
      quality: "number",
    },
    defaultTitle: (params: { cameraId: string; quality: number }) => `Camera ${params.cameraId}`,
  },
  report: {
    component: ReportViewer,
    auth: { type: "public" },
    schema: {
      reportId: "string",
      sections: "string[]",
    },
  },
  scratchpad: {
    component: Scratchpad,
    auth: { type: "public" },
    persistent: false, // ephemeral — gone after an app restart
  },
});
