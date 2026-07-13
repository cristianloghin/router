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
  WorkspaceError: () => WorkspaceError,
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
    const isProduction = typeof process !== "undefined" && process.env?.NODE_ENV === "production";
    if (!isProduction) {
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
      e.returnValue = message;
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
    const isWorkspace = this.isWorkspacePath(resolvedPath);
    const eventTo = isWorkspace ? this.state.path : resolvedPath;
    const eventType = type === "push" && replace ? "replace" : type;
    if (this.onPrompt) {
      if (!this.onPrompt("")) return;
    }
    if (this.onBeforeNavigate) {
      let cancelled = false;
      this.onBeforeNavigate({
        from: this.previousPath,
        to: eventTo,
        type: eventType,
        cancel: () => {
          cancelled = true;
        }
      });
      if (cancelled) return;
    }
    if (isWorkspace) {
      if (replace) {
        window.history.replaceState(state ?? null, "", resolvedPath);
      } else {
        window.history.pushState(state ?? null, "", resolvedPath);
      }
      this.onNavigate?.({ from: this.previousPath, to: eventTo, type: eventType });
      return;
    }
    if (this.routeGuard) {
      let verdict;
      try {
        verdict = this.routeGuard(resolvedPath);
      } catch {
        return;
      }
      if (verdict === false) return;
      if (typeof verdict === "string") {
        this.navigate(verdict, { replace }, type);
        return;
      }
      if (verdict instanceof Promise) {
        void verdict.then(
          (v) => {
            if (v === false) return;
            if (typeof v === "string") {
              this.navigate(v, { replace }, type);
              return;
            }
            this.commitNavigation(resolvedPath, replace, state, type, eventType);
          },
          () => {
          }
        );
        return;
      }
    }
    this.commitNavigation(resolvedPath, replace, state, type, eventType);
  }
  commitNavigation(resolvedPath, replace, state, type, eventType) {
    const prevPath = this.previousPath;
    if (type === "workspace-close") {
      window.history.replaceState(state ?? null, "", resolvedPath);
      this.previousPath = resolvedPath;
      this.setState({
        path: resolvedPath,
        searchParams: new URLSearchParams(window.location.search),
        canGoBack: this.historyStack.canGoBack
      });
      this.onNavigate?.({ from: prevPath, to: resolvedPath, type });
      return;
    }
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
    this.onNavigate?.({ from: prevPath, to: resolvedPath, type: eventType });
  }
  back() {
    if (!this.historyStack.canGoBack) return;
    if (this.onPrompt && !this.onPrompt("")) return;
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
function setActiveStore(store) {
  _store = store;
}
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
var import_react8 = require("react");
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
function createWorkspaceChannel(workspaceId, bus, options = {}) {
  const ns = bus.namespace(`workspace:${workspaceId}`);
  const rootToWs = ns.channel("root-to-ws");
  const wsToRoot = ns.channel("ws-to-root");
  let broadcast = null;
  let exposedRootToWs = rootToWs;
  let exposedWsToRoot = wsToRoot;
  if (options.crossTab && typeof BroadcastChannel !== "undefined") {
    broadcast = new BroadcastChannel(`chbus:workspace:${workspaceId}`);
    broadcast.onmessage = (event) => {
      const message = event.data;
      if (!message || message.channel !== "root-to-ws" && message.channel !== "ws-to-root") {
        return;
      }
      const target = message.channel === "root-to-ws" ? rootToWs : wsToRoot;
      target.emit(
        message.action,
        message.payload
      );
    };
    exposedRootToWs = bridgeEmit(rootToWs, "root-to-ws", broadcast);
    exposedWsToRoot = bridgeEmit(wsToRoot, "ws-to-root", broadcast);
  }
  return {
    workspace: {
      inbound: exposedRootToWs,
      outbound: exposedWsToRoot
    },
    root: {
      outbound: exposedRootToWs,
      inbound: exposedWsToRoot
    },
    destroy() {
      broadcast?.close();
      rootToWs.destroy();
      wsToRoot.destroy();
    }
  };
}
function bridgeEmit(channel, name, broadcast) {
  return new Proxy(channel, {
    get(target, prop, receiver) {
      if (prop === "emit" || prop === "emitAsync") {
        return (action, payload) => {
          broadcast.postMessage({ channel: name, action, payload });
          return target[prop](action, payload);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });
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
function deserialize(raw, type) {
  if (raw === void 0) return void 0;
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
function paramsToRecord(schema, searchParams) {
  const result = {};
  for (const [key, type] of Object.entries(schema)) {
    if (type === "string[]" || type === "number[]") {
      const values = searchParams.getAll(key);
      if (values.length > 0) {
        result[key] = deserialize(values, type);
      }
    } else {
      const value = searchParams.get(key);
      if (value !== null) {
        result[key] = deserialize(value, type);
      }
    }
  }
  return result;
}

// src/workspaces/WorkspaceManager.ts
var PERSIST_KEY_PATTERN = /^ws:v\d+$/;
function getSessionStorage() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
var WorkspaceManager = class {
  constructor(config) {
    /** Channel pairs keyed by workspace id. */
    this.channels = /* @__PURE__ */ new Map();
    /** Origin path stored at open() time, keyed by workspace id. */
    this.origins = /* @__PURE__ */ new Map();
    /** Listeners for manager-originated events (auth-failed, error). */
    this.managerListeners = /* @__PURE__ */ new Set();
    this.adapter = config.adapter;
    this.guard = config.guard;
    this._navigate = config.navigate;
    this.bus = config.bus;
    this.templates = config.templates;
    this.basePath = config.workspaceBasePath ?? "/workspace";
    this.maxWorkspaces = config.maxWorkspaces ?? 10;
    this.getCurrentPath = config.getCurrentPath ?? (() => typeof window !== "undefined" ? window.location.pathname : "/");
    this.onCredentialAttempt = config.onCredentialAttempt;
    this.persistKey = config.persist ? `ws:v${config.persist.version}` : null;
    if (this.persistKey) {
      this.restoreFromStorage();
      this.adapter.subscribe(() => this.persistToStorage());
    }
    this.resolveDirectAccess();
  }
  // ─── direct access (spec §6.2 / §6.4) ────────────────────────────────────────
  resolveDirectAccess() {
    if (typeof window === "undefined") return;
    const reconstructed = this.descriptorFromLocation();
    if (!reconstructed) return;
    const template = this.templates[reconstructed.template];
    const rule = template.auth ?? { type: "public" };
    let workspace = this.adapter.getAll().find((w) => w.id === reconstructed.id);
    if (!workspace) {
      workspace = reconstructed;
      this.channels.set(workspace.id, this.createChannelPair(workspace.id));
      this.origins.set(workspace.id, "/");
      void this.adapter.open(workspace);
    }
    if (rule.type === "public") {
      this.setAuthGranted(workspace.id, true);
      return;
    }
    this.setAuthGranted(workspace.id, false);
    if (rule.type === "credential") return;
    const workspaceId = workspace.id;
    void this.guard.evaluate(rule, {
      workspaceId,
      template: workspace.template,
      params: workspace.params,
      isDirectAccess: true
    }).then((granted) => {
      if (granted) {
        this.setAuthGranted(workspaceId, true);
      } else {
        this.emitManagerEvent({ type: "workspace:auth-failed", workspaceId, rule });
      }
    });
  }
  /**
   * Reconstructs a workspace descriptor from the current location using the
   * template schema for param deserialization (spec §5.3). Returns null when
   * the location is not a workspace URL or the template is unknown.
   */
  descriptorFromLocation() {
    const { pathname, search } = window.location;
    if (!pathname.startsWith(this.basePath + "/")) return null;
    const [templateKey, id] = pathname.slice(this.basePath.length + 1).split("/");
    if (!templateKey || !id) return null;
    const template = this.templates[templateKey];
    if (!template) return null;
    const searchParams = new URLSearchParams(search);
    const title = searchParams.get("title") ?? templateKey;
    let params = {};
    if (template.schema) {
      const schema = {};
      for (const [key, type] of Object.entries(template.schema)) {
        if (type !== void 0) schema[key] = type;
      }
      params = paramsToRecord(schema, searchParams);
    } else {
      for (const [key, value] of searchParams.entries()) {
        if (key === "title") continue;
        params[key] = value;
      }
    }
    const rule = template.auth ?? { type: "public" };
    return {
      id,
      template: templateKey,
      title,
      params,
      createdAt: Date.now(),
      auth: { type: rule.type, granted: false }
    };
  }
  /**
   * Re-evaluates a workspace's auth rule (spec §6.4 AuthGate retry).
   * Credentials, when provided, are forwarded to onCredentialAttempt and used
   * for credential-rule validation.
   */
  async retryAuth(id, input) {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }
    const template = this.templates[workspace.template];
    const rule = template?.auth ?? { type: "public" };
    if (input) this.onCredentialAttempt?.(input, id);
    const granted = await this.guard.evaluate(
      rule,
      {
        workspaceId: id,
        template: workspace.template,
        params: workspace.params,
        isDirectAccess: true
      },
      input
    );
    if (granted) {
      this.setAuthGranted(id, true);
    } else {
      this.emitManagerEvent({ type: "workspace:auth-failed", workspaceId: id, rule });
    }
  }
  setAuthGranted(id, granted) {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace || workspace.auth.granted === granted) return;
    workspace.auth.granted = granted;
    this.emitManagerEvent({ type: "workspace:updated", workspace: { ...workspace } });
    this.persistToStorage();
  }
  // ─── persistence ─────────────────────────────────────────────────────────────
  restoreFromStorage() {
    const storage = getSessionStorage();
    if (!storage || !this.persistKey) return;
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key && PERSIST_KEY_PATTERN.test(key) && key !== this.persistKey) {
        storage.removeItem(key);
      }
    }
    const raw = storage.getItem(this.persistKey);
    if (!raw) return;
    let state;
    try {
      state = JSON.parse(raw);
      if (!state || !Array.isArray(state.workspaces)) throw new Error("malformed");
    } catch {
      storage.removeItem(this.persistKey);
      return;
    }
    const descriptors = state.workspaces.filter((w) => this.templates[w.template]);
    if (descriptors.length === 0) return;
    for (const d of descriptors) {
      this.channels.set(d.id, this.createChannelPair(d.id));
      this.origins.set(d.id, state.origins?.[d.id] ?? "/");
    }
    this.adapter.restoreState(descriptors);
    if (state.currentId && descriptors.some((d) => d.id === state.currentId)) {
      void this.adapter.focus(state.currentId);
    }
  }
  persistToStorage() {
    const storage = getSessionStorage();
    if (!storage || !this.persistKey) return;
    const state = {
      workspaces: this.adapter.getAll(),
      currentId: this.adapter.getCurrent()?.id ?? null,
      origins: Object.fromEntries(this.origins)
    };
    try {
      storage.setItem(this.persistKey, JSON.stringify(state));
    } catch {
    }
  }
  // ─── adapterType ────────────────────────────────────────────────────────────
  get adapterType() {
    return this.adapter.type;
  }
  /** Channels are bridged across tabs under the tabs adapter (spec §7.5). */
  createChannelPair(workspaceId) {
    return createWorkspaceChannel(workspaceId, this.bus, {
      crossTab: this.adapter.type === "tabs"
    });
  }
  // ─── open ────────────────────────────────────────────────────────────────────
  async open(input) {
    const templateKey = String(input.template);
    const template = this.templates[templateKey];
    if (!template) {
      throw new WorkspaceError("ADAPTER_ERROR", `Unknown template: ${templateKey}`, null);
    }
    if (this.adapter.getAll().length >= this.maxWorkspaces) {
      throw new WorkspaceError(
        "MAX_WORKSPACES_REACHED",
        `Maximum open workspaces (${this.maxWorkspaces}) reached`,
        null
      );
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
      this.emitManagerEvent({
        type: "workspace:auth-failed",
        workspaceId: descriptor.id,
        rule: authRule
      });
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
    const channelPair = this.createChannelPair(descriptor.id);
    this.channels.set(descriptor.id, channelPair);
    const origin = this.getCurrentPath();
    this.origins.set(descriptor.id, origin);
    try {
      await this.adapter.open(descriptor);
    } catch (err) {
      channelPair.destroy();
      this.channels.delete(descriptor.id);
      this.origins.delete(descriptor.id);
      throw this.adapterFailure(descriptor.id, "open", err);
    }
    const url = this.buildUrl(descriptor);
    this._navigate(url, {
      state: { origin, workspaceId: descriptor.id },
      navType: "workspace-open"
    });
    return descriptor;
  }
  // ─── focus ───────────────────────────────────────────────────────────────────
  async focus(id) {
    const workspace = this.adapter.getAll().find((w) => w.id === id);
    if (!workspace) {
      throw new WorkspaceError("WORKSPACE_NOT_FOUND", `Workspace "${id}" not found`, id);
    }
    try {
      await this.adapter.focus(id);
    } catch (err) {
      throw this.adapterFailure(id, "focus", err);
    }
    const url = this.buildUrl(workspace);
    this._navigate(url, { navType: "workspace-open" });
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
    const historyState = typeof window !== "undefined" ? window.history.state : null;
    const origin = historyState?.workspaceId === id && historyState.origin ? historyState.origin : this.origins.get(id) ?? "/";
    this.origins.delete(id);
    try {
      await this.adapter.close(id, autoFocus);
    } catch (err) {
      throw this.adapterFailure(id, "close", err);
    }
    this._navigate(origin, { navType: "workspace-close" });
  }
  /** Emits workspace:error and returns a WorkspaceError(ADAPTER_ERROR) to throw. */
  adapterFailure(workspaceId, op, err) {
    const error = err instanceof Error ? err : new Error(String(err));
    this.emitManagerEvent({ type: "workspace:error", workspaceId, error });
    return new WorkspaceError(
      "ADAPTER_ERROR",
      `Adapter ${op} failed: ${error.message}`,
      workspaceId
    );
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
    this.managerListeners.add(listener);
    const unsubscribe = this.adapter.subscribe(listener);
    return () => {
      this.managerListeners.delete(listener);
      unsubscribe();
    };
  }
  emitManagerEvent(event) {
    for (const listener of this.managerListeners) {
      listener(event);
    }
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
  async evaluate(rule, context, credentialOverride) {
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
        const input = credentialOverride ?? this.config.credentialInput ?? (this.config.requestCredential ? await this.config.requestCredential(context.workspaceId) : { username: "", password: "" });
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
};

// src/workspaces/auth/credentialRequests.ts
var CredentialRequestStore = class {
  constructor() {
    this.pending = null;
    this.listeners = /* @__PURE__ */ new Set();
    this.getSnapshot = () => this.pending;
    this.subscribe = (listener) => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    };
  }
  request(workspaceId) {
    return new Promise((resolve) => {
      this.pending = {
        workspaceId,
        resolve: (input) => {
          this.pending = null;
          this.notify();
          resolve(input);
        }
      };
      this.notify();
    });
  }
  notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
};

// src/workspaces/auth/AuthGate.tsx
var import_react7 = require("react");

// src/provider/context.ts
var import_react6 = require("react");
var AppConfigContext = (0, import_react6.createContext)({});
function useAppConfig() {
  return (0, import_react6.useContext)(AppConfigContext);
}

// src/workspaces/auth/AuthGate.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function CredentialForm({
  label,
  onSubmit,
  onCancel
}) {
  const [username, setUsername] = (0, import_react7.useState)("");
  const [password, setPassword] = (0, import_react7.useState)("");
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "form",
    {
      "aria-label": label,
      "data-component": "credential-form",
      onSubmit: (e) => {
        e.preventDefault();
        onSubmit({ username, password });
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          "Username",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              name: "username",
              autoComplete: "username",
              value: username,
              onChange: (e) => setUsername(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: [
          "Password",
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              name: "password",
              type: "password",
              autoComplete: "current-password",
              value: password,
              onChange: (e) => setPassword(e.target.value)
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "submit", children: "Submit" }),
        onCancel && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", onClick: onCancel, children: "Cancel" })
      ]
    }
  );
}
function DefaultAuthGate({
  workspace,
  authRule,
  retry
}) {
  if (authRule.type === "credential") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      CredentialForm,
      {
        label: `Credentials required for ${workspace.title}`,
        onSubmit: (input) => {
          void retry(input);
        }
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { role: "alert", "data-component": "auth-gate", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
      "Access to ",
      workspace.title,
      " requires authorization."
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { onClick: () => void retry(), children: "Retry" })
  ] });
}
function GatedWorkspaceContent({
  workspace,
  channel,
  Component: Component2
}) {
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  const { AuthGate } = useAppConfig();
  if (workspace.auth.granted) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Component2, { workspace, channel });
  }
  const authRule = templates[workspace.template]?.auth ?? { type: "public" };
  const Gate = AuthGate ?? DefaultAuthGate;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    Gate,
    {
      workspace,
      authRule,
      retry: (input) => manager.retryAuth(workspace.id, input)
    }
  );
}

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

