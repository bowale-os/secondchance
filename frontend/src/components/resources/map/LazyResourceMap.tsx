import { lazy, Suspense } from "react";
import type { ResourceMapProps } from "./ResourceMap";

// MapLibre is about 1 MB, so it loads only when a map is first shown.
const ResourceMap = lazy(() => import("./ResourceMap"));

export default function LazyResourceMap(props: ResourceMapProps) {
  return (
    <Suspense fallback={<p className="dash-empty" role="status">Loading map…</p>}>
      <ResourceMap {...props} />
    </Suspense>
  );
}
