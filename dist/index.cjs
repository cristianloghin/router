"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AppProvider: () => AppProvider,
  Link: () => Link,
  RouterView: () => RouterView,
  StackContainer: () => StackContainer,
  SwipeContainer: () => SwipeContainer,
  TabsContainer: () => TabsContainer,
  defineRoutes: () => defineRoutes,
  defineWorkspaces: () => defineWorkspaces,
  navigate: () => navigate,
  notFound: () => notFound,
  useLocation: () => useLocation,
  useMeta: () => useMeta,
  useNavigation: () => useNavigation,
  useParams: () => useParams,
  usePrompt: () => usePrompt,
  useQueryState: () => useQueryState,
  useRoute: () => useRoute,
  useSearchParams: () => useSearchParams,
  useWorkspace: () => useWorkspace,
  useWorkspaceChannel: () => useWorkspaceChannel,
  useWorkspaces: () => useWorkspaces
});
module.exports = __toCommonJS(index_exports);

// src/router/matcher.ts
function splitPath(p) {
  if (p === "/") return [];
  return p.slice(1).split("/");
}
function matchPath(pattern, pathname) {
  const noMatch = { matched: false, params: {} };
  const patternParts = splitPath(pattern);
  const pathParts = splitPath(pathname);
  const wildcardIdx = patternParts.indexOf("*");
  if (wildcardIdx !== -1) {
    const staticParts = patternParts.slice(0, wildcardIdx);
    if (pathParts.length < staticParts.length) return noMatch;
    const params2 = {};
    for (let i = 0; i < staticParts.length; i++) {
      const p = staticParts[i];
      const v = pathParts[i];
      if (p.startsWith(":")) {
        if (!v) return noMatch;
        params2[p.slice(1)] = v;
      } else if (p !== v) {
        return noMatch;
      }
    }
    params2["*"] = pathParts.slice(staticParts.length).join("/");
    return { matched: true, params: params2 };
  }
  if (patternParts.length !== pathParts.length) return noMatch;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    const v = pathParts[i];
    if (p.startsWith(":")) {
      if (!v) return noMatch;
      params[p.slice(1)] = v;
    } else if (p !== v) {
      return noMatch;
    }
  }
  return { matched: true, params };
}
function buildPath(pattern, params) {
  return pattern.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
    return params[key] ?? `:${key}`;
  });
}
function specificity(pattern) {
  const parts = splitPath(pattern);
  let score = 0;
  for (const part of parts) {
    if (part === "*") {
      score -= 1;
    } else if (part.startsWith(":")) {
      score += 10;
    } else {
      score += 100;
    }
  }
  return score;
}

// src/router/RouteRegistry.ts
function defineRoutes(map) {
  for (const key of Object.keys(map)) {
    if (!key.startsWith("/")) {
      throw new Error(
        `[router] Route key "${key}" must start with "/". All route keys are absolute path patterns.`
      );
    }
  }
  return Object.freeze({ ...map });
}
var RouteRegistry = class {
  constructor(routes) {
    this._routes = routes;
    this.keys = Object.keys(routes);
    this.parentMap = /* @__PURE__ */ new Map();
    this.childrenMap = /* @__PURE__ */ new Map();
    for (const key of this.keys) {
      this.childrenMap.set(key, []);
    }
    for (const key of this.keys) {
      const def = routes[key];
      if (def.parent === null) {
        this.parentMap.set(key, null);
        continue;
      }
      let bestParent = null;
      let bestLength = -1;
      for (const candidate of this.keys) {
        if (candidate === key) continue;
        if (!isStrictSegmentPrefix(candidate, key)) continue;
        if (candidate.length > bestLength) {
          bestParent = candidate;
          bestLength = candidate.length;
        }
      }
      this.parentMap.set(key, bestParent);
      if (bestParent !== null) {
        this.childrenMap.get(bestParent).push(key);
      }
    }
    if (true) {
      this.detectCycles();
    }
  }
  /**
   * Returns the ordered render chain for the given pathname, outermost-first.
   * Only the best-matching route at each nesting level is included.
   */
  getMatchChain(pathname) {
    const matches = this.keys.filter((key) => matchPath(key, pathname).matched).sort((a, b) => specificity(b) - specificity(a));
    if (matches.length === 0) return [];
    const leaf = matches[0];
    const chain = [];
    let current = leaf;
    while (current !== null) {
      chain.unshift(current);
      current = this.parentMap.get(current) ?? null;
    }
    return chain;
  }
  getParent(path) {
    return this.parentMap.get(path) ?? null;
  }
  getChildren(path) {
    return this.childrenMap.get(path) ?? [];
  }
  getAll() {
    return [...this.keys];
  }
  // ─── Private ───────────────────────────────────────────────────────────────
  detectCycles() {
    const visited = /* @__PURE__ */ new Set();
    const inStack = /* @__PURE__ */ new Set();
    const visit = (key) => {
      if (inStack.has(key)) {
        throw new Error(`[router] Cycle detected in parent graph at route "${key}".`);
      }
      if (visited.has(key)) return;
      inStack.add(key);
      const parent = this.parentMap.get(key);
      if (parent) visit(parent);
      inStack.delete(key);
      visited.add(key);
    };
    for (const key of this.keys) {
      visit(key);
    }
  }
};
function isStrictSegmentPrefix(prefix, path) {
  if (prefix === path) return false;
  if (!path.startsWith(prefix)) return false;
  const charAfter = path[prefix.length];
  return charAfter === "/" || charAfter === void 0;
}

// src/router/hooks.ts
var import_react2 = require("react");

// src/router/context.ts
var import_react = require("react");
var RouterStoreContext = (0, import_react.createContext)(null);
function useRouterStore() {
  const store = (0, import_react.useContext)(RouterStoreContext);
  if (!store) {
    throw new Error(
      "[router] Router hooks must be used inside <AppProvider>."
    );
  }
  return store;
}

