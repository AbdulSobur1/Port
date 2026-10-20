/**
 * Single-pass OSM extraction for the Lagos world.
 *
 * The Geofabrik extract is ordered nodes → ways → relations, so one sequential
 * pass is enough: nodes are indexed, ways are classified, and multipolygon
 * relations (which come last) are resolved from a compact store of the
 * in-bounds way geometry. Nothing national is retained in memory — nodes and
 * ways outside `bounds` are dropped as they stream past.
 *
 * Output stays in WGS84 integer microdegrees (1e-7°); projection to world
 * metres happens in scripts/extract-world-data.mjs through the shared
 * lib/geo/projection.ts used by the browser.
 */

/** Road classes kept for rendering; `driv` = usable by the driving graph. */
export const ROAD_CLASSES = {
  motorway: { driv: true, speed: 25, width: 13 },
  trunk: { driv: true, speed: 22, width: 12 },
  primary: { driv: true, speed: 19, width: 10.5 },
  secondary: { driv: true, speed: 16.5, width: 9 },
  tertiary: { driv: true, speed: 14, width: 8 },
  residential: { driv: true, speed: 8.5, width: 6.5 },
  unclassified: { driv: true, speed: 9.5, width: 6 },
  living_street: { driv: true, speed: 4.5, width: 5 },
  service: { driv: true, speed: 4.5, width: 4.5 },
  road: { driv: true, speed: 8, width: 5.5 },
  pedestrian: { driv: false, speed: 0, width: 4 },
  footway: { driv: false, speed: 0, width: 2.2 },
  path: { driv: false, speed: 0, width: 2 },
  cycleway: { driv: false, speed: 0, width: 2.5 },
  track: { driv: false, speed: 0, width: 3 },
  steps: { driv: false, speed: 0, width: 2 },
  bridleway: { driv: false, speed: 0, width: 2 },
};

const GREEN_LEISURE = new Set(['park', 'garden', 'pitch', 'golf_course', 'playground', 'nature_reserve']);
const GREEN_LANDUSE = new Set(['grass', 'meadow', 'recreation_ground', 'village_green', 'cemetery', 'forest', 'orchard']);
const GREEN_NATURAL = new Set(['wood', 'scrub', 'grassland', 'heath']);
const WATER_NATURAL = new Set(['water', 'bay', 'strait']);
const WATER_LANDUSE = new Set(['reservoir', 'basin']);
const WATERWAY_LINE = new Set(['river', 'stream', 'canal', 'drain', 'ditch']);

const POI_AMENITY = new Set([
  'restaurant', 'cafe', 'bar', 'pub', 'hotel', 'bank', 'hospital', 'clinic', 'university',
  'college', 'school', 'place_of_worship', 'marketplace', 'fuel', 'pharmacy', 'police',
  'post_office', 'library', 'theatre', 'cinema', 'museum', 'stadium', 'bus_station', 'parking',
]);
const POI_TOURISM = new Set(['attraction', 'museum', 'viewpoint', 'artwork', 'information', 'hotel']);
const POI_SHOP = new Set(['supermarket', 'mall', 'bakery', 'butcher', 'clothes', 'electronics', 'kiosk']);
const POI_LEISURE = new Set(['sports_centre', 'stadium', 'fitness_centre', 'golf_course', 'marina']);
const POI_OFFICE = new Set(['company', 'government', 'financial', 'law', 'it', 'non_profit']);

export function isPoi(tags) {
  if (!tags || !tags.name) return null;
  if (tags.amenity && POI_AMENITY.has(tags.amenity)) return tags.amenity;
  if (tags.tourism && POI_TOURISM.has(tags.tourism)) return tags.tourism;
  if (tags.shop && POI_SHOP.has(tags.shop)) return tags.shop;
  if (tags.leisure && POI_LEISURE.has(tags.leisure)) return tags.leisure;
  if (tags.office && POI_OFFICE.has(tags.office)) return tags.office;
  if (tags.railway === 'station' || tags.railway === 'tram_stop') return 'transit';
  return null;
}

