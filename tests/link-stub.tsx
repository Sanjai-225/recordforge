import React from "react";
// Only the isolated browser fixture uses this simple link. Production always uses Next Link.
export default function Link(
  props: React.AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  return <a {...props} />;
}
