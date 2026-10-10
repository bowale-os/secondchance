// The places backend, once it exists. Search for TODO(backend).
//
// Contract:
//   GET /v1/categories                                   → Category[] in display order
//   GET /v1/places?updatedSince=<ISO>&cursor=<c>         → { places: Place[], nextCursor? } (500 per page)
//   GET /v1/places/{id}                                  → Place, or 404
//
// The app downloads every place for the five counties at once instead of asking per map
// view, so the server never learns which part of the map a person looked at.
import type { Category, Place } from '@scr/shared';
import type { LocationProvider, PlacesPage } from '../LocationProvider';

export class PlacesBackendNotConnectedError extends Error {
  constructor() {
    super('Places backend not connected yet');
    this.name = 'PlacesBackendNotConnectedError';
  }
}

export class ApiLocationProvider implements LocationProvider {
  readonly name = 'api';

  constructor(private baseUrl: string) {}   // TODO(backend): set EXPO_PUBLIC_PLACES_API_URL

  async getCategories(): Promise<Category[]> {
    // TODO(backend): GET `${this.baseUrl}/v1/categories`
    throw new PlacesBackendNotConnectedError();
  }

  async getPlaces(_opts: { updatedSince?: string; cursor?: string }): Promise<PlacesPage> {
    // TODO(backend): GET `${this.baseUrl}/v1/places?updatedSince=...&cursor=...`
    throw new PlacesBackendNotConnectedError();
  }

  async getPlace(_id: string): Promise<Place | null> {
    // TODO(backend): GET `${this.baseUrl}/v1/places/{id}`; return null on 404
    throw new PlacesBackendNotConnectedError();
  }
}
