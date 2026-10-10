import type { Category } from '@scr/shared';
import type { MapView } from '../geo/bounds';
import type { Cluster, MapItem, Site } from '../logic/pins';
import type { Size } from '../geo/viewMath';

export interface MapCanvasProps {
  view: MapView;
  items: MapItem[];
  categories: Category[];
  selectedKey: string | null;
  /** Place ids that are closed right now (shown with a closed mark). */
  closedIds: Set<string>;
  reduceMotion: boolean;
  onSize: (size: Size) => void;
  onSelectSite: (site: Site) => void;
  onSelectCluster: (cluster: Cluster) => void;
}
