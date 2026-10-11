"""Extracts the five metro Atlanta counties from the US Census cartographic boundary file.

Source (public domain): https://www2.census.gov/geo/tiger/GENZ2023/kml/cb_2023_us_county_5m.zip
Usage: python -I extract-counties.py <cb_2023_us_county_5m.kml> apps/mobile/src/map/geo/counties.geo.json
"""
import json
import re
import sys

COUNTIES = {  # Census GEOID -> app county id
    "13121": ("fulton", "Fulton"),
    "13089": ("dekalb", "DeKalb"),
    "13067": ("cobb", "Cobb"),
    "13135": ("gwinnett", "Gwinnett"),
    "13063": ("clayton", "Clayton"),
}

src, out = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()

features = []
lngs, lats = [], []
for block in text.split("<Placemark")[1:]:
    geoid = re.search(r"<th>GEOID</th>\s*<td>(\d+)</td>", block)
    if not geoid or geoid.group(1) not in COUNTIES:
        continue
    county_id, name = COUNTIES[geoid.group(1)]
    rings = []
    for coords in re.findall(r"<coordinates>(.*?)</coordinates>", block, re.S):
        ring = []
        for pt in coords.split():
            lng, lat = (float(v) for v in pt.split(",")[:2])
            ring.append([round(lng, 5), round(lat, 5)])
            lngs.append(lng)
            lats.append(lat)
        rings.append([ring])
    features.append({
        "type": "Feature",
        "properties": {"id": county_id, "name": name, "geoid": geoid.group(1)},
        "geometry": {"type": "MultiPolygon", "coordinates": rings},
    })

assert len(features) == 5, f"expected 5 counties, found {len(features)}"
features.sort(key=lambda f: f["properties"]["id"])
json.dump({
    "type": "FeatureCollection",
    "source": "US Census Bureau, cb_2023_us_county_5m (public domain)",
    "features": features,
}, open(out, "w", encoding="utf-8"), separators=(",", ":"))

print(f"bbox: south={min(lats):.4f} north={max(lats):.4f} west={min(lngs):.4f} east={max(lngs):.4f}")
print(f"points: {len(lngs)}")
