import { createBus } from "@mikrostack/chbus";

/**
 * The app's own chbus bus, handed to AppProvider. Owning it is what lets the
 * app reach the router's per-workspace `lifecycle` channel: the router creates
 * that channel on THIS bus, and chbus channels are get-or-create, so naming
 * the same namespace + channel yields the same object the router emits on.
 * See LifecycleLog in WorkspacePanel.tsx.
 */
export const bus = createBus();
