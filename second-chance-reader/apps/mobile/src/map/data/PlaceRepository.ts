// The only place-data API screens use. Serves places from an on-device cache so the map
// works offline, and refreshes from the provider when it can. Place data is public, so
// unlike documents it is not encrypted, and it is shared by every profile on the device.
import type { Category, Place } from '@scr/shared';
import type { LocationProvider } from './LocationProvider';

export interface MetaStore {
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

export interface PlacesSnapshot {
  categories: Category[];
  /** Everything except permanently closed places. */
  places: Place[];
  /** When the cache last refreshed from the provider (ISO), or null if never. */
  syncedAt: string | null;
  /** True while showing the bundled sample data. */
  isSample: boolean;
}

interface CacheRecord {
  categories: Category[];
  places: Place[];
  syncedAt: string | null;
}

export class PlaceRepository {
  private cache: CacheRecord | null = null;

  constructor(
    private provider: LocationProvider,
    private store: MetaStore,
    private now = () => new Date(),
  ) {}

  /** Separate cache per source, so sample places never mix with real ones. */
  private get key() { return `places.cache.${this.provider.name}`; }

  private async read(): Promise<CacheRecord> {
    if (this.cache) return this.cache;
    const raw = await this.store.getMeta(this.key);
    this.cache = raw ? JSON.parse(raw) as CacheRecord : { categories: [], places: [], syncedAt: null };
    return this.cache;
  }

  private async write(record: CacheRecord) {
    this.cache = record;
    await this.store.setMeta(this.key, JSON.stringify(record));
  }

  private snapshot(r: CacheRecord): PlacesSnapshot {
    return {
      categories: r.categories,
      places: r.places.filter(p => p.status !== 'permanently_closed'),
      syncedAt: r.syncedAt,
      isSample: this.provider.name === 'sample',
    };
  }

  /** What's on the device right now, without touching the network. */
  async load() {
    return this.snapshot(await this.read());
  }

  /**
   * Fetches categories and every place changed since the last sync, merges them into the
   * cache, and returns the new snapshot. If the provider fails (offline, not connected),
   * the cached places are kept and `ok` is false.
   */
  async refresh(): Promise<{ ok: boolean; snapshot: PlacesSnapshot }> {
    const cached = await this.read();
    const startedAt = this.now().toISOString();
    try {
      const categories = await this.provider.getCategories();
      const changed: Place[] = [];
      let cursor: string | undefined;
      do {
        const page = await this.provider.getPlaces({ updatedSince: cached.syncedAt ?? undefined, cursor });
        changed.push(...page.places);
        cursor = page.nextCursor;
      } while (cursor);

      const byId = new Map(cached.places.map(p => [p.id, p]));
      for (const p of changed) {
        const old = byId.get(p.id);
        if (!old || p.updatedAt >= old.updatedAt) byId.set(p.id, p);
      }
      const record = { categories, places: [...byId.values()], syncedAt: startedAt };
      await this.write(record);
      return { ok: true, snapshot: this.snapshot(record) };
    } catch {
      return { ok: false, snapshot: this.snapshot(cached) };
    }
  }

  /** Re-fetches one place for an open info card; falls back to the cached copy. */
  async getPlace(id: string): Promise<Place | null> {
    const cached = await this.read();
    try {
      const fresh = await this.provider.getPlace(id);
      if (fresh) {
        await this.write({ ...cached, places: [...cached.places.filter(p => p.id !== id), fresh] });
        return fresh.status === 'permanently_closed' ? null : fresh;
      }
      return null;
    } catch {
      const p = cached.places.find(x => x.id === id);
      return p && p.status !== 'permanently_closed' ? p : null;
    }
  }
}