// src/router/hooks.ts
function useNavigation() {
  const store = useRouterStore();
  const navigate2 = (0, import_react2.useCallback)(
    (to, options) => store.navigate(to, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store]
  );
  const back = (0, import_react2.useCallback)(() => store.back(), [store]);
  const bPath = (0, import_react2.useCallback)(
    (pattern, params = {}) => store.buildPath(pattern, params),
    [store]
  );
  return (0, import_react2.useMemo)(() => ({ navigate: navigate2, back, buildPath: bPath }), [navigate2, back, bPath]);
}
function useLocation(workspaceBasePath = "/workspace") {
  const store = useRouterStore();
  const snapshot = (0, import_react2.useSyncExternalStore)(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot()
  );
  return (0, import_react2.useMemo)(
    () => ({
      path: snapshot.path,
      searchParams: snapshot.searchParams,
      inWorkspace: store.isWorkspacePath(window.location.pathname),
      canGoBack: snapshot.canGoBack,
      isTransitioning: snapshot.isTransitioning
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.path, snapshot.searchParams, snapshot.canGoBack, snapshot.isTransitioning, workspaceBasePath]
  );
}
function useRoute(path) {
  const store = useRouterStore();
  const snapshot = (0, import_react2.useSyncExternalStore)(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
    () => store.getSnapshot()
  );
  return (0, import_react2.useMemo)(() => {
    const currentPath = snapshot.path;
    const { matched, params } = matchPath(path, currentPath);
    if (matched) {
      return { matched: true, params, exact: true };
    }
    const patternDepth = segmentCount(path);
    const prefixPath = takePrefixSegments(currentPath, patternDepth);
    if (prefixPath !== currentPath) {
      const { matched: ancMatched, params: ancParams } = matchPath(path, prefixPath);
      if (ancMatched) {
        return {
          matched: true,
          params: ancParams,
          exact: false
        };
      }
    }
    return { matched: false, params: {}, exact: false };
  }, [path, snapshot.path]);
}
function segmentCount(pattern) {
  if (pattern === "/") return 0;
  return pattern.slice(1).split("/").length;
}
function takePrefixSegments(path, n) {
  if (n === 0) return "/";
  const parts = path === "/" ? [] : path.slice(1).split("/");
  if (parts.length <= n) return path;
  return "/" + parts.slice(0, n).join("/");
}
function useParams(path) {
  const { params } = useRoute(path);
  return params;
}
function useSearchParams() {
  const store = useRouterStore();
  const searchParams = (0, import_react2.useSyncExternalStore)(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().searchParams,
    () => store.getSnapshot().searchParams
  );
  const setSearchParams = (0, import_react2.useCallback)(
    (next) => {
      const resolved = typeof next === "function" ? next(store.getSnapshot().searchParams) : next;
      store.setSearchParams(resolved);
    },
    [store]
  );
  return [searchParams, setSearchParams];
}
function useQueryState(schema) {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = (0, import_react2.useMemo)(() => {
    const result = {};
    for (const [key, descriptor] of Object.entries(schema)) {
      const { type, default: def } = descriptor;
      const raw = type === "string[]" || type === "number[]" ? searchParams.getAll(key) : searchParams.get(key) ?? void 0;
      const isArray = type === "string[]" || type === "number[]";
      const hasValue = isArray ? raw.length > 0 : raw !== void 0;
      if (!hasValue) {
        result[key] = def;
      } else {
        result[key] = deserializeQueryParam(raw, type);
      }
    }
    return result;
  }, [searchParams]);
  const setState = (0, import_react2.useCallback)(
    (patch) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          const descriptor = schema[key];
          if (!descriptor || value === void 0) continue;
          const { type } = descriptor;
          next.delete(key);
          if (type === "string[]" || type === "number[]") {
            for (const v of value) {
              next.append(key, String(v));
            }
          } else {
            next.set(key, String(value));
          }
        }
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSearchParams, schema]
  );
  return [state, setState];
}
function deserializeQueryParam(raw, type) {
  switch (type) {
    case "string":
      return raw;
    case "number":
      return Number(raw);
    case "boolean":
      return raw === "true";
    case "string[]":
      return Array.isArray(raw) ? raw : [raw];
    case "number[]":
      return Array.isArray(raw) ? raw.map(Number) : [Number(raw)];
  }
}
function useMeta() {
  const store = useRouterStore();
  const meta = (0, import_react2.useSyncExternalStore)(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().meta,
    () => store.getSnapshot().meta
  );
  const setMeta = (0, import_react2.useCallback)(
    (patch) => store.setMeta(patch),
    [store]
  );
  return [meta, setMeta];
}
function usePrompt(message, when) {
  const store = useRouterStore();
  (0, import_react2.useEffect)(() => {
    if (!when) {
      delete store.onPrompt;
      return;
    }
    store.onPrompt = () => window.confirm(message);
    const handleBeforeUnload = (e) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      delete store.onPrompt;
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [message, when, store]);
}

// src/utils/notFound.ts
var NOT_FOUND_SENTINEL = /* @__PURE__ */ Symbol("router.notFound");
var sentinel = { __type: NOT_FOUND_SENTINEL };
function notFound() {
  throw sentinel;
}
function isNotFoundError(value) {
  return typeof value === "object" && value !== null && value.__type === NOT_FOUND_SENTINEL;
}

// src/router/history.ts
function isWorkspaceState(v) {
  return typeof v === "object" && v !== null && typeof v["origin"] === "string" && typeof v["workspaceId"] === "string";
}
var HistoryStack = class {
  constructor() {
    this.stack = [];
  }
  get canGoBack() {
    return this.stack.length > 0;
  }
  push(path) {
    this.stack.push(path);
  }
  pop() {
    return this.stack.pop();
  }
  /** Replaces the top entry. Behaves like push when the stack is empty. */
  replace(path) {
    if (this.stack.length === 0) {
      this.stack.push(path);
    } else {
      this.stack[this.stack.length - 1] = path;
    }
  }
  clear() {
    this.stack = [];
  }
  // ─── window.history.state integration ──────────────────────────────────────
  /**
   * Pushes a workspace URL into window.history, embedding the origin path and
   * workspaceId in the history state for later retrieval by close().
   */
  pushWorkspaceEntry(workspaceId, originPath) {
    const state = { origin: originPath, workspaceId };
    window.history.pushState(state, "");
  }
  /** Returns the origin path stored by pushWorkspaceEntry, or null. */
  readWorkspaceOrigin() {
    const state = window.history.state;
    return isWorkspaceState(state) ? state.origin : null;
  }
  /** Returns the workspaceId stored by pushWorkspaceEntry, or null. */
  readWorkspaceId() {
    const state = window.history.state;
    return isWorkspaceState(state) ? state.workspaceId : null;
  }
};

// src/router/RouterContext.ts
var RouterStore = class {
  constructor(initialMeta = {}, workspaceBasePath = "/workspace") {
    this.listeners = /* @__PURE__ */ new Set();
    this.previousPath = null;
    this.workspaceBasePath = workspaceBasePath;
    this.historyStack = new HistoryStack();
    const loc = window.location;
    const path = this.isWorkspacePath(loc.pathname) ? "/" : loc.pathname;
    this.state = {
      path,
      searchParams: new URLSearchParams(loc.search),
      isTransitioning: false,
      canGoBack: false,
      meta: initialMeta
    };
    this.handlePopState = this.handlePopState.bind(this);
    window.addEventListener("popstate", this.handlePopState);
  }
  destroy() {
    window.removeEventListener("popstate", this.handlePopState);
    this.listeners.clear();
  }
  // ─── useSyncExternalStore interface ──────────────────────────────────────────
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  getSnapshot() {
    return this.state;
  }
  // ─── Mutations ────────────────────────────────────────────────────────────────
  navigate(to, options = {}, type = "push") {
    const { replace = false, state, params } = options;
    const resolvedPath = params ? buildPath(to, params) : to;
    if (this.onPrompt) {
      if (!this.onPrompt("")) return;
    }
    if (this.onBeforeNavigate) {
      let cancelled = false;
      this.onBeforeNavigate({
        from: this.previousPath,
        to: resolvedPath,
        type,
        cancel: () => {
          cancelled = true;
        }
      });
      if (cancelled) return;
    }
    if (this.isWorkspacePath(resolvedPath)) {
      if (replace) {
        window.history.replaceState(state ?? null, "", resolvedPath);
      } else {
        window.history.pushState(state ?? null, "", resolvedPath);
      }
      return;
    }
    const prevPath = this.previousPath;
    if (replace) {
      window.history.replaceState(state ?? null, "", resolvedPath);
      this.historyStack.replace(this.state.path);
    } else {
      this.historyStack.push(this.state.path);
      window.history.pushState(state ?? null, "", resolvedPath);
    }
    const newSearch = new URLSearchParams(window.location.search);
    this.previousPath = resolvedPath;
    this.setState({
      path: resolvedPath,
      searchParams: newSearch,
      canGoBack: this.historyStack.canGoBack
    });
    this.onNavigate?.({ from: prevPath, to: resolvedPath, type });
  }
  back() {
    if (!this.historyStack.canGoBack) return;
    const prev = this.historyStack.pop();
    window.history.back();
    if (prev !== void 0) {
      this.setState({
        path: prev,
        searchParams: new URLSearchParams(window.location.search),
        canGoBack: this.historyStack.canGoBack
      });
      this.onNavigate?.({ from: this.state.path, to: prev, type: "back" });
    }
  }
  setSearchParams(next) {
    const search = next.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
    this.setState({ searchParams: next });
  }
  setMeta(patch) {
    this.setState({ meta: { ...this.state.meta, ...patch } });
  }
  setTransitioning(value) {
    this.setState({ isTransitioning: value });
  }
  buildPath(pattern, params) {
    return buildPath(pattern, params);
  }
  isWorkspacePath(pathname) {
    return pathname === this.workspaceBasePath || pathname.startsWith(this.workspaceBasePath + "/");
  }
  matchPath(pattern, pathname) {
    return matchPath(pattern, pathname);
  }
  getHistoryStack() {
    return this.historyStack;
  }
  // ─── popstate handler ─────────────────────────────────────────────────────────
  handlePopState() {
    const loc = window.location;
    if (this.isWorkspacePath(loc.pathname)) return;
    this.setState({
      path: loc.pathname,
      searchParams: new URLSearchParams(loc.search),
      canGoBack: this.historyStack.canGoBack
    });
  }
  // ─── Internal ─────────────────────────────────────────────────────────────────
  setState(patch) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      listener();
    }
  }
};
var _store = null;
function navigate(to, options) {
  _store?.navigate(to, options);
}

