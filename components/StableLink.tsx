import type { AnchorHTMLAttributes } from "react";

// Cross-page navigation uses the browser lifecycle so unsaved forms receive
// beforeunload before their React tree is removed. Fragment links stay local.
export default function StableLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
