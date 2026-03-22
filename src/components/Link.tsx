import React from "react";
import { useRouterStore } from "../router/context";
import { useSyncExternalStore } from "react";
import { matchPath, buildPath } from "../router/matcher";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LinkToProps {
  to: string;
  params?: Record<string, string>;
  replace?: boolean;
  state?: Record<string, unknown>;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  exactActiveClassName?: string;
  style?: React.CSSProperties;
  activeStyle?: React.CSSProperties;
  exactActiveStyle?: React.CSSProperties;
  href?: never;
}

interface LinkHrefProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  to?: never;
}

export type LinkProps = LinkToProps | LinkHrefProps;

// ─── Link ─────────────────────────────────────────────────────────────────────

export function Link(props: LinkProps): React.ReactElement {
  // Escape hatch: href-based link with no interception or active state.
  if ("href" in props && props.href !== undefined) {
    const { href, children, className, style } = props;
    return (
      <a href={href} className={className} style={style}>
        {children}
      </a>
    );
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
    exactActiveStyle,
  } = props as LinkToProps;

  const store = useRouterStore();

  const currentPath = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot().path,
    () => store.getSnapshot().path,
  );

  const href = buildPath(to, params);

  // Determine active state
  const { matched } = matchPath(to, currentPath);
  // Ancestor match: current path starts with this route (at segment boundary)
  const isAncestor = !matched && isSegmentAncestor(to, currentPath);
  const isActive = matched || isAncestor;
  const isExact = matched;

  // Merge class names
  const computedClassName = [
    className,
    isActive ? activeClassName : undefined,
    isExact ? exactActiveClassName : undefined,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  // Merge styles
  const computedStyle: React.CSSProperties = {
    ...style,
    ...(isActive ? activeStyle : undefined),
    ...(isExact ? exactActiveStyle : undefined),
  };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Pass through modifier-key clicks (new tab, etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    store.navigate(href, { replace, state });
  };

  return (
    <a
      href={href}
      className={computedClassName}
      style={Object.keys(computedStyle).length > 0 ? computedStyle : undefined}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSegmentAncestor(pattern: string, currentPath: string): boolean {
  if (pattern === "/") return currentPath !== "/" && currentPath.startsWith("/");
  if (!currentPath.startsWith(pattern)) return false;
  const charAfter = currentPath[pattern.length];
  return charAfter === "/";
}