// src/workspaces/defineWorkspaces.ts
function defineWorkspaces(map) {
  const normalised = {};
  for (const [key, template] of Object.entries(map)) {
    normalised[key] = {
      ...template,
      auth: template.auth ?? { type: "public" }
    };
  }
  return Object.freeze(normalised);
}
function createDescriptor(template, params, title, auth = { type: "public", granted: true }) {
  return {
    id: uuidv4(),
    template,
    title,
    params,
    createdAt: Date.now(),
    auth
  };
}
function uuidv4() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}

// src/workspaces/hooks.ts
var import_react4 = require("react");

// src/workspaces/context.ts
var import_react3 = require("react");
var WorkspaceManagerContext = (0, import_react3.createContext)(null);
function useWorkspaceManagerContext() {
  const manager = (0, import_react3.useContext)(WorkspaceManagerContext);
  if (!manager) {
    throw new Error(
      "useWorkspace* hooks must be used inside a component tree provided by AppProvider."
    );
  }
  return manager;
}
var WorkspaceTemplatesContext = (0, import_react3.createContext)(null);
function useWorkspaceTemplates() {
  const templates = (0, import_react3.useContext)(WorkspaceTemplatesContext);
  if (!templates) {
    throw new Error(
      "WorkspaceTemplatesContext not found. Ensure <AppProvider> is rendered."
    );
  }
  return templates;
}