export function num(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Deterministic per-building height estimate so geometry never drifts between runs. */
export function estimateHeight(osmId) {
  let h = (osmId * 2654435761) % 1000;
  h /= 1000;
  if (h < 0.65) return Math.round((5.5 + h * 5) * 10) / 10;
  if (h < 0.9) return Math.round((9.5 + (h - 0.65) * 16) * 10) / 10;
  return Math.round((13.5 + (h - 0.9) * 45) * 10) / 10;
}

/** Resolve building height from tags; falls back to a documented estimate. */
export function buildingHeight(tags, osmId) {
  const h = num(tags.height);
  if (h && h > 0) return { h: Math.min(140, Math.round(h * 10) / 10), src: 'tag' };
  const levels = num(tags['building:levels']);
  if (levels && levels > 0) return { h: Math.min(140, Math.round((levels * 3.2 + 0.9) * 10) / 10), src: 'levels' };
  return { h: estimateHeight(osmId), src: 'est' };
}

export function onewayValue(tags, cls) {
  const v = tags.oneway;
  if (v === 'yes' || v === 'true' || v === '1') return 1;
  if (v === '-1' || v === 'reverse') return -1;
  if (v === 'no' || v === 'false' || v === '0') return 0;
  if (tags.junction === 'roundabout' || tags.junction === 'circular') return 1;
  if (cls === 'motorway' || cls === 'motorway_link') return 1;
  return 0;
}

export function roadWidth(tags, cls) {
  const w = num(tags.est_width) ?? num(tags.width);
  if (w && w > 1 && w < 40) return Math.round(w * 10) / 10;
  return ROAD_CLASSES[cls]?.width ?? 5;
}

/**
 * Streaming collector.
 *
 * `bounds` is WGS84. Nodes are stored as microdegree integers in two growing
 * arrays; ways keep an index list so multipolygon rings can be rebuilt.
 */
export function createCollector(bounds) {
  const inBounds = (lng, lat) =>
    lng >= bounds.west && lng <= bounds.east && lat >= bounds.south && lat <= bounds.north;

  const nodeIdx = new Map(); // osm node id -> index
  const nodeLng = []; // microdegrees
  const nodeLat = [];

  const waySpan = new Map(); // way osm id -> { off, len }
  const wayPts = []; // node indices, contiguous per way

  const stats = {
    nodesScanned: 0,
    nodesInBounds: 0,
    waysScanned: 0,
    waysStored: 0,
    relationsScanned: 0,
    highwayWays: 0,
    drivableWays: 0,
    buildingWays: 0,
    buildingRelations: 0,
    buildingPartsSkipped: 0,
    buildingsDroppedBoundary: 0,
    buildingsDroppedDegenerate: 0,
    multipolygonOuters: 0,
    multipolygonInnerDropped: 0,
    multipolygonUnresolved: 0,
    waterPolys: 0,
    greenPolys: 0,
    waterLines: 0,
    coastWays: 0,
    nodePois: 0,
    wayPois: 0,
    signals: 0,
    crossings: 0,
    osmTrees: 0,
    restrictions: 0,
    restrictionsSkippedViaWay: 0,
    restrictionsSkippedNoVia: 0,
  };

  const signals = [];
  const trees = [];
  const pois = [];
  const crossings = []; // [lng, lat, …] highway=crossing nodes

  const roads = [];
  const buildings = [];
  const waterPolys = [];
  const greenPolys = [];
  const waterLines = [];
  const coastWays = [];
  const restrictions = [];
  const restrictionWays = new Set();

  function pushNode(entity) {
    const { id, lon, lat } = entity;
    if (lon == null || lat == null) return;
    if (!inBounds(lon, lat)) return;
    if (nodeIdx.has(id)) return;
    const i = nodeLng.length;
    nodeIdx.set(id, i);
    nodeLng.push(Math.round(lon * 1e7));
    nodeLat.push(Math.round(lat * 1e7));
    stats.nodesInBounds++;
    const tags = entity.tags;
    if (!tags) return;
    if (tags.highway === 'traffic_signals') { signals.push(lon, lat); stats.signals++; }
    if (tags.highway === 'crossing') { crossings.push(lon, lat); stats.crossings++; }
    if (tags.natural === 'tree') { trees.push(lon, lat); stats.osmTrees++; }
    const kind = isPoi(tags);
    if (kind) { pois.push({ k: kind, n: tags.name, lng: lon, lat }); stats.nodePois++; }
  }

  function refsToLngLat(refs) {
    const p = [];
    let missing = 0;
    for (const ref of refs) {
      const i = nodeIdx.get(ref);
      if (i === undefined) { missing++; continue; }
      p.push(i);
    }
    return { idx: p, missing };
  }

  function pushWay(entity) {
    const tags = entity.tags || {};
    const refs = entity.refs || [];
    if (refs.length < 2) return;

    // Keep in-bounds geometry for any way that touches the box; multipolygon
    // relations are resolved after all ways have streamed past.
    const { idx, missing } = refsToLngLat(refs);
    if (idx.length >= 2) {
      waySpan.set(entity.id, { off: wayPts.length, len: idx.length });
      for (const i of idx) wayPts.push(i);
      stats.waysStored++;
    }

    const cls = tags.highway;
    if (cls) {
      const base = cls.endsWith('_link') ? cls.slice(0, -5) : cls;
      const def = ROAD_CLASSES[base];
      if (!def) { stats.highwayWays++; return; }
      stats.highwayWays++;
      if (tags.access === 'no' || tags.motor_vehicle === 'no') return;

      const drivable = def.driv && tags.motor_vehicle !== 'private' && tags.access !== 'private';
      // Split into contiguous in-bounds runs so boundary crossings keep
      // ref/geometry adjacency (the route graph needs both).
      const runs = [];
      let cur = [];
      for (let k = 0; k < refs.length; k++) {
        const i = nodeIdx.get(refs[k]);
        if (i === undefined) {
          if (cur.length >= 2) runs.push(cur);
          cur = [];
          continue;
        }
        cur.push({ ref: refs[k], lng: nodeLng[i] / 1e7, lat: nodeLat[i] / 1e7 });
      }
      if (cur.length >= 2) runs.push(cur);

      const oneway = onewayValue(tags, base);
      const lanes = num(tags.lanes);
      const vmax = num(tags.maxspeed);
      for (const run of runs) {
        if (run.length < 2) continue;
        const p = [];
        const pRefs = [];
        for (const pt of run) { p.push(pt.lng, pt.lat); pRefs.push(pt.ref); }
        roads.push({
          osmId: entity.id,
          cls: base,
          driv: drivable,
          oneway,
          name: tags.name || null,
          width: roadWidth(tags, base),
          lanes: lanes && lanes > 0 && lanes < 12 ? lanes : null,
          maxspeed: vmax && vmax > 5 && vmax < 130 ? vmax : null,
          bridge: tags.bridge === 'yes' || tags.bridge === 'viaduct' || tags.bridge === 'boardwalk',
          tunnel: tags.tunnel === 'yes' || tags.tunnel === 'building_passage',
          surface: tags.surface || null,
          refs: pRefs,
          p,
        });
        if (drivable) stats.drivableWays++;
      }
      return;
    }

    if (tags.building && !tags['building:part']) {
      stats.buildingWays++;
      if (missing > 0) { stats.buildingsDroppedBoundary++; return; }
      const p = [];
      for (const i of idx) p.push(nodeLng[i] / 1e7, nodeLat[i] / 1e7);
      if (p.length < 8) { stats.buildingsDroppedDegenerate++; return; }
      const closed = p[0] === p[p.length - 2] && p[1] === p[p.length - 1];
      if (!closed) { stats.buildingsDroppedDegenerate++; return; }
      const { h, src } = buildingHeight(tags, entity.id);
      buildings.push({
        osmId: entity.id,
        h,
        hsrc: src,
        kind: tags.building === 'yes' ? null : tags.building,
        p,
      });
      return;
    }
    if (tags['building:part']) { stats.buildingPartsSkipped++; return; }

    if (tags.natural === 'coastline') {
      if (missing > 0) return;
      const p = [];
      for (const i of idx) p.push(nodeLng[i] / 1e7, nodeLat[i] / 1e7);
      if (p.length >= 4) { coastWays.push({ osmId: entity.id, p }); stats.coastWays++; }
      return;
    }

    if (
      (tags.natural && WATER_NATURAL.has(tags.natural)) ||
      (tags.landuse && WATER_LANDUSE.has(tags.landuse)) ||
      tags.waterway === 'riverbank' ||
      (tags.leisure === 'swimming_pool' && false)
    ) {
      if (missing > 0) return;
      const p = [];
      for (const i of idx) p.push(nodeLng[i] / 1e7, nodeLat[i] / 1e7);
      if (p.length >= 8) { waterPolys.push({ osmId: entity.id, p }); stats.waterPolys++; }
      return;
    }
    if (tags.waterway && WATERWAY_LINE.has(tags.waterway)) {
      const p = [];
      for (const i of idx) p.push(nodeLng[i] / 1e7, nodeLat[i] / 1e7);
      if (p.length >= 4) {
        waterLines.push({ w: tags.waterway === 'river' ? 12 : tags.waterway === 'canal' ? 6 : 2.5, p });
        stats.waterLines++;
      }
      return;
    }
    if (
      (tags.leisure && GREEN_LEISURE.has(tags.leisure)) ||
      (tags.landuse && GREEN_LANDUSE.has(tags.landuse)) ||
      (tags.natural && GREEN_NATURAL.has(tags.natural))
    ) {
      if (missing > 0) return;
      const p = [];
      for (const i of idx) p.push(nodeLng[i] / 1e7, nodeLat[i] / 1e7);
      if (p.length >= 8) { greenPolys.push({ osmId: entity.id, p }); stats.greenPolys++; }
      return;
    }
    const kind = isPoi(tags);
    if (kind && idx.length) {
      const i = idx[0];
      pois.push({ k: kind, n: tags.name, lng: nodeLng[i] / 1e7, lat: nodeLat[i] / 1e7 });
      stats.wayPois++;
    }
  }

  /** Stitch member ways of a multipolygon into closed rings (either direction). */
  function stitchRings(memberWays) {
    const key = (i) => i;
    const pieces = [];
    for (const w of memberWays) {
      const span = waySpan.get(w.id);
      if (!span) return null;
      const ids = [];
      for (let k = 0; k < span.len; k++) ids.push(wayPts[span.off + k]);
      pieces.push(ids);
    }
    const byStart = new Map();
    pieces.forEach((p, i) => {
      const k = key(p[0]);
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push({ i, rev: false });
      const kEnd = key(p[p.length - 1]);
      if (!byStart.has(kEnd)) byStart.set(kEnd, []);
      byStart.get(kEnd).push({ i, rev: true });
    });
    const used = new Array(pieces.length).fill(false);
    const rings = [];
    let ragged = false;
    for (let start = 0; start < pieces.length; start++) {
      if (used[start]) continue;
      used[start] = true;
      let pts = pieces[start].slice();
      for (;;) {
        const endK = key(pts[pts.length - 1]);
        const cands = byStart.get(endK) || [];
        let advanced = false;
        for (const cand of cands) {
          if (used[cand.i]) continue;
          used[cand.i] = true;
          const next = cand.rev ? pieces[cand.i].slice().reverse() : pieces[cand.i];
          pts = pts.concat(next.slice(1));
          advanced = true;
          break;
        }
        if (!advanced) break;
        if (key(pts[0]) === key(pts[pts.length - 1])) break;
      }
      if (key(pts[0]) === key(pts[pts.length - 1])) rings.push(pts);
      else ragged = true;
    }
    return ragged && rings.length === 0 ? null : rings;
  }

  function pushRelation(entity) {
    const tags = entity.tags || {};
    const members = entity.members || [];

    if (tags.type === 'restriction') {
      const from = members.find((m) => m.role === 'from' && m.type === 'way');
      const to = members.find((m) => m.role === 'to' && m.type === 'way');
      const vias = members.filter((m) => m.role === 'via');
      if (!from || !to) return;
      const viaNode = vias.find((m) => m.type === 'node');
      if (!viaNode) {
        stats.restrictionsSkippedViaWay += vias.length ? 1 : 0;
        if (!vias.length) stats.restrictionsSkippedNoVia++;
        return;
      }
      restrictions.push({ from: from.id, to: to.id, via: viaNode.id, kind: tags.restriction });
      restrictionWays.add(from.id);
      restrictionWays.add(to.id);
      stats.restrictions++;
      return;
    }

    if (tags.type !== 'multipolygon') return;

    let kind = null;
    if ((tags.natural && WATER_NATURAL.has(tags.natural)) || (tags.landuse && WATER_LANDUSE.has(tags.landuse)) || tags.water) kind = 'water';
    else if ((tags.leisure && GREEN_LEISURE.has(tags.leisure)) || (tags.landuse && GREEN_LANDUSE.has(tags.landuse)) || (tags.natural && GREEN_NATURAL.has(tags.natural))) kind = 'green';
    else if (tags.building) kind = 'building';
    if (!kind) return;

    const outers = members.filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === ''));
    const inners = members.filter((m) => m.type === 'way' && m.role === 'inner');
    if (!outers.length) { stats.multipolygonUnresolved++; return; }
    if (inners.length) stats.multipolygonInnerDropped++;

    const rings = stitchRings(outers);
    if (!rings) { stats.multipolygonUnresolved++; return; }

    for (const ring of rings) {
      const p = [];
      for (const i of ring) p.push(nodeLng[i] / 1e7, nodeLat[i] / 1e7);
      if (p.length < 8) continue;
      stats.multipolygonOuters++;
      if (kind === 'water') { waterPolys.push({ osmId: entity.id, p }); stats.waterPolys++; }
      else if (kind === 'green') { greenPolys.push({ osmId: entity.id, p }); stats.greenPolys++; }
      else {
        const { h, src } = buildingHeight(tags, entity.id);
        buildings.push({ osmId: entity.id, h, hsrc: src, kind: null, p });
        stats.buildingRelations++;
      }
    }
  }

  return {
    stats,
    signals, trees, pois, crossings,
    roads, buildings, waterPolys, greenPolys, waterLines, coastWays,
    restrictions, restrictionWays,
    nodeLng, nodeLat, nodeIdx,
    pushNode, pushWay, pushRelation,
    inBounds,
  };
}