// src/provider/AppProvider.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function CredentialDialogHost({
  store
}) {
  const pending = (0, import_react8.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
  if (!pending) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { role: "dialog", "aria-modal": "true", "data-component": "credential-dialog", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    CredentialForm,
    {
      label: "Credentials required",
      onSubmit: (input) => pending.resolve(input),
      onCancel: () => pending.resolve(null)
    }
  ) });
}
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
  const storeRef = (0, import_react8.useRef)(null);
  const registryRef = (0, import_react8.useRef)(null);
  const managerRef = (0, import_react8.useRef)(null);
  const busRef = (0, import_react8.useRef)(null);
  const credentialsRef = (0, import_react8.useRef)(null);
  if (!storeRef.current) {
    const basePath = config.workspaceBasePath ?? "/workspace";
    if (config.persistWorkspaces && config.persistVersion === void 0) {
      throw new Error(
        "[@mikrostack/router] persistWorkspaces: true requires persistVersion to be set (spec \xA75.3)"
      );
    }
    storeRef.current = new RouterStore(meta, basePath);
    registryRef.current = new RouteRegistry(routes);
    busRef.current = externalBus ?? (0, import_chbus.createBus)();
    const adapter = createAdapter(config.adapter);
    credentialsRef.current = new CredentialRequestStore();
    const credentials = credentialsRef.current;
    const onCredentialAttempt = config.auth?.onCredentialAttempt;
    const guard = new WorkspaceGuard({
      isAuthenticated: config.auth?.isAuthenticated ?? (() => false),
      requestCredential: async (workspaceId) => {
        const input = await credentials.request(workspaceId);
        if (input) onCredentialAttempt?.(input, workspaceId);
        return input;
      }
    });
    const store2 = storeRef.current;
    const navigate2 = (url, opts = {}) => {
      const navOpts = {};
      if (opts.replace !== void 0) navOpts.replace = opts.replace;
      if (opts.state !== void 0) navOpts.state = opts.state;
      store2.navigate(url, navOpts, opts.navType ?? "push");
    };
    managerRef.current = new WorkspaceManager({
      adapter,
      guard,
      navigate: navigate2,
      bus: busRef.current,
      templates: workspaces,
      workspaceBasePath: basePath,
      getCurrentPath: () => store2.getSnapshot().path,
      ...onCredentialAttempt !== void 0 ? { onCredentialAttempt } : {},
      ...config.maxWorkspaces !== void 0 ? { maxWorkspaces: config.maxWorkspaces } : {},
      ...config.persistWorkspaces && config.persistVersion !== void 0 ? { persist: { version: config.persistVersion } } : {}
    });
    const registry = registryRef.current;
    const manager = managerRef.current;
    const routeMap = routes;
    store2.routeGuard = (path) => {
      const chain = registry.getMatchChain(path);
      const guarded = chain.flatMap((key) => {
        const routeGuard = routeMap[key]?.guard;
        return routeGuard ? [{ key, guard: routeGuard }] : [];
      });
      if (guarded.length === 0) return true;
      const makeContext = () => {
        const snap = store2.getSnapshot();
        const currentChain = registry.getMatchChain(snap.path);
        const leaf = currentChain[currentChain.length - 1];
        return {
          path: snap.path,
          params: leaf ? matchPath(leaf, snap.path).params : {},
          searchParams: snap.searchParams,
          inWorkspace: store2.isWorkspacePath(window.location.pathname),
          currentWorkspace: manager.getCurrent()
        };
      };
      const runFrom = (index) => {
        for (let i = index; i < guarded.length; i++) {
          const entry = guarded[i];
          const { params } = matchPath(entry.key, path);
          const verdict = entry.guard(params, makeContext());
          if (verdict === true) continue;
          if (verdict instanceof Promise) {
            return verdict.then((r) => r === true ? runFrom(i + 1) : r);
          }
          return verdict;
        }
        return true;
      };
      return runFrom(0);
    };
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
  (0, import_react8.useEffect)(() => {
    setActiveStore(storeRef.current);
    return () => {
      setActiveStore(null);
      storeRef.current?.destroy();
    };
  }, []);
  const appConfig = {};
  if (config.defaultLoading !== void 0) appConfig.defaultLoading = config.defaultLoading;
  if (config.defaultError !== void 0) appConfig.defaultError = config.defaultError;
  if (config.components?.AuthGate !== void 0) appConfig.AuthGate = config.components.AuthGate;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RouterStoreContext.Provider, { value: store, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(RouteRegistryContext.Provider, { value: registryRef.current, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(WorkspaceManagerContext.Provider, { value: managerRef.current, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(WorkspaceTemplatesContext.Provider, { value: workspaces, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(AppConfigContext.Provider, { value: appConfig, children: [
    children,
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(CredentialDialogHost, { store: credentialsRef.current })
  ] }) }) }) }) });
}

