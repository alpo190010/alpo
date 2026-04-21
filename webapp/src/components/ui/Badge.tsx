import { planBadgeStyle, roleBadgeStyle } from "@/lib/format";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  plan?: string;
  role?: string;
}

export default function Badge({
  plan,
  role,
  className = "",
  style,
  children,
  ...props
}: BadgeProps) {
  const autoStyle = plan
    ? planBadgeStyle(plan)
    : role
      ? roleBadgeStyle(role)
      : undefined;

  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-medium tracking-[0.08em] uppercase font-mono ${className}`}
      style={{ ...autoStyle, ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