// src/workspaces/hooks.ts
function useWorkspaces() {
  const manager = useWorkspaceManagerContext();
  const snapshotRef = (0, import_react4.useRef)({
    workspaces: manager.getAll(),
    current: manager.getCurrent()
  });
  const subscribe = (0, import_react4.useCallback)(
    (notify) => {
      return manager.subscribe((_event) => {
        snapshotRef.current = {
          workspaces: manager.getAll(),
          current: manager.getCurrent()
        };
        notify();
      });
    },
    [manager]
  );
  const getSnapshot = (0, import_react4.useCallback)(() => snapshotRef.current, []);
  const snapshot = (0, import_react4.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
  return {
    workspaces: snapshot.workspaces,
    current: snapshot.current,
    adapterType: manager.adapterType,
    open(input) {
      return manager.open(input);
    },
    focus(id) {
      return manager.focus(id);
    },
    close(id, autoFocus) {
      return manager.close(id, autoFocus);
    },
    updateParams(id, params) {
      return manager.updateParams(id, params);
    },
    updateTitle(id, title) {
      return manager.updateTitle(id, title);
    }
  };
}
function useWorkspace(id) {
  const manager = useWorkspaceManagerContext();
  const getState = (0, import_react4.useCallback)(() => {
    const workspace = manager.getAll().find((w) => w.id === id);
    if (!workspace) return null;
    const pair = manager.getChannel(id);
    if (!pair) return null;
    return {
      workspace,
      params: workspace.params,
      channel: pair.workspace
    };
  }, [manager, id]);
  const snapshotRef = (0, import_react4.useRef)(getState());
  const subscribe = (0, import_react4.useCallback)(
    (notify) => {
      return manager.subscribe((event) => {
        const isRelevant = event.type === "workspace:updated" && event.workspace.id === id || event.type === "workspace:opened" && event.workspace.id === id || event.type === "workspace:closed" && event.workspaceId === id;
        if (isRelevant) {
          snapshotRef.current = getState();
          notify();
        }
      });
    },
    [manager, id, getState]
  );
  const getSnapshot = (0, import_react4.useCallback)(() => snapshotRef.current, []);
  return (0, import_react4.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
}
function useWorkspaceChannel(workspaceId) {
  const manager = useWorkspaceManagerContext();
  const getState = (0, import_react4.useCallback)(() => {
    const pair = manager.getChannel(workspaceId);
    if (!pair) return null;
    return { outbound: pair.root.outbound, inbound: pair.root.inbound };
  }, [manager, workspaceId]);
  const snapshotRef = (0, import_react4.useRef)(getState());
  const prevIdRef = (0, import_react4.useRef)(workspaceId);
  if (prevIdRef.current !== workspaceId) {
    prevIdRef.current = workspaceId;
    snapshotRef.current = getState();
  }
  const subscribe = (0, import_react4.useCallback)(
    (notify) => {
      return manager.subscribe((event) => {
        const isRelevant = event.type === "workspace:opened" && event.workspace.id === workspaceId || event.type === "workspace:closed" && event.workspaceId === workspaceId;
        if (isRelevant) {
          snapshotRef.current = getState();
          notify();
        }
      });
    },
    [manager, workspaceId, getState]
  );
  const getSnapshot = (0, import_react4.useCallback)(() => snapshotRef.current, []);
  return (0, import_react4.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
}

// src/provider/AppProvider.tsx
var import_react7 = require("react");
var import_chbus = require("@mikrostack/chbus");

// src/router/registryContext.ts
var import_react5 = require("react");
var RouteRegistryContext = (0, import_react5.createContext)(null);
function useRouteRegistry() {
  const registry = (0, import_react5.useContext)(RouteRegistryContext);
  if (!registry) {
    throw new Error("[router] RouteRegistry not found. Ensure <AppProvider> is rendered.");
  }
  return registry;
}

// src/workspaces/types.ts
var WorkspaceError = class extends Error {
  constructor(code, message, workspaceId = null) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
    this.workspaceId = workspaceId;
  }
};

// src/workspaces/channel/WorkspaceChannel.ts
function createWorkspaceChannel(workspaceId, bus) {
  const ns = bus.namespace(`workspace:${workspaceId}`);
  const rootToWs = ns.channel("root-to-ws");
  const wsToRoot = ns.channel("ws-to-root");
  return {
    workspace: {
      inbound: rootToWs,
      outbound: wsToRoot
    },
    root: {
      outbound: rootToWs,
      inbound: wsToRoot
    },
    destroy() {
      rootToWs.destroy();
      wsToRoot.destroy();
    }
  };
}

// src/utils/params.ts
function serialize(value, type) {
  switch (type) {
    case "string":
      return String(value);
    case "number":
      return String(value);
    case "boolean":
      return String(value);
    case "string[]":
      return value.map(String);
    case "number[]":
      return value.map(String);
  }
}

// src/workspaces/WorkspaceManager.ts
var WorkspaceManager = class {
  constructor(config) {
    /** Channel pairs keyed by workspace id. */
    this.channels = /* @__PURE__ */ new Map();
    /** Origin path stored at open() time, keyed by workspace id. */
    this.origins = /* @__PURE__ */ new Map();
    this.adapter = config.adapter;
    this.guard = config.guard;
    this._navigate = config.navigate;
    this.bus = config.bus;
    this.templates = config.templates;
    this.basePath = config.workspaceBasePath ?? "/workspace";
  }
  // ─── adapterType ────────────────────────────────────────────────────────────
  get adapterType() {
    return this.adapter.type;
  }
  // ─── open ────────────────────────────────────────────────────────────────────
  async open(input) {
    const templateKey = String(input.template);
    const template = this.templates[templateKey];
    if (!template) {
      throw new WorkspaceError("ADAPTER_ERROR", `Unknown template: ${templateKey}`, null);
    }
    if (template.maxInstances !== void 0) {
      const existing = this.adapter.getAll().filter((w) => w.template === templateKey);
      if (existing.length >= template.maxInstances) {
        throw new WorkspaceError(
          "MAX_INSTANCES_REACHED",
          `Max instances (${template.maxInstances}) reached for template "${templateKey}"`,
          null
        );
      }
    }
    const descriptor = createDescriptor(
      templateKey,
      input.params,
      input.title,
      { type: template.auth?.type ?? "public", granted: false }
    );
    const authRule = template.auth ?? { type: "public" };
    const ctx = {
      workspaceId: descriptor.id,
      template: templateKey,
      params: input.params,
      isDirectAccess: false
    };
    const granted = await this.guard.evaluate(authRule, ctx);
    if (!granted) {
      throw new WorkspaceError(
        "AUTH_FAILED",
        `Auth check failed for template "${templateKey}"`,
        descriptor.id
      );
    }
    descriptor.auth = {
      type: authRule.type,
      granted: true
    };
    const channelPair = createWorkspaceChannel(descriptor.id, this.bus);
    this.channels.set(descriptor.id, channelPair);
    const origin = typeof window !== "undefined" ? window.location.pathname : "/";
    this.origins.set(descriptor.id, origin);
    await this.adapter.open(descriptor);
    const url = this.buildUrl(descriptor);
    this._navigate(url, { state: { origin, workspaceId: descriptor.id } });
    return descriptor;
  }
  // ─── focus ───────────────────────────────────────────────────────────────────
  async focus(id) {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }
    await this.adapter.focus(id);
    const url = this.buildUrl(workspace);
    this._navigate(url);
    return workspace;
  }
  // ─── close ───────────────────────────────────────────────────────────────────
  async close(id, autoFocus = true) {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }
    const pair = this.channels.get(id);
    if (pair) {
      pair.destroy();
      this.channels.delete(id);
    }
    const origin = this.origins.get(id) ?? "/";
    this.origins.delete(id);
    await this.adapter.close(id, autoFocus);
    this._navigate(origin);
  }
  // ─── updateParams ────────────────────────────────────────────────────────────
  updateParams(id, params) {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }
    this.adapter.updateParams(id, params);
    const updated = this.adapter.getAll().find((w) => w.id === id) ?? workspace;
    const url = this.buildUrl(updated);
    this._navigate(url, { replace: true });
    return updated;
  }
  // ─── updateTitle ─────────────────────────────────────────────────────────────
  updateTitle(id, title) {
    this.adapter.updateTitle(id, title);
    const updated = this.adapter.getAll().find((w) => w.id === id);
    if (!updated) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }
    return updated;
  }
  // ─── delegation ──────────────────────────────────────────────────────────────
  getAll() {
    return this.adapter.getAll();
  }
  getCurrent() {
    return this.adapter.getCurrent();
  }
  subscribe(listener) {
    return this.adapter.subscribe(listener);
  }
  // ─── channel access ──────────────────────────────────────────────────────────
  getChannel(workspaceId) {
    return this.channels.get(workspaceId) ?? null;
  }
  getAdapter() {
    return this.adapter;
  }
  // ─── URL building ─────────────────────────────────────────────────────────────
  buildUrl(descriptor) {
    const template = this.templates[descriptor.template];
    const searchParams = new URLSearchParams();
    searchParams.set("title", descriptor.title);
    if (template?.schema) {
      for (const [key, type] of Object.entries(template.schema)) {
        if (type !== void 0 && key in descriptor.params) {
          const raw = descriptor.params[key];
          if (raw === void 0) continue;
          const serialized = serialize(raw, type);
          if (Array.isArray(serialized)) {
            if (serialized.length > 0) {
              for (const v of serialized) searchParams.append(key, v);
            }
          } else {
            searchParams.set(key, serialized);
          }
        }
      }
    } else {
      for (const [key, value] of Object.entries(descriptor.params)) {
        if (Array.isArray(value)) {
          for (const v of value) searchParams.append(key, String(v));
        } else {
          searchParams.set(key, String(value));
        }
      }
    }
    return `${this.basePath}/${descriptor.template}/${descriptor.id}?${searchParams.toString()}`;
  }
};

