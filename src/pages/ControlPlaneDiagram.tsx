import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoveHorizontal } from "lucide-react";

export default function ControlPlaneDiagram({ label, children }: { label: string; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;

    const updateOverflow = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    updateOverflow();
    return () => observer.disconnect();
  }, []);

  return <div className="cp-diagram">
    <div className="cp-map-scroll" ref={viewport} role="region" tabIndex={0}
      aria-label={label} aria-describedby={overflowing ? hintId : undefined}>
      {children}
    </div>
    {overflowing && <p className="cp-map-hint" id={hintId}>
      <MoveHorizontal size={16} aria-hidden />左右滑动查看完整图
    </p>}
  </div>;
}