// src/components/RouterView.tsx
var import_react10 = require("react");
var import_react11 = require("react");

// src/router/boundaries.tsx
var import_react9 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var RouteErrorBoundary = class extends import_react9.Component {
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
  componentDidUpdate(prevProps) {
    if (prevProps.path !== this.props.path && (this.state.error !== null || this.state.isNotFound)) {
      this.reset();
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
      return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(ErrorComponent, { error, reset: this.reset, path });
    }
    return this.props.children;
  }
};
function DefaultErrorDisplay({ error, reset }) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { role: "alert", style: { padding: "1rem", border: "1px solid red" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { children: error.message }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { onClick: reset, children: "Retry" })
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RouteErrorBoundary, { ...errorBoundaryProps, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_react9.Suspense, { fallback: loadingFallback, children }) });
}
function resolveLoading(loading) {
  if (loading === void 0 || loading === null) return null;
  if (typeof loading === "function") {
    const LoadingComponent = loading;
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(LoadingComponent, {});
  }
  return loading;
}

// src/components/RouterView.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function RouterView({
  fallback,
  scrollRestoration = "top",
  defaultLoading: defaultLoadingProp,
  defaultError: defaultErrorProp
}) {
  const store = useRouterStore();
  const registry = useRouteRegistry();
  const appConfig = useAppConfig();
  const defaultLoading = defaultLoadingProp ?? appConfig.defaultLoading;
  const defaultError = defaultErrorProp ?? appConfig.defaultError;
  const containerRef = (0, import_react10.useRef)(null);
  const savedScrollRef = (0, import_react10.useRef)(/* @__PURE__ */ new Map());
  const [notFoundPath, setNotFoundPath] = (0, import_react10.useState)(null);
  const storePath = (0, import_react11.useSyncExternalStore)(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().path,
    () => store.getSnapshot().path
  );
  const [path, setPath] = (0, import_react10.useState)(storePath);
  const [isPending, startTransition] = (0, import_react10.useTransition)();
  (0, import_react10.useEffect)(() => {
    if (storePath !== path) {
      startTransition(() => {
        setPath(storePath);
      });
    }
  }, [storePath, path]);
  (0, import_react10.useEffect)(() => {
    store.setTransitioning(isPending);
  }, [isPending, store]);
  const prevPathRef = (0, import_react10.useRef)(path);
  (0, import_react10.useEffect)(() => {
    setNotFoundPath(null);
  }, [path]);
  (0, import_react10.useEffect)(() => {
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
  (0, import_react10.useEffect)(() => {
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
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { ref: containerRef, tabIndex: -1, style: { outline: "none" }, children: renderFallback(fallback, notFoundPath ?? path) });
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
      resolvedOutlet = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(IndexComponent, {});
    }
    const element = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(InnerComponent, { params, outlet: resolvedOutlet });
    outlet = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
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
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { ref: containerRef, tabIndex: -1, style: { outline: "none" }, children: outlet });
}
function renderFallback(fallback, path) {
  if (fallback === void 0 || fallback === null) return null;
  if (typeof fallback === "function") {
    const Fallback = fallback;
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Fallback, { path });
  }
  return fallback;
}

