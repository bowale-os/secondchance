// One switch chooses where places come from: PLACES_SOURCE in config.
import { config } from '../../config';
import type { LocationProvider } from './LocationProvider';
import { PlaceRepository, type MetaStore } from './PlaceRepository';
import { ApiLocationProvider } from './providers/ApiLocationProvider';
import { SampleLocationProvider } from './providers/SampleLocationProvider';

export function createPlaceRepository(store: MetaStore) {
  const provider: LocationProvider = config.PLACES_SOURCE === 'api'
    ? new ApiLocationProvider(config.PLACES_API_URL)
    : new SampleLocationProvider();   // today
  return new PlaceRepository(provider, store);
}

export type { PlacesSnapshot } from './PlaceRepository';