// src/workspaces/auth/WorkspaceGuard.ts
var WorkspaceGuard = class {
  constructor(config) {
    this.config = config;
  }
  async evaluate(rule, context) {
    switch (rule.type) {
      case "public":
        return true;
      case "authenticated": {
        const result = await Promise.resolve(this.config.isAuthenticated());
        return result;
      }
      case "time-limited": {
        const expiresAt = typeof rule.expiresAt === "function" ? rule.expiresAt() : rule.expiresAt;
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
};

// src/workspaces/adapters/StackAdapter.ts
var StackAdapter = class {
  constructor() {
    this.type = "stack";
    this.workspaces = [];
    this.currentIndex = -1;
    this.listeners = /* @__PURE__ */ new Set();
  }
  async open(descriptor) {
    this.workspaces.push(descriptor);
    this.currentIndex = this.workspaces.length - 1;
    this.emit({ type: "workspace:opened", workspace: descriptor });
  }
  async close(id, autoFocus = true) {
    const idx = this.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) return;
    this.workspaces.splice(idx, 1);
    this.emit({ type: "workspace:closed", workspaceId: id });
    if (!autoFocus) return;
    if (this.workspaces.length === 0) {
      this.currentIndex = -1;
      return;
    }
    const nextIdx = Math.min(idx, this.workspaces.length - 1);
    this.currentIndex = nextIdx;
    const next = this.workspaces[nextIdx];
    if (next) {
      this.emit({ type: "workspace:focused", workspaceId: next.id });
    }
  }
  async focus(id) {
    const idx = this.workspaces.findIndex((w) => w.id === id);
    if (idx === -1) return;
    this.currentIndex = idx;
    this.emit({ type: "workspace:focused", workspaceId: id });
  }
  updateParams(id, params) {
    const ws = this.workspaces.find((w) => w.id === id);
    if (!ws) return;
    ws.params = params;
    this.emit({ type: "workspace:updated", workspace: { ...ws } });
  }
  updateTitle(id, title) {
    const ws = this.workspaces.find((w) => w.id === id);
    if (!ws) return;
    ws.title = title;
    this.emit({ type: "workspace:updated", workspace: { ...ws } });
  }
  getAll() {
    return [...this.workspaces];
  }
  getCurrent() {
    return this.workspaces[this.currentIndex] ?? null;
  }
  restoreState(descriptors) {
    this.workspaces = [...descriptors];
    this.currentIndex = descriptors.length > 0 ? 0 : -1;
    this.emit({ type: "workspace:synced", workspaces: this.getAll() });
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
};

// src/workspaces/adapters/SwipeAdapter.ts
var SwipeAdapter = class extends StackAdapter {
  constructor() {
    super(...arguments);
    this.type = "swipe";
  }
  getCurrentIndex() {
    return this.currentIndex;
  }
  /**
   * Update the current index without emitting workspace:focused.
   * Called by the SwipeContainer scroll handler.
   * Clamps to valid range — does not throw for out-of-bounds values.
   */
  setCurrentIndex(n) {
    if (this.workspaces.length === 0) {
      this.currentIndex = -1;
      return;
    }
    this.currentIndex = Math.max(0, Math.min(n, this.workspaces.length - 1));
  }
};

// src/workspaces/adapters/BrowserTabAdapter.ts
var BrowserTabAdapter = class {
  constructor(workspaceBasePath = "/workspace") {
    this.type = "tabs";
    this.workspaces = [];
    this.listeners = /* @__PURE__ */ new Set();
    this.bc = null;
    this.workspaceBasePath = workspaceBasePath;
    this.initBroadcastChannel();
    this.syncCurrentFromUrl();
  }
  async open(descriptor) {
    const url = this.buildUrl(descriptor);
    window.open(url, "_blank");
    this.workspaces.push(descriptor);
    this.emit({ type: "workspace:opened", workspace: descriptor });
    this.bc?.postMessage({ type: "workspace:opened", workspace: descriptor });
  }
  async close(id, _autoFocus = true) {
    const current = this.getCurrent();
    if (current?.id === id) {
      window.close();
    }
  }
  async focus(id) {
    this.emit({ type: "workspace:focused", workspaceId: id });
  }
  updateParams(id, params) {
    const ws = this.workspaces.find((w) => w.id === id);
    if (!ws) return;
    ws.params = params;
    this.emit({ type: "workspace:updated", workspace: { ...ws } });
  }
  updateTitle(id, title) {
    const ws = this.workspaces.find((w) => w.id === id);
    if (!ws) return;
    ws.title = title;
    this.emit({ type: "workspace:updated", workspace: { ...ws } });
  }
  getAll() {
    return [...this.workspaces];
  }
  /**
   * Reads the workspace id from the current tab's URL.
   * URL format: /workspace/{template}/{id}?...
   */
  getCurrent() {
    const pathname = window.location.pathname;
    const prefix = this.workspaceBasePath + "/";
    if (!pathname.startsWith(prefix)) return null;
    const rest = pathname.slice(prefix.length);
    const parts = rest.split("/");
    const id = parts[1];
    if (!id) return null;
    return this.workspaces.find((w) => w.id === id) ?? null;
  }
  restoreState(descriptors) {
    this.workspaces = [...descriptors];
    this.emit({ type: "workspace:synced", workspaces: this.getAll() });
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  destroy() {
    this.bc?.close();
    this.bc = null;
    this.listeners.clear();
  }
  // ─── Private ─────────────────────────────────────────────────────────────────
  initBroadcastChannel() {
    try {
      this.bc = new BroadcastChannel("workspace-router");
      this.bc.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === "workspace:opened") {
          const exists = this.workspaces.some((w) => w.id === msg.workspace.id);
          if (!exists) {
            this.workspaces.push(msg.workspace);
          }
          this.emit({ type: "workspace:opened", workspace: msg.workspace });
        } else if (msg.type === "workspace:closed") {
          this.workspaces = this.workspaces.filter((w) => w.id !== msg.workspaceId);
          this.emit({ type: "workspace:closed", workspaceId: msg.workspaceId });
        }
      };
    } catch {
    }
  }
  syncCurrentFromUrl() {
  }
  buildUrl(descriptor) {
    const params = new URLSearchParams();
    params.set("title", descriptor.title);
    for (const [key, value] of Object.entries(descriptor.params)) {
      if (Array.isArray(value)) {
        for (const v of value) params.append(key, String(v));
      } else {
        params.set(key, String(value));
      }
    }
    return `${this.workspaceBasePath}/${descriptor.template}/${descriptor.id}?${params.toString()}`;
  }
  emit(event) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
};

// src/provider/context.ts
var import_react6 = require("react");
var AppConfigContext = (0, import_react6.createContext)({});

// src/provider/AppProvider.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function createAdapter(type = "auto") {
  switch (type) {
    case "tabs":
      return new BrowserTabAdapter();
    case "swipe":
      return new SwipeAdapter();
    case "stack":
      return new StackAdapter();
    case "auto":
    default:
      if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
        return new SwipeAdapter();
      }
      return new StackAdapter();
  }
}
function AppProvider({
  routes,
  workspaces,
  meta = {},
  config = {},
  bus: externalBus,
  children
}) {
  const storeRef = (0, import_react7.useRef)(null);
  const registryRef = (0, import_react7.useRef)(null);
  const managerRef = (0, import_react7.useRef)(null);
  const busRef = (0, import_react7.useRef)(null);
  if (!storeRef.current) {
    const basePath = config.workspaceBasePath ?? "/workspace";
    storeRef.current = new RouterStore(meta, basePath);
    registryRef.current = new RouteRegistry(routes);
    busRef.current = externalBus ?? (0, import_chbus.createBus)();
    const adapter = createAdapter(config.adapter);
    const guard = new WorkspaceGuard({
      isAuthenticated: config.auth?.isAuthenticated ?? (() => false)
    });
    const store2 = storeRef.current;
    const navigate2 = (url, opts = {}) => {
      const navOpts = {};
      if (opts.replace !== void 0) navOpts.replace = opts.replace;
      if (opts.state !== void 0) navOpts.state = opts.state;
      store2.navigate(url, navOpts);
    };
    managerRef.current = new WorkspaceManager({
      adapter,
      guard,
      navigate: navigate2,
      bus: busRef.current,
      templates: workspaces,
      workspaceBasePath: basePath
    });
  }
  const store = storeRef.current;
  if (config.onBeforeNavigate !== void 0) {
    store.onBeforeNavigate = config.onBeforeNavigate;
  } else {
    delete store.onBeforeNavigate;
  }
  if (config.onNavigate !== void 0) {
    store.onNavigate = config.onNavigate;
  } else {
    delete store.onNavigate;
  }
  (0, import_react7.useEffect)(() => {
    return () => {
      storeRef.current?.destroy();
    };
  }, []);
  const appConfig = {};
  if (config.defaultLoading !== void 0) appConfig.defaultLoading = config.defaultLoading;
  if (config.defaultError !== void 0) appConfig.defaultError = config.defaultError;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RouterStoreContext.Provider, { value: store, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RouteRegistryContext.Provider, { value: registryRef.current, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkspaceManagerContext.Provider, { value: managerRef.current, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkspaceTemplatesContext.Provider, { value: workspaces, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppConfigContext.Provider, { value: appConfig, children }) }) }) }) });
}

