'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hydrateGraph } from '@/lib/geo/graph';
import {
  buildMapModel,
  clampView,
  edgePointer,
  fitView,
  hitStation,
  orderedStations,
  screenPath,
  toScreen,
  zoomView,
  type MapModel,
  type MapSize,
  type MapView,
} from '@/lib/world/cartography';
import { loadBuildingChunk } from '@/lib/world/data';
import { destinationByZone, destinations } from '@/lib/world/destinations';
import type { Building, StationData } from '@/lib/world/types';
import { navigateTo } from './navigation';
import { openDestination, runtime, setUi, useUi } from './store';

/**
 * The playable-world map.
 *
 * This is deliberately *not* a slippy map of Lagos. The old panel streamed a
 * PMTiles archive of the whole district, so it advertised hundreds of streets
 * the car can never drive on and placed the portfolio markers on a different
 * picture from the one the 3D scene renders. Everything below is built from the
 * shipped world payload — the curated road network, the building chunk
 * footprints, the main street, the stations — through `lib/world/cartography`,
 * which is also what the tests check.
 *
 * Two intentional states:
 *   · driving  — a compact, car-centred minimap with the route and edge
 *                pointers to the active destination;
 *   · expanded — the whole portfolio street fitted to the viewport, every
 *                destination labelled, layer toggles and pan/zoom.
 */

type Layers = { buildings: boolean; activity: boolean; pois: boolean };

const FONT = '500 10px ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT_SMALL = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT_STRONG = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';

const PALETTE = {
  land: '#0c1413',
  green: '#13251c',
  water: '#0d1c22',
  building: '#2a312b',
  buildingEdge: '#0b1211',
  sidewalk: '#1a201c',
  road: '#454a41',
  mainRoad: '#565b4c',
  casing: '#0a1110',
  marking: '#b9bfad',
  crossing: '#cfd5c3',
  route: '#d8f851',
  car: '#d8f851',
  label: '#e6efe8',
  muted: '#9aa79e',
};

/**
 * Compact-map zoom: about 135 m from top to bottom, whichever panel size the
 * layout gives us. Enough to read the next junction and the next stop, small
 * enough that the car is not a dot in a district.
 */
function followScale(size: MapSize): number {
  return Math.max(1.8, Math.min(3.1, size.height / 135));
}

/** A portrait viewport gets the plan turned so the street runs vertically. */
function turnFor(size: MapSize, expanded: boolean): 0 | 1 {
  return expanded && size.height > size.width * 1.1 ? 1 : 0;
}

function stationColor(zone: string): string {
  return destinationByZone(zone)?.color ?? '#d8f851';
}

function stationLabel(zone: string, station: StationData): string {
  return destinationByZone(zone)?.label ?? station.label;
}

function polygonPath(ctx: CanvasRenderingContext2D, p: number[], view: MapView, size: MapSize) {
  if (p.length < 6) return false;
  ctx.beginPath();
  for (let i = 0; i < p.length; i += 2) {
    const s = toScreen(view, size, p[i], p[i + 1]);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  }
  ctx.closePath();
  return true;
}