// src/components/Link.tsx
var import_react12 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function Link(props) {
  if ("href" in props && props.href !== void 0) {
    const { href: href2, children: children2, className: className2, style: style2 } = props;
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("a", { href: href2, className: className2, style: style2, children: children2 });
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
  const currentPath = (0, import_react12.useSyncExternalStore)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
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
var import_jsx_runtime6 = require("react/jsx-runtime");
function StackContainer() {
  const { workspaces, focus, close } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { "data-component": "stack-container", children: workspaces.map((workspace) => {
    const template = templates[workspace.template];
    if (!template) return null;
    const Component2 = template.component;
    const pair = manager.getChannel(workspace.id);
    if (!pair) return null;
    const channel = pair.workspace;
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
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
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { "data-workspace-id": workspace.id, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { "data-role": "workspace-controls", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { "data-action": "focus", onClick: onFocus, "aria-label": `Focus ${workspace.title}`, children: "Focus" }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { "data-action": "close", onClick: onClose, "aria-label": `Close ${workspace.title}`, children: "Close" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(GatedWorkspaceContent, { workspace, channel, Component: Component2 })
  ] });
}

// src/components/containers/SwipeContainer.tsx
var import_react13 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
function SwipeContainer() {
  const { workspaces, focus: focusWs, close } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  const trackRef = (0, import_react13.useRef)(null);
  const handleScroll = (0, import_react13.useCallback)(() => {
    const adapter = manager.getAdapter();
    if (!(adapter instanceof SwipeAdapter)) return;
    const track = trackRef.current;
    if (!track) return;
    const itemWidth = track.scrollWidth / Math.max(workspaces.length, 1);
    const index = Math.round(track.scrollLeft / itemWidth);
    adapter.setCurrentIndex(index);
  }, [manager, workspaces.length]);
  const handleFocus = (0, import_react13.useCallback)(
    async (id, index) => {
      await focusWs(id);
      const track = trackRef.current;
      if (!track) return;
      const itemWidth = track.scrollWidth / Math.max(workspaces.length, 1);
      track.scrollTo({ left: itemWidth * index, behavior: "smooth" });
    },
    [focusWs, workspaces.length]
  );
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { "data-component": "swipe-container", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
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
        return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { "data-workspace-id": workspace.id, style: { flex: "0 0 100%" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { "data-role": "workspace-controls", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "button",
              {
                "data-action": "focus",
                onClick: () => handleFocus(workspace.id, index),
                "aria-label": `Focus ${workspace.title}`,
                children: "Focus"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "button",
              {
                "data-action": "close",
                onClick: () => close(workspace.id),
                "aria-label": `Close ${workspace.title}`,
                children: "Close"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(GatedWorkspaceContent, { workspace, channel, Component: Component2 })
        ] }, workspace.id);
      })
    }
  ) });
}

// src/components/containers/TabsContainer.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function TabsContainer() {
  const { workspaces, current, focus } = useWorkspaces();
  const manager = useWorkspaceManagerContext();
  const templates = useWorkspaceTemplates();
  const currentWorkspace = current ?? workspaces[workspaces.length - 1] ?? null;
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { "data-component": "tabs-container", children: [
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { role: "tablist", "data-role": "tab-strip", children: workspaces.map((workspace) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
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
      return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { "data-workspace-id": currentWorkspace.id, "data-role": "tab-content", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(GatedWorkspaceContent, { workspace: currentWorkspace, channel, Component: Component2 }) });
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
  WorkspaceError,
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