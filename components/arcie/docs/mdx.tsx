import { mdxComponents } from "@/components/docs/mdx";
import { Alert, AlertContent } from "@/components/docs/mdx/components/alert";
import type { MDXComponents } from "mdx/types";

// Arcie content is authored with <Callout type="…"> — map it onto the shared
// docs Alert so callouts render exactly like the Cencori docs.
type CalloutType = "note" | "info" | "tip" | "warning";

const CALLOUT_VARIANT: Record<
  CalloutType,
  "default" | "info" | "success" | "warning"
> = {
  note: "default",
  info: "info",
  tip: "success",
  warning: "warning",
};

function Callout({
  type = "note",
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children?: React.ReactNode;
}) {
  const variant = CALLOUT_VARIANT[type] ?? "default";
  return (
    <Alert variant={variant} title={title ?? (type === "tip" ? "Tip" : undefined)}>
      <AlertContent variant={variant}>{children}</AlertContent>
    </Alert>
  );
}

export const arcieMdxComponents: MDXComponents = {
  ...mdxComponents,
  Callout,
};
