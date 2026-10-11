// Reads the bundled sample places. Every record is fake and marked isSample: true.
import type { Category, Place } from '@scr/shared';
import type { LocationProvider } from '../LocationProvider';
import { PAGE_SIZE } from '../LocationProvider';
import sample from '../sample-places.json';

interface SampleData { categories: Category[]; places: Place[] }

export class SampleLocationProvider implements LocationProvider {
  readonly name = 'sample';

  constructor(private data: SampleData = sample as SampleData) {}

  async getCategories() {
    return [...this.data.categories].sort((a, b) => a.order - b.order);
  }

  async getPlaces({ updatedSince, cursor }: { updatedSince?: string; cursor?: string }) {
    const changed = this.data.places.filter(p => !updatedSince || p.updatedAt > updatedSince);
    const start = cursor ? Number(cursor) : 0;
    const end = start + PAGE_SIZE;
    return { places: changed.slice(start, end), nextCursor: end < changed.length ? String(end) : undefined };
  }

  async getPlace(id: string) {
    return this.data.places.find(p => p.id === id) ?? null;
  }
}