// src/components/RouterView.tsx
var import_react9 = require("react");
var import_react10 = require("react");

// src/router/boundaries.tsx
var import_react8 = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var RouteErrorBoundary = class extends import_react8.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, isNotFound: false };
    this.reset = this.reset.bind(this);
  }
  static getDerivedStateFromError(error) {
    if (isNotFoundError(error)) {
      return { error: null, isNotFound: true };
    }
    return {
      error: error instanceof Error ? error : new Error(String(error)),
      isNotFound: false
    };
  }
  componentDidCatch(error) {
    if (isNotFoundError(error)) {
      this.props.onNotFound();
    }
  }
  reset() {
    this.setState({ error: null, isNotFound: false });
  }
  render() {
    const { error, isNotFound } = this.state;
    if (isNotFound) return null;
    if (error !== null) {
      const { path } = this.props;
      const ErrorComponent = this.props.error ?? this.props.defaultError ?? DefaultErrorDisplay;
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ErrorComponent, { error, reset: this.reset, path });
    }
    return this.props.children;
  }
};
function DefaultErrorDisplay({ error, reset }) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { role: "alert", style: { padding: "1rem", border: "1px solid red" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: error.message }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { onClick: reset, children: "Retry" })
  ] });
}
function RouteBoundary({
  path,
  children,
  loading,
  defaultLoading,
  error,
  defaultError,
  onNotFound
}) {
  const loadingFallback = resolveLoading(loading ?? defaultLoading);
  const errorBoundaryProps = { path, onNotFound, children: null };
  if (error !== void 0) errorBoundaryProps.error = error;
  if (defaultError !== void 0) errorBoundaryProps.defaultError = defaultError;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RouteErrorBoundary, { ...errorBoundaryProps, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_react8.Suspense, { fallback: loadingFallback, children }) });
}
function resolveLoading(loading) {
  if (loading === void 0 || loading === null) return null;
  if (typeof loading === "function") {
    const LoadingComponent = loading;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(LoadingComponent, {});
  }
  return loading;
}

