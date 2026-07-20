/**
 * Bakes the dot-matrix world map: samples a lon/lat grid against Natural
 * Earth 110m country polygons (public domain) and writes each land dot with
 * its country's ISO2 code, so node concentration can light dots up.
 *
 * Run once (output is committed): node --experimental-strip-types scripts/build-land-dots.ts
 */
import { writeFileSync } from 'node:fs';

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

const LON_STEP = 2.0;
const LAT_STEP = 2.0;
const LAT_MIN = -58;
const LAT_MAX = 78;

type Ring = [number, number][];

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lon: number, lat: number, poly: Ring[]): boolean {
  if (!pointInRing(lon, lat, poly[0]!)) return false;
  for (let i = 1; i < poly.length; i++) if (pointInRing(lon, lat, poly[i]!)) return false;
  return true;
}

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const geo = (await res.json()) as {
    features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[];
  };

  const countries = geo.features.map((f) => {
    const p = f.properties;
    let iso = p['ISO_A2_EH'] && p['ISO_A2_EH'] !== '-99' ? p['ISO_A2_EH'] : p['ISO_A2'];
    if (!iso || iso === '-99') iso = p['WB_A2'] ?? '??';
    const polys: Ring[][] =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates as Ring[]]
        : (f.geometry.coordinates as Ring[][]);
    return { iso, polys };
  });

  const isoList: string[] = [];
  const isoIndex = new Map<string, number>();
  const dots: [number, number, number][] = []; // [lon, lat, countryIdx]

  for (let lat = LAT_MAX; lat >= LAT_MIN; lat -= LAT_STEP) {
    for (let lon = -180; lon <= 180; lon += LON_STEP) {
      for (const c of countries) {
        let hit = false;
        for (const poly of c.polys) {
          if (pointInPolygon(lon, lat, poly)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          if (!isoIndex.has(c.iso)) {
            isoIndex.set(c.iso, isoList.length);
            isoList.push(c.iso);
          }
          dots.push([lon, lat, isoIndex.get(c.iso)!]);
          break;
        }
      }
    }
  }

  writeFileSync(
    'src/data/land-dots.json',
    JSON.stringify({ lonStep: LON_STEP, latStep: LAT_STEP, latMin: LAT_MIN, latMax: LAT_MAX, isoList, dots }),
  );
  console.log(`baked ${dots.length} land dots across ${isoList.length} countries`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
