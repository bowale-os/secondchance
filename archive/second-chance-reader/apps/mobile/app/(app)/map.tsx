// /map, or /map?place=<id> to open the map zoomed in on one place with its card open.
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ResourceMapScreen } from '../../src/map/ResourceMapScreen';

export default function MapRoute() {
  const { place } = useLocalSearchParams<{ place?: string }>();
  return <ResourceMapScreen focusPlaceId={place} />;
}