// src/components/RouterView.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function RouterView({
  fallback,
  scrollRestoration = "top",
  defaultLoading,
  defaultError
}) {
  const store = useRouterStore();
  const registry = useRouteRegistry();
  const containerRef = (0, import_react9.useRef)(null);
  const savedScrollRef = (0, import_react9.useRef)(/* @__PURE__ */ new Map());
  const [notFoundPath, setNotFoundPath] = (0, import_react9.useState)(null);
  const path = (0, import_react10.useSyncExternalStore)(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().path,
    () => store.getSnapshot().path
  );
  const prevPathRef = (0, import_react9.useRef)(path);
  (0, import_react9.useEffect)(() => {
    setNotFoundPath(null);
  }, [path]);
  (0, import_react9.useEffect)(() => {
    const prevPath = prevPathRef.current;
    if (prevPath === path) return;
    if (scrollRestoration === "top") {
      window.scrollTo(0, 0);
    } else if (scrollRestoration === "restore") {
      savedScrollRef.current.set(prevPath, window.scrollY);
      const saved = savedScrollRef.current.get(path) ?? 0;
      window.scrollTo(0, saved);
    }
    prevPathRef.current = path;
  }, [path, scrollRestoration]);
  (0, import_react9.useEffect)(() => {
    if (!containerRef.current) return;
    const autofocusEl = containerRef.current.querySelector("[data-autofocus]");
    if (autofocusEl) {
      autofocusEl.focus();
    } else {
      containerRef.current.focus();
    }
  }, [path]);
  const chain = registry.getMatchChain(path);
  if (chain.length === 0 || notFoundPath !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { ref: containerRef, tabIndex: -1, style: { outline: "none" }, children: renderFallback(fallback, notFoundPath ?? path) });
  }
  const routeMap = registry._routes;
  let outlet = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    const key = chain[i];
    const def = routeMap[key];
    const { params } = matchPath(key, path);
    const isLeaf = i === chain.length - 1;
    const isExactParent = isLeaf && path === key && def.index !== void 0;
    const InnerComponent = def.component;
    const capturedOutlet = outlet;
    const capturedKey = key;
    let resolvedOutlet = capturedOutlet;
    if (isExactParent && def.index) {
      const IndexComponent = def.index;
      resolvedOutlet = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(IndexComponent, {});
    }
    const element = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(InnerComponent, { params, outlet: resolvedOutlet });
    outlet = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      RouteBoundary,
      {
        path: capturedKey,
        onNotFound: () => {
          setNotFoundPath(path);
        },
        ...def.loading !== void 0 ? { loading: def.loading } : {},
        ...defaultLoading !== void 0 ? { defaultLoading } : {},
        ...def.error !== void 0 ? { error: def.error } : {},
        ...defaultError !== void 0 ? { defaultError } : {},
        children: element
      },
      capturedKey
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { ref: containerRef, tabIndex: -1, style: { outline: "none" }, children: outlet });
}
function renderFallback(fallback, path) {
  if (fallback === void 0 || fallback === null) return null;
  if (typeof fallback === "function") {
    const Fallback = fallback;
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Fallback, { path });
  }
  return fallback;
}

