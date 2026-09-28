import "./InlineState.css";

import type { ComponentPropsWithoutRef, ReactNode } from "react";

type InlineStateKind = "empty" | "error" | "info" | "success";

type InlineStateProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  children: ReactNode;
  kind?: InlineStateKind;
};

export const InlineState = ({
  children,
  className,
  kind = "info",
  role,
  ...props
}: InlineStateProps) => {
  const resolvedRole =
    role ?? (kind === "error" ? "alert" : kind === "success" ? "status" : undefined);
  const classes = ["inlineState", `inlineState--${kind}`, className].filter(Boolean).join(" ");

  return (
    <div className={classes} role={resolvedRole} {...props}>
      {children}
    </div>
  );
};
