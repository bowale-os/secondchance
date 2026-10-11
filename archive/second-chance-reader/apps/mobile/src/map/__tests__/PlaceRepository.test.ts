import { describe, expect, it, vi } from 'vitest';
import type { Category, Place } from '@scr/shared';
import { PlaceRepository } from '../data/PlaceRepository';
import { SampleLocationProvider } from '../data/providers/SampleLocationProvider';
import { ApiLocationProvider } from '../data/providers/ApiLocationProvider';
import { MemoryBackend } from '../../storage/backends/MemoryBackend';

const cat: Category = { id: 'courts', label: 'Courts', icon: 'bank', colorToken: 'courts', order: 0 };
const place = (id: string, over: Partial<Place> = {}): Place => ({
  id, name: `SAMPLE — ${id}`, categoryId: 'courts', buildingType: 'County courthouse',
  location: { lat: 33.75, lng: -84.39 }, address: { street: '1 Sample St', city: 'Atlanta', state: 'GA', zip: '30303' },
  county: 'fulton', hours: [], hoursExceptions: [], services: [], status: 'open',
  lastVerified: '2026-10-01', updatedAt: '2026-10-01T00:00:00Z', ...over,
});

describe('PlaceRepository', () => {
  it('starts empty, fills from the provider, and works offline afterward', async () => {
    const store = new MemoryBackend();
    const repo = new PlaceRepository(new SampleLocationProvider(), store);
    expect((await repo.load()).places).toHaveLength(0);

    const { ok, snapshot } = await repo.refresh();
    expect(ok).toBe(true);
    expect(snapshot.isSample).toBe(true);
    expect(snapshot.categories).toHaveLength(10);
    expect(snapshot.places.length).toBeGreaterThan(30);

    // A fresh repository on the same device reads the cache with no provider at all.
    const offline = new PlaceRepository(new ApiLocationProvider(''), store);
    expect((await offline.load()).places).toHaveLength(0);   // separate cache per source
    const again = new PlaceRepository(new SampleLocationProvider(), store);
    expect((await again.load()).places).toHaveLength(snapshot.places.length);
  });

  it('hides permanently closed places but keeps temporarily closed ones', async () => {
    const repo = new PlaceRepository(new SampleLocationProvider(), new MemoryBackend());
    const { snapshot } = await repo.refresh();
    expect(snapshot.places.find(p => p.id === 'sample-jobs_training-4')).toBeUndefined();
    expect(snapshot.places.find(p => p.id === 'sample-food-2')?.status).toBe('temporarily_closed');
  });

  it('keeps the cached places when the backend is not reachable', async () => {
    const store = new MemoryBackend();
    const provider = new SampleLocationProvider({ categories: [cat], places: [place('a')] });
    const repo = new PlaceRepository(provider, store);
    await repo.refresh();

    vi.spyOn(provider, 'getPlaces').mockRejectedValueOnce(new Error('offline'));
    const { ok, snapshot } = await repo.refresh();
    expect(ok).toBe(false);
    expect(snapshot.places.map(p => p.id)).toEqual(['a']);
  });

  it('only asks for changes since the last sync, pages through them, and merges newest-wins', async () => {
    let t = Date.parse('2026-10-05T00:00:00Z');
    const data = { categories: [cat], places: [place('a'), place('b')] };
    const provider = new SampleLocationProvider(data);
    const spy = vi.spyOn(provider, 'getPlaces');
    const repo = new PlaceRepository(provider, new MemoryBackend(), () => new Date(t));

    await repo.refresh();
    expect(spy.mock.calls[0][0]).toEqual({ updatedSince: undefined, cursor: undefined });

    data.places = [place('a', { name: 'SAMPLE — renamed', updatedAt: '2026-10-06T00:00:00Z' }), place('b'), place('c', { updatedAt: '2026-10-06T00:00:00Z' })];
    t = Date.parse('2026-10-07T00:00:00Z');
    const { snapshot } = await repo.refresh();
    expect(spy.mock.calls.at(-1)![0]).toEqual({ updatedSince: '2026-10-05T00:00:00.000Z', cursor: undefined });
    expect(snapshot.places.map(p => [p.id, p.name]).sort()).toEqual([
      ['a', 'SAMPLE — renamed'], ['b', 'SAMPLE — b'], ['c', 'SAMPLE — c'],
    ]);
  });

  it('reads every page when there are more than 500 places', async () => {
    const many = Array.from({ length: 1201 }, (_, i) => place(`p${i}`));
    const repo = new PlaceRepository(new SampleLocationProvider({ categories: [cat], places: many }), new MemoryBackend());
    expect((await repo.refresh()).snapshot.places).toHaveLength(1201);
  });

  it('refreshes one place for an open card, falling back to the cache', async () => {
    const data = { categories: [cat], places: [place('a')] };
    const provider = new SampleLocationProvider(data);
    const repo = new PlaceRepository(provider, new MemoryBackend());
    await repo.refresh();

    data.places = [place('a', { phone: '404-555-0199' })];
    expect((await repo.getPlace('a'))?.phone).toBe('404-555-0199');

    vi.spyOn(provider, 'getPlace').mockRejectedValueOnce(new Error('offline'));
    expect((await repo.getPlace('a'))?.phone).toBe('404-555-0199');
  });

  it('the API provider says plainly that the backend is not connected yet', async () => {
    await expect(new ApiLocationProvider('https://example.test').getCategories()).rejects.toThrow('not connected yet');
  });
});
