// The swap point for place data. Today: bundled sample places. Later: the places API.
// Screens never see a provider; they go through PlaceRepository.
import type { Category, Place } from '@scr/shared';

export interface PlacesPage {
  places: Place[];
  nextCursor?: string;
}

export interface LocationProvider {
  readonly name: string;
  getCategories(): Promise<Category[]>;
  /** Places changed since `updatedSince` (all places if omitted), 500 per page. */
  getPlaces(opts: { updatedSince?: string; cursor?: string }): Promise<PlacesPage>;
  getPlace(id: string): Promise<Place | null>;
}

export const PAGE_SIZE = 500;
