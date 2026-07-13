import React from "react";
import { useRouterStore } from "../router/context";
import { useSyncExternalStore } from "react";
import { matchPath, buildPath } from "../router/matcher";
import type { LinkParamsProp, RoutePath } from "../router/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LinkToBaseProps<TPath extends string>
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: TPath;
  replace?: boolean;
  state?: Record<string, unknown>;
  children: React.ReactNode;
  activeClassName?: string;
  exactActiveClassName?: string;
  activeStyle?: React.CSSProperties;
  exactActiveStyle?: React.CSSProperties;
  href?: never;
}

/** Typed variant: route key + params enforced when routes are Registered. */
export type LinkToProps<TPath extends string = string> = LinkToBaseProps<TPath> &
  LinkParamsProp<TPath>;

interface LinkHrefProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children: React.ReactNode;
  to?: never;
}

export type LinkProps<TPath extends string = string> =
  | LinkToProps<TPath>
  | LinkHrefProps;

// ─── Link ─────────────────────────────────────────────────────────────────────

export function Link<TPath extends RoutePath = RoutePath>(
  props: LinkProps<TPath>,
): React.ReactElement {
  // Escape hatch: href-based link with no interception or active state.
  // All other anchor attributes (onClick, target, data-*, aria-*) pass through.
  if ("href" in props && props.href !== undefined) {
    const { href, children, to: _to, ...anchorProps } = props;
    return (
      <a href={href} {...anchorProps}>
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
    onClick,
    href: _href,
    ...anchorProps
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
    // User's handler runs first; preventDefault() there opts out of router
    // navigation (mirrors native anchor semantics).
    onClick?.(e);
    if (e.defaultPrevented) return;
    // Pass through modifier-key clicks (new tab, etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    store.navigate(href, { replace, ...(state !== undefined ? { state } : {}) });
  };

  return (
    <a
      {...anchorProps}
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
