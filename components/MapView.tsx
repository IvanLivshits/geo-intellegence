'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { OrbitView, COORDINATE_SYSTEM, type Layer } from '@deck.gl/core';
import { BitmapLayer, PolygonLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { ScanPayload } from '@/lib/types';
import { MASK_META, type ActivityCategory, type MaskKey } from '@/lib/constants';
import InspectorPanel, { type BaseLayerKey } from './InspectorPanel';

interface ViewState {
  target: [number, number, number];
  zoom: number;
  rotationOrbit: number;
  rotationX: number;
}

interface ProjectedBuilding {
  height: number;
  polygon: [number, number, number][];
}

interface ProjectedRoad {
  path: [number, number, number][];
  width: number;
  rail: boolean;
}

interface ProjectedActivity {
  x: number;
  y: number;
  category: ActivityCategory;
  color: [number, number, number];
  name: string;
  kindLabel: string;
  dist: number;
  radius: number;
}

interface FieldData {
  n: number;
  rgba: number[];
}

const HOME: ViewState = { target: [0, 0, 0], zoom: -0.4, rotationOrbit: 25, rotationX: 50 };
const SCALE = 6;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const ALL_CATS: Record<ActivityCategory, boolean> = {
  nightlife: false,
  retail: false,
  venue: false,
  hub: false,
};

const DEFAULT_MASKS: Record<MaskKey, boolean> = {
  noise: true,
  air: false,
  flood: false,
  q100: false,
  pluvial: false,
};

const MASK_ORDER = Object.keys(MASK_META) as MaskKey[];

function buildFieldCanvas(field: FieldData): HTMLCanvasElement | null {
  const src = document.createElement('canvas');
  src.width = field.n;
  src.height = field.n;
  const sctx = src.getContext('2d');
  if (!sctx) return null;
  const img = sctx.createImageData(field.n, field.n);
  img.data.set(field.rgba);
  sctx.putImageData(img, 0, 0);

  const dim = Math.max(field.n * SCALE, 192);
  const out = document.createElement('canvas');
  out.width = dim;
  out.height = dim;
  const fctx = out.getContext('2d');
  if (!fctx) return null;
  fctx.imageSmoothingEnabled = true;
  fctx.filter = `blur(${SCALE * 0.9}px)`;
  fctx.drawImage(src, 0, 0, dim, dim);
  return out;
}

export default function MapView({ payload }: { payload: ScanPayload }) {
  const [mounted, setMounted] = useState(false);
  const [viewState, setViewState] = useState<ViewState>({ ...HOME });
  const [maskOn, setMaskOn] = useState<Record<MaskKey, boolean>>({ ...DEFAULT_MASKS });
  const [layerOn, setLayerOn] = useState<Record<BaseLayerKey, boolean>>({ buildings: true, roads: true });
  const [catOn, setCatOn] = useState<Record<ActivityCategory, boolean>>({ ...ALL_CATS });
  const [topView, setTopView] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewState>(viewState);
  viewRef.current = viewState;
  const topRef = useRef(topView);
  topRef.current = topView;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setMaskOn({ ...DEFAULT_MASKS });
  }, [payload.center, payload.radius]);

  const project = useMemo(() => {
    const [clon, clat] = payload.center;
    const cosLat = Math.cos((clat * Math.PI) / 180);
    return ([lon, lat, z = 0]: [number, number, number?]): [number, number, number] => [
      (lon - clon) * 111320 * cosLat,
      (lat - clat) * 111320,
      z,
    ];
  }, [payload.center]);

  const buildings = useMemo<ProjectedBuilding[]>(
    () =>
      payload.buildings.map((d) => ({
        height: d.height,
        polygon: d.polygon.map((p) => project([p[0], p[1], 0])),
      })),
    [payload.buildings, project],
  );

  const roads = useMemo<ProjectedRoad[]>(
    () =>
      payload.roads.map((d) => ({
        width: d.width,
        rail: d.rail,
        path: d.path.map((p) => project([p[0], p[1], p[2] ?? 0])),
      })),
    [payload.roads, project],
  );

  const activity = useMemo<ProjectedActivity[]>(
    () =>
      payload.activity.map((d) => {
        const [x, y] = project([d.lon, d.lat, 0]);
        return {
          x,
          y,
          category: d.category,
          color: d.color,
          name: d.name,
          kindLabel: d.kindLabel,
          dist: d.dist,
          radius: d.radius,
        };
      }),
    [payload.activity, project],
  );

  const fieldImages = useMemo(() => {
    const out: Partial<Record<MaskKey, HTMLCanvasElement>> = {};
    if (!mounted) return out;
    for (const key of MASK_ORDER) {
      if (!maskOn[key]) continue;
      const field = payload.masks[key];
      if (!field) continue;
      const canvas = buildFieldCanvas(field);
      if (canvas) out[key] = canvas;
    }
    return out;
  }, [mounted, payload.masks, maskOn]);

  const layers = useMemo(() => {
    const R = payload.radius;
    const CART = COORDINATE_SYSTEM.CARTESIAN;
    const out: Layer[] = [];

    out.push(
      new PathLayer<{ path: [number, number, number][] }>({
        id: 'frame',
        data: [
          {
            path: [
              [-R, -R, 2],
              [R, -R, 2],
              [R, R, 2],
              [-R, R, 2],
              [-R, -R, 2],
            ],
          },
        ],
        coordinateSystem: CART,
        getPath: (d) => d.path,
        getColor: [255, 255, 255, 38],
        getWidth: 1,
        widthUnits: 'pixels',
        widthMinPixels: 1,
      }),
    );

    for (const key of MASK_ORDER) {
      const image = fieldImages[key];
      if (!image) continue;
      out.push(
        new BitmapLayer({
          id: `field-${key}`,
          coordinateSystem: CART,
          image,
          bounds: [-R, -R, R, R],
          textureParameters: {
            minFilter: 'linear',
            magFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
          },
          pickable: false,
        }),
      );
    }

    if (layerOn.roads) {
      out.push(
        new PathLayer<ProjectedRoad>({
          id: 'roads',
          data: roads,
          coordinateSystem: CART,
          getPath: (d) => d.path,
          getWidth: (d) => d.width,
          getColor: (d) => (d.rail ? [92, 102, 124, 190] : [148, 158, 178, 185]),
          widthUnits: 'meters',
          widthMinPixels: 1.5,
          capRounded: false,
          jointRounded: true,
        }),
      );
    }

    if (layerOn.buildings) {
      out.push(
        new PolygonLayer<ProjectedBuilding>({
          id: 'buildings',
          data: buildings,
          coordinateSystem: CART,
          getPolygon: (d) => d.polygon,
          extruded: true,
          getElevation: (d) => d.height,
          getFillColor: [134, 146, 172, 255],
          getLineColor: [34, 38, 46],
          lineWidthMinPixels: 1,
          material: { ambient: 0.32, diffuse: 0.82, shininess: 40, specularColor: [96, 102, 120] },
        }),
      );
    }

    out.push(
      new ScatterplotLayer<{ p: [number, number, number] }>({
        id: 'anchor',
        data: [{ p: [0, 0, 0.5] }],
        coordinateSystem: CART,
        getPosition: (d) => d.p,
        getRadius: 5,
        radiusUnits: 'pixels',
        getFillColor: [229, 101, 75, 255],
        getLineColor: [255, 255, 255, 255],
        stroked: true,
        lineWidthMinPixels: 2,
        parameters: { depthTest: false } as Record<string, unknown>,
      }),
    );

    const shownActivity = activity.filter((a) => catOn[a.category]);
    if (shownActivity.length) {
      out.push(
        new ScatterplotLayer<ProjectedActivity>({
          id: 'activity-halo-under',
          data: shownActivity,
          coordinateSystem: CART,
          getPosition: (d) => [d.x, d.y, 0.5],
          getRadius: (d) => Math.max(0, Math.min(d.radius, R - Math.max(Math.abs(d.x), Math.abs(d.y)))),
          radiusUnits: 'meters',
          filled: false,
          stroked: true,
          getLineColor: [10, 12, 14, 235],
          getLineWidth: 4,
          lineWidthUnits: 'pixels',
          lineWidthMinPixels: 3,
          pickable: false,
        }),
        new ScatterplotLayer<ProjectedActivity>({
          id: 'activity-halo',
          data: shownActivity,
          coordinateSystem: CART,
          getPosition: (d) => [d.x, d.y, 0.6],
          getRadius: (d) => Math.max(0, Math.min(d.radius, R - Math.max(Math.abs(d.x), Math.abs(d.y)))),
          radiusUnits: 'meters',
          filled: false,
          stroked: true,
          getLineColor: (d) => [d.color[0], d.color[1], d.color[2], 235],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          lineWidthMinPixels: 1.5,
          pickable: false,
        }),
        new ScatterplotLayer<ProjectedActivity>({
          id: 'activity-marker',
          data: shownActivity,
          coordinateSystem: CART,
          getPosition: (d) => [d.x, d.y, 3],
          getRadius: 6,
          radiusUnits: 'pixels',
          getFillColor: (d) => [d.color[0], d.color[1], d.color[2], 255],
          getLineColor: [255, 255, 255, 230],
          stroked: true,
          lineWidthMinPixels: 1.5,
          pickable: true,
          parameters: { depthTest: false } as Record<string, unknown>,
        }),
      );
    }

    return out;
  }, [fieldImages, payload.radius, roads, buildings, activity, layerOn, catOn]);

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;

    let drag: { mode: 'orbit' | 'pan'; x: number; y: number } | null = null;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1 && !topRef.current) {
        drag = { mode: 'orbit', x: e.clientX, y: e.clientY };
        e.preventDefault();
      } else if (e.button === 0) {
        drag = { mode: 'pan', x: e.clientX, y: e.clientY };
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      const vs = viewRef.current;
      if (drag.mode === 'orbit') {
        setViewState({
          ...vs,
          rotationOrbit: vs.rotationOrbit - dx * 0.4,
          rotationX: clamp(vs.rotationX + dy * 0.4, -89, 89),
        });
      } else {
        const ppm = Math.pow(2, vs.zoom);
        const sx = dx / ppm;
        const sy = -dy / ppm;
        const t = (vs.rotationOrbit * Math.PI) / 180;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        const wx = sx * ct + sy * st;
        const wy = -sx * st + sy * ct;
        setViewState({ ...vs, target: [vs.target[0] - wx, vs.target[1] - wy, 0] });
      }
    };

    const onMouseUp = () => {
      drag = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vs = viewRef.current;
      setViewState({ ...vs, zoom: clamp(vs.zoom - e.deltaY * 0.0016, -3, 4) });
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const view = useMemo(() => new OrbitView({ orbitAxis: 'Z', fovy: 50 }), []);

  const onToggleLayer = (key: BaseLayerKey) => setLayerOn((prev) => ({ ...prev, [key]: !prev[key] }));
  const onToggleCat = (cat: ActivityCategory) => setCatOn((prev) => ({ ...prev, [cat]: !prev[cat] }));
  const onToggleActivityAll = () =>
    setCatOn((prev) => {
      const allOn = (Object.keys(prev) as ActivityCategory[]).every((c) => prev[c]);
      const next = !allOn;
      return { nightlife: next, retail: next, venue: next, hub: next };
    });

  const onToggleTopView = () =>
    setTopView((prev) => {
      const next = !prev;
      setViewState((vs) =>
        next ? { ...vs, rotationX: 89, rotationOrbit: 0 } : { ...vs, rotationX: 50, rotationOrbit: 25 },
      );
      return next;
    });

  const onToggleMask = (key: MaskKey) => setMaskOn((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex h-full w-full flex-row gap-3 p-3">
      <div
        ref={mapRef}
        className="relative min-w-0 flex-1 overflow-hidden border border-graphite bg-void-black"
      >
        {mounted && (
          <DeckGL
            views={view}
            viewState={viewState}
            controller={false}
            layers={layers}
            getTooltip={({ object }: { object?: ProjectedActivity | null }) =>
              object && object.kindLabel
                ? {
                    html: `<b>${object.name}</b><br>${object.kindLabel} · ${object.dist} м · зона ~${object.radius} м`,
                    style: {
                      background: '#0c0c0b',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      padding: '6px 9px',
                      borderRadius: '0',
                      border: '1px solid #1f2228',
                    },
                  }
                : null
            }
          />
        )}
      </div>
      <InspectorPanel
        payload={payload}
        maskOn={maskOn}
        onToggleMask={onToggleMask}
        layerOn={layerOn}
        onToggleLayer={onToggleLayer}
        catOn={catOn}
        onToggleCat={onToggleCat}
        onToggleActivityAll={onToggleActivityAll}
        topView={topView}
        onToggleTopView={onToggleTopView}
      />
    </div>
  );
}