function paint(args: {
  ctx: CanvasRenderingContext2D;
  size: MapSize;
  view: MapView;
  model: MapModel;
  expanded: boolean;
  car: { x: number; z: number; yaw: number };
  route: number[] | null;
  activeZone: string | null;
  selectedZone: string | null;
  hoverZone: string | null;
  layers: Layers;
  pedestrians: { x: number; z: number }[];
}) {
  const { ctx, size, view, model, expanded, car, route, activeZone, selectedZone, hoverZone, layers } = args;
  const { width, height } = size;
  const scale = view.scale;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PALETTE.land;
  ctx.fillRect(0, 0, width, height);

  // --- land cover --------------------------------------------------------
  ctx.fillStyle = PALETTE.water;
  for (const ring of [...model.sea, ...model.water]) {
    if (polygonPath(ctx, ring, view, size)) ctx.fill();
  }
  ctx.fillStyle = PALETTE.green;
  for (const ring of model.green) {
    if (polygonPath(ctx, ring, view, size)) ctx.fill();
  }

  // --- buildings ---------------------------------------------------------
  if (layers.buildings) {
    for (const building of model.buildings) {
      const p = building.p;
      if (p.length < 6) continue;
      if (!polygonPath(ctx, p, view, size)) continue;
      const tall = Math.min(1, Math.max(0, building.h / 44));
      const r = Math.round(34 + tall * 24);
      const g = Math.round(40 + tall * 24);
      const b = Math.round(36 + tall * 20);
      ctx.fillStyle = `rgb(${r} ${g} ${b})`;
      ctx.fill();
      if (scale > 0.85) {
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = PALETTE.buildingEdge;
        ctx.stroke();
      }
    }
  }

  // --- roads -------------------------------------------------------------
  const roads = model.roads;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Sidewalk band, then asphalt, then the main street's warmer surface. The
  // widths come from the world's own carriageway widths, so a wide road on the
  // map is a wide road in the scene.
  ctx.strokeStyle = PALETTE.sidewalk;
  for (const road of roads) {
    const pts = screenPath(view, size, road.p, 0.5);
    if (pts.length < 2) continue;
    ctx.lineWidth = Math.max(2.4, (road.width + 4.6) * scale);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }

  for (const road of roads) {
    const pts = screenPath(view, size, road.p, 0.35);
    if (pts.length < 2) continue;
    ctx.strokeStyle = road.main ? PALETTE.mainRoad : PALETTE.road;
    ctx.lineWidth = Math.max(1.3, road.width * scale);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }

  // Centre line on the one street every project sits on.
  if (model.street && scale > 1.1) {
    const pts = screenPath(view, size, model.street.p, 0.3);
    ctx.save();
    ctx.setLineDash([Math.max(3, 4.2 * scale), Math.max(3, 5 * scale)]);
    ctx.strokeStyle = PALETTE.marking;
    ctx.globalAlpha = 0.62;
    ctx.lineWidth = Math.max(0.9, 0.16 * scale);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
  }

  // The street gets a name on the plan, set along its own centreline. It is
  // drawn from `world.mainStreet`, so the label follows the same polyline the
  // car and the route use.
  if (expanded && model.street && model.street.p.length >= 8) {
    const p = model.street.p;
    const mid = Math.floor(p.length / 4) * 2;
    const a = toScreen(view, size, p[mid], p[mid + 1]);
    const b = toScreen(view, size, p[mid + 2], p[mid + 3]);
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
    const text = model.street.name.toUpperCase().split('').join(' ');
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(angle);
    ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(8, 15, 14, .9)';
    ctx.strokeText(text, 0, -7);
    ctx.fillStyle = 'rgba(206, 216, 200, .62)';
    ctx.fillText(text, 0, -7);
    ctx.restore();
  }

  // --- crossings ---------------------------------------------------------
  if (scale > 0.7) {
    ctx.strokeStyle = PALETTE.crossing;
    ctx.lineWidth = Math.max(1, 0.42 * scale);
    for (const c of model.crossings) {
      const ux = Math.sin(c.h);
      const uz = Math.cos(c.h);
      const nx = Math.cos(c.h);
      const nz = -Math.sin(c.h);
      const half = Math.max(1.9, c.w * 0.34);
      for (let i = 0; i < 5; i++) {
        const along = (i - 2) * 1.05;
        const a = toScreen(view, size, c.x + ux * along + nx * half, c.z + uz * along + nz * half);
        const b = toScreen(view, size, c.x + ux * along - nx * half, c.z + uz * along - nz * half);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  // --- route -------------------------------------------------------------
  if (route && route.length >= 4) {
    const pts = screenPath(view, size, route, 0.35);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PALETTE.casing;
    ctx.lineWidth = expanded ? 7 : 6;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.route;
    ctx.lineWidth = expanded ? 3 : 2.6;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }

  // --- activity ----------------------------------------------------------
  if (layers.activity && args.pedestrians.length) {
    ctx.fillStyle = 'rgba(214, 229, 216, .72)';
    for (const person of args.pedestrians) {
      const s = toScreen(view, size, person.x, person.z);
      if (s.x < 0 || s.y < 0 || s.x > width || s.y > height) continue;
      ctx.fillRect(s.x - 0.9, s.y - 0.9, 1.8, 1.8);
    }
  }

  // --- points of interest ------------------------------------------------
  if (layers.pois && expanded) {
    ctx.font = FONT_SMALL;
    for (const poi of model.pois) {
      const s = toScreen(view, size, poi.x, poi.z);
      if (s.x < 0 || s.y < 0 || s.x > width || s.y > height) continue;
      ctx.fillStyle = 'rgba(214, 229, 216, .5)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(214, 229, 216, .58)';
      ctx.fillText(poi.n, s.x + 5, s.y + 3);
    }
  }

  // --- stations ----------------------------------------------------------
  const stations = orderedStations(model.stations);
  const placards: { x: number; y: number; w: number; h: number }[] = [];
  const collides = (box: { x: number; y: number; w: number; h: number }) =>
    placards.some((p) => Math.abs(p.x - box.x) * 2 < p.w + box.w && Math.abs(p.y - box.y) * 2 < p.h + box.h);

  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    const s = toScreen(view, size, station.x, station.z);
    if (s.x < -30 || s.y < -30 || s.x > width + 30 || s.y > height + 30) continue;
    const zone = station.zone;
    const active = zone === activeZone;
    const selected = zone === selectedZone;
    const hovered = zone === hoverZone;
    const color = active ? PALETTE.route : stationColor(zone);
    const r = selected || hovered ? (expanded ? 10 : 8) : expanded ? 8.5 : 6.4;

    if (active) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(216, 248, 81, .5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#07100f';
    ctx.stroke();

    ctx.fillStyle = '#08110f';
    ctx.font = FONT_STRONG;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), s.x, s.y + 0.5);

    // Labels: always in the expanded map, only when there is room in the
    // compact map. The active stop is never dropped. Stops sit every ~62 m on
    // a diagonal street, so a single right-hand column collides; alternate the
    // side and try the vertical offsets before dropping a label.
    const wantsLabel = expanded || active || selected || hovered || scale > 1.6;
    if (wantsLabel) {
      const text = stationLabel(zone, station);
      ctx.font = FONT;
      const w = ctx.measureText(text).width + 10;
      const h = 15;
      const gap = r + 7;
      const candidates = i % 2 === 0
        ? [
            { x: s.x + gap + w / 2, y: s.y - h / 2 },
            { x: s.x - gap - w / 2, y: s.y - h / 2 },
            { x: s.x + gap + w / 2, y: s.y - h - 6 },
            { x: s.x - gap - w / 2, y: s.y + 6 },
          ]
        : [
            { x: s.x - gap - w / 2, y: s.y - h / 2 },
            { x: s.x + gap + w / 2, y: s.y - h / 2 },
            { x: s.x - gap - w / 2, y: s.y - h - 6 },
            { x: s.x + gap + w / 2, y: s.y + 6 },
          ];
      const fits = candidates
        .map((c) => ({ x: c.x, y: c.y, w: w + 4, h: h + 3 }))
        .find((box) => box.x - box.w / 2 >= 0 && box.x + box.w / 2 <= width && box.y >= 0 && box.y + box.h <= height && (active || !collides(box)));
      if (fits) {
        placards.push(fits);
        const bx = fits.x - w / 2;
        ctx.fillStyle = 'rgba(6, 13, 14, .82)';
        ctx.fillRect(bx, fits.y, w, h);
        ctx.strokeStyle = active ? 'rgba(216, 248, 81, .55)' : 'rgba(190, 205, 192, .16)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, fits.y + 0.5, w - 1, h - 1);
        ctx.fillStyle = active ? PALETTE.route : PALETTE.label;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + 5, fits.y + h / 2 + 0.5);
      }
    }
  }

  // --- vehicle -----------------------------------------------------------
  const carScreen = toScreen(view, size, car.x, car.z);
  ctx.save();
  ctx.translate(carScreen.x, carScreen.y);
  ctx.beginPath();
  ctx.arc(0, 0, expanded ? 13 : 11, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(216, 248, 81, .12)';
  ctx.fill();
  ctx.rotate(car.yaw);
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5.6, 6);
  ctx.lineTo(0, 3.4);
  ctx.lineTo(-5.6, 6);
  ctx.closePath();
  ctx.fillStyle = PALETTE.car;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#0a1110';
  ctx.stroke();
  ctx.restore();

  // --- edge pointer to the active destination ---------------------------
  if (!expanded && activeZone) {
    const station = stations.find((s) => s.zone === activeZone);
    if (station) {
      const s = toScreen(view, size, station.x, station.z);
      const off = s.x < 12 || s.y < 12 || s.x > width - 12 || s.y > height - 12;
      if (off) {
        const pointer = edgePointer(view, size, station.x, station.z, 16);
        ctx.save();
        ctx.translate(pointer.x, pointer.y);
        ctx.rotate(pointer.angle + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(5, 4);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fillStyle = PALETTE.route;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // --- plan furniture: north arrow + scale bar ---------------------------
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(230, 239, 232, .55)';
  ctx.fillStyle = 'rgba(230, 239, 232, .7)';
  ctx.lineWidth = 1.2;
  const nx = view.turn ? width - 22 : width - 16;
  const ny = 22;
  ctx.save();
  ctx.translate(nx, ny);
  if (view.turn) ctx.rotate(Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(0, 5);
  ctx.moveTo(-3.5, -3.5);
  ctx.lineTo(0, -7.5);
  ctx.lineTo(3.5, -3.5);
  ctx.stroke();
  ctx.restore();
  ctx.font = FONT_SMALL;
  ctx.fillText('N', view.turn ? nx + 13 : nx, view.turn ? ny + 2 : ny + 12);

  const targetPx = expanded ? 92 : 58;
  const candidates = [10, 20, 25, 50, 100, 200, 250, 500];
  const metres = candidates.find((m) => m * scale >= targetPx * 0.7) ?? 500;
  const barPx = Math.min(width * 0.42, metres * scale);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(230, 239, 232, .62)';
  ctx.fillRect(10, height - 12, barPx, 1.5);
  ctx.fillRect(10, height - 15, 1.5, 5);
  ctx.fillRect(10 + barPx - 1.5, height - 15, 1.5, 5);
  ctx.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, 10, height - 19);
  ctx.restore();
}

export function MapPanel() {
  const { mapOpen, mapExpanded, autopilot } = useUi();
  const rt = runtime.current;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<MapSize>({ width: 320, height: 200 });
  const viewRef = useRef<MapView>({ x: 0, z: 0, scale: 1 });
  const followRef = useRef(true);
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; factor: number } | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [layers, setLayers] = useState<Layers>({ buildings: true, activity: true, pois: true });
  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const model = useMemo<MapModel | null>(() => (rt ? buildMapModel(rt.world, buildings) : null), [rt, buildings]);

  // Building footprints come from the same chunk files the 3D city streams.
  useEffect(() => {
    if (!mapOpen || !rt || buildings.length) return;
    let cancelled = false;
    const meta = rt.world.meta;
    const jobs: Promise<Building[] | null>[] = [];
    for (let row = 0; row < meta.chunks; row++) {
      for (let col = 0; col < meta.chunks; col++) {
        jobs.push(loadBuildingChunk(row, col).then((chunk) => chunk.b as Building[]).catch(() => null));
      }
    }
    Promise.all(jobs).then((results) => {
      if (cancelled) return;
      setBuildings(results.flatMap((list) => list ?? []));
    });
    return () => { cancelled = true; };
  }, [mapOpen, rt, buildings.length]);

  const followView = useCallback((size: MapSize, expanded: boolean): MapView => {
    const car = runtime.current?.car;
    if (!model) return viewRef.current;
    if (expanded || !followRef.current || !car) {
      return fitView(model.streetExtent, size, expanded ? 30 : 14, turnFor(size, expanded));
    }
    return { x: car.x, z: car.z, scale: followScale(size) };
  }, [model]);

  // Size tracking: the panel changes size when expanded, on resize, and when
  // the mobile sheet rotates, so the canvas is measured rather than assumed.
  useEffect(() => {
    if (!mapOpen) return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      const size = { width: Math.max(120, Math.round(rect.width)), height: Math.max(100, Math.round(rect.height)) };
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = size;
      viewRef.current = followView(size, mapExpanded);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [mapOpen, mapExpanded, followView]);

  useEffect(() => { followRef.current = follow; }, [follow]);

  // Expanding shows the whole street; collapsing returns to the car.
  useEffect(() => {
    if (!mapOpen || !model) return;
    followRef.current = !mapExpanded;
    setFollow(!mapExpanded);
    viewRef.current = followView(sizeRef.current, mapExpanded);
  }, [mapExpanded, mapOpen, model, followView]);

  // Wheel zoom must be a non-passive native listener: React attaches wheel
  // handlers passively, so `preventDefault` would be ignored and the page would
  // scroll behind the map.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!mapOpen || !canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const size = sizeRef.current;
      followRef.current = false;
      setFollow(false);
      const rect = canvas.getBoundingClientRect();
      viewRef.current = zoomView(viewRef.current, size, event.deltaY < 0 ? 1.12 : 1 / 1.12, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [mapOpen]);

  // Render loop. Throttled: the world only needs a fresh frame when the car
  // moved, and 24 fps is indistinguishable for a map at these coasting speeds.
  useEffect(() => {
    if (!mapOpen || !model) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 42) return;
      last = now;
      const canvas = canvasRef.current;
      const car = runtime.current?.car;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !car) return;
      const size = sizeRef.current;

      if (followRef.current && !mapExpanded) {
        viewRef.current = { x: car.x, z: car.z, scale: followScale(size) };
      }
      const view = clampView(viewRef.current, model.extent, size, mapExpanded ? 0.06 : 0.34);
      viewRef.current = view;

      paint({
        ctx,
        size,
        view,
        model,
        expanded: mapExpanded,
        car,
        route: runtime.current?.route ?? null,
        activeZone: autopilot?.zone ?? null,
        selectedZone: selected,
        hoverZone: hover,
        layers,
        pedestrians: runtime.current?.pedestrians ?? [],
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mapOpen, model, mapExpanded, layers, autopilot?.zone, selected, hover]);

  const zoomBy = (factor: number) => {
    const size = sizeRef.current;
    followRef.current = false;
    setFollow(false);
    viewRef.current = clampView(
      zoomView(viewRef.current, size, factor, { x: size.width / 2, y: size.height / 2 }),
      { minX: -1e6, minZ: -1e6, maxX: 1e6, maxZ: 1e6 },
      size,
      0
    );
  };

  const recenter = () => {
    if (mapExpanded) {
      viewRef.current = model
        ? fitView(model.streetExtent, sizeRef.current, 30, turnFor(sizeRef.current, true))
        : viewRef.current;
      setFollow(false);
    } else {
      followRef.current = true;
      setFollow(true);
    }
  };

  const pickAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !model) return;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const station = hitStation(viewRef.current, sizeRef.current, orderedStations(model.stations), px, py, 18);
    setSelected(station ? station.zone : null);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic or already-released pointer: dragging still works */
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), factor: viewRef.current.scale };
      dragRef.current = null;
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      // Hover feedback without dragging.
      const canvas = canvasRef.current;
      if (!canvas || !model) return;
      const rect = canvas.getBoundingClientRect();
      const station = hitStation(
        viewRef.current,
        sizeRef.current,
        orderedStations(model.stations),
        event.clientX - rect.left,
        event.clientY - rect.top,
        14
      );
      setHover(station ? station.zone : null);
      return;
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      followRef.current = false;
      setFollow(false);
      viewRef.current = {
        ...viewRef.current,
        scale: Math.max(0.2, Math.min(9, (pinchRef.current.factor * distance) / Math.max(1, pinchRef.current.distance))),
      };
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    if (!drag.moved) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    followRef.current = false;
    setFollow(false);
    viewRef.current = {
      ...viewRef.current,
      x: viewRef.current.x - dx / viewRef.current.scale,
      z: viewRef.current.z + dy / viewRef.current.scale,
    };
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (drag && drag.id === event.pointerId) {
      dragRef.current = null;
      if (!drag.moved) pickAt(event.clientX, event.clientY);
    }
  };

  const selectedStation = selected && model ? model.stations.find((s) => s.zone === selected) ?? null : null;
  const graph = useMemo(() => (rt ? hydrateGraph(rt.graph) : null), [rt]);

  if (!mapOpen) return null;

  const activeDest = autopilot ? destinationByZone(autopilot.zone) : null;

  return (
    <section className="map-panel" data-expanded={mapExpanded} aria-label="Playable-world map">
      <header className="map-panel__bar">
        <p>
          <span className="map-panel__dot" />
          {mapExpanded ? 'Soburr Island · all projects' : 'Driving map'}
        </p>
        <div className="map-panel__actions">
          <button onClick={() => zoomBy(1.45)} aria-label="Zoom in">＋</button>
          <button onClick={() => zoomBy(1 / 1.45)} aria-label="Zoom out">－</button>
          <button onClick={recenter} aria-label={mapExpanded ? 'Fit the whole street' : 'Centre on the car'} aria-pressed={!mapExpanded && follow}>
            {mapExpanded ? '⤢' : '◎'}
          </button>
          <button
            onClick={() => setUi({ mapExpanded: !mapExpanded })}
            aria-label={mapExpanded ? 'Shrink map' : 'Expand map'}
            aria-pressed={mapExpanded}
          >
            {mapExpanded ? '⤡' : '⤢'}
          </button>
          <button onClick={() => setUi({ mapOpen: false })} aria-label="Close map">✕</button>
        </div>
      </header>

      <div className="map-panel__canvas" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="map-panel__surface"
          role="img"
          aria-label={`Map of the Soburr street. ${model?.stations.length ?? 0} destinations along ${model?.street?.name ?? 'the main street'}.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={recenter}
        />
        {!model && <div className="map-panel__status">Reading the world layout…</div>}
        {selectedStation && (
          <div className="map-panel__pick" role="dialog" aria-label={`${stationLabel(selectedStation.zone, selectedStation)} stop`}>
            <div>
              <strong>{stationLabel(selectedStation.zone, selectedStation)}</strong>
              <small>{selectedStation.address ?? selectedStation.road ?? 'On the main street'}</small>
            </div>
            <div className="map-panel__pick-actions">
              <button
                className="map-panel__drive"
                onClick={() => {
                  if (graph) navigateTo(selectedStation.zone, graph, rt?.stations ?? []);
                  setSelected(null);
                  setUi({ mapExpanded: false });
                }}
                disabled={!graph}
              >
                Drive
              </button>
              <button onClick={() => openDestination(selectedStation.zone)}>Open</button>
              <button onClick={() => setSelected(null)} aria-label="Dismiss">✕</button>
            </div>
          </div>
        )}
      </div>

      <footer className="map-panel__foot">
        <div className="map-panel__layers" role="group" aria-label="Map layers">
          {([
            ['buildings', 'Buildings'],
            ['activity', 'People'],
            ['pois', 'Places'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              data-on={layers[key]}
              aria-pressed={layers[key]}
              onClick={() => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="map-panel__hint">
          {activeDest ? (
            <>
              <span className="map-panel__target" style={{ background: activeDest.color }} /> {activeDest.label}
              {autopilot?.state ? ` · ${autopilot.state.replaceAll('_', ' ').toLowerCase()}` : ''}
            </>
          ) : (
            <>
              {model ? `${model.stations.length} stops` : destinations.length + ' stops'} ·{' '}
          {model ? `${Math.round(model.street?.length ?? 0)} m street` : 'loading'}
            </>
          )}
        </p>
      </footer>
    </section>
  );
}
