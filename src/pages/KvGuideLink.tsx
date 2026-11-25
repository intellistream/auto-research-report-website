import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { revealTopicPart } from "./topic-report";
import { kvGuideSearch, type KvGuideTargetState } from "./kv-guide-state";

export function KvGuideLink({ part, children, className, onNavigate, targetState, ariaCurrent }: {
  part: string; children: ReactNode; className?: string; onNavigate?: () => void; targetState?: KvGuideTargetState; ariaCurrent?: "location";
}) {
  const [query] = useSearchParams();
  const search = kvGuideSearch(query, part, targetState);
  return <Link className={className} aria-current={ariaCurrent} to={{ search }}
    state={{ kvGuideNavigation: targetState?.position === undefined ? "chapter" : "position" }}
    onClick={event => {
      // Leave modified clicks and their address entirely to the browser.
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      onNavigate?.();
      if (query.get("part") === part) revealTopicPart(document, part, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    }}>{children}</Link>;
}
