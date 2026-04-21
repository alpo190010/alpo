import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface CollapsibleRegionProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  children: ReactNode;
}

const CollapsibleRegion = forwardRef<HTMLDivElement, CollapsibleRegionProps>(
  ({ isOpen, id, className = "", children, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        id={id}
        aria-hidden={!isOpen}
        className={`grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out-quart)] ${className}`}
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", ...style }}
        {...props}
      >
        <div className="overflow-hidden min-h-0">{children}</div>
      </div>
    );
  },
);

CollapsibleRegion.displayName = "CollapsibleRegion";
export default CollapsibleRegion;