// src/components/Link.tsx
var import_react11 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function Link(props) {
  if ("href" in props && props.href !== void 0) {
    const { href: href2, children: children2, className: className2, style: style2 } = props;
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("a", { href: href2, className: className2, style: style2, children: children2 });
  }
  const {
    to,
    params = {},
    replace = false,
    state,
    children,
    className,
    activeClassName,
    exactActiveClassName,
    style,
    activeStyle,
    exactActiveStyle
  } = props;
  const store = useRouterStore();
  const currentPath = (0, import_react11.useSyncExternalStore)(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().path,
    () => store.getSnapshot().path
  );
  const href = buildPath(to, params);
  const { matched } = matchPath(to, currentPath);
  const isAncestor = !matched && isSegmentAncestor(to, currentPath);
  const isActive = matched || isAncestor;
  const isExact = matched;
  const computedClassName = [
    className,
    isActive ? activeClassName : void 0,
    isExact ? exactActiveClassName : void 0
  ].filter(Boolean).join(" ") || void 0;
  const computedStyle = {
    ...style,
    ...isActive ? activeStyle : void 0,
    ...isExact ? exactActiveStyle : void 0
  };
  const handleClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    store.navigate(href, { replace, ...state !== void 0 ? { state } : {} });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    "a",
    {
      href,
      className: computedClassName,
      style: Object.keys(computedStyle).length > 0 ? computedStyle : void 0,
      onClick: handleClick,
      children
    }
  );
}
function isSegmentAncestor(pattern, currentPath) {
  if (pattern === "/") return currentPath !== "/" && currentPath.startsWith("/");
  if (!currentPath.startsWith(pattern)) return false;
  const charAfter = currentPath[pattern.length];
  return charAfter === "/";
}

// src/components/containers/StackContainer.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
function StackContainer() {
  const { workspaces, focus, close } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { "data-component": "stack-container", children: workspaces.map((workspace) => {
    const template = templates[workspace.template];
    if (!template) return null;
    const Component2 = template.component;
    const pair = manager.getChannel(workspace.id);
    if (!pair) return null;
    const channel = pair.workspace;
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      WorkspaceSlot,
      {
        workspace,
        channel,
        Component: Component2,
        onFocus: () => focus(workspace.id),
        onClose: () => close(workspace.id)
      },
      workspace.id
    );
  }) });
}
function WorkspaceSlot({ workspace, channel, Component: Component2, onFocus, onClose }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { "data-workspace-id": workspace.id, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { "data-role": "workspace-controls", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { "data-action": "focus", onClick: onFocus, "aria-label": `Focus ${workspace.title}`, children: "Focus" }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { "data-action": "close", onClick: onClose, "aria-label": `Close ${workspace.title}`, children: "Close" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Component2, { workspace, channel })
  ] });
}

// src/components/containers/SwipeContainer.tsx
var import_react12 = require("react");
var import_jsx_runtime6 = require("react/jsx-runtime");
function SwipeContainer() {
  const { workspaces, focus: focusWs, close } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  const trackRef = (0, import_react12.useRef)(null);
  const handleScroll = (0, import_react12.useCallback)(() => {
    const adapter = manager.getAdapter();
    if (!(adapter instanceof SwipeAdapter)) return;
    const track = trackRef.current;
    if (!track) return;
    const itemWidth = track.scrollWidth / Math.max(workspaces.length, 1);
    const index = Math.round(track.scrollLeft / itemWidth);
    adapter.setCurrentIndex(index);
  }, [manager, workspaces.length]);
  const handleFocus = (0, import_react12.useCallback)(
    async (id, index) => {
      await focusWs(id);
      const track = trackRef.current;
      if (!track) return;
      const itemWidth = track.scrollWidth / Math.max(workspaces.length, 1);
      track.scrollTo({ left: itemWidth * index, behavior: "smooth" });
    },
    [focusWs, workspaces.length]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { "data-component": "swipe-container", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "div",
    {
      ref: trackRef,
      "data-role": "swipe-track",
      onScroll: handleScroll,
      style: { overflowX: "auto", display: "flex" },
      children: workspaces.map((workspace, index) => {
        const template = templates[workspace.template];
        if (!template) return null;
        const Component2 = template.component;
        const pair = manager.getChannel(workspace.id);
        if (!pair) return null;
        const channel = pair.workspace;
        return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { "data-workspace-id": workspace.id, style: { flex: "0 0 100%" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { "data-role": "workspace-controls", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                "data-action": "focus",
                onClick: () => handleFocus(workspace.id, index),
                "aria-label": `Focus ${workspace.title}`,
                children: "Focus"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "button",
              {
                "data-action": "close",
                onClick: () => close(workspace.id),
                "aria-label": `Close ${workspace.title}`,
                children: "Close"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(Component2, { workspace, channel })
        ] }, workspace.id);
      })
    }
  ) });
}

// src/components/containers/TabsContainer.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
function TabsContainer() {
  const { workspaces, current, focus } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  const currentWorkspace = current ?? workspaces[workspaces.length - 1] ?? null;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { "data-component": "tabs-container", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { role: "tablist", "data-role": "tab-strip", children: workspaces.map((workspace) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      "button",
      {
        role: "tab",
        "aria-selected": workspace.id === currentWorkspace?.id,
        "data-workspace-id": workspace.id,
        onClick: () => focus(workspace.id),
        children: workspace.title
      },
      workspace.id
    )) }),
    currentWorkspace && (() => {
      const template = templates[currentWorkspace.template];
      if (!template) return null;
      const Component2 = template.component;
      const pair = manager.getChannel(currentWorkspace.id);
      if (!pair) return null;
      const channel = pair.workspace;
      return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { "data-workspace-id": currentWorkspace.id, "data-role": "tab-content", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(Component2, { workspace: currentWorkspace, channel }) });
    })()
  ] });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AppProvider,
  Link,
  RouterView,
  StackContainer,
  SwipeContainer,
  TabsContainer,
  defineRoutes,
  defineWorkspaces,
  navigate,
  notFound,
  useLocation,
  useMeta,
  useNavigation,
  useParams,
  usePrompt,
  useQueryState,
  useRoute,
  useSearchParams,
  useWorkspace,
  useWorkspaceChannel,
  useWorkspaces
});
//# sourceMappingURL=index.cjs.map