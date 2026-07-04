'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView, type Layer, type PickingInfo } from '@deck.gl/core';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer, PathLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers';
import { metresToDegLat, metresToDegLon } from '@/lib/geo-math';

export interface PickerPoint {
  lat: number;
  lon: number;
}

interface PickerViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

interface PickerMapProps {
  mode: 'point' | 'zone';
  point: PickerPoint | null;
  zoneSize: number;
  verts: [number, number][];
  closed: boolean;
  focus: { lat: number; lon: number } | null;
  onPickPoint: (lat: number, lon: number) => void;
  onAddVert: (lat: number, lon: number) => void;
  onCloseZone: () => void;
  onMovePoint: (lat: number, lon: number) => void;
  onMoveVert: (index: number, lat: number, lon: number) => void;
}

type DragTarget = { type: 'point' } | { type: 'vert'; index: number } | null;

const HOME_VIEW: PickerViewState = { longitude: 3.0, latitude: 44.0, zoom: 4.2, pitch: 0, bearing: 0 };
const TILE_URL = 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png';
const BLUE: [number, number, number] = [37, 99, 235];
const POINT_COLOR: [number, number, number] = [229, 101, 75];

function squareAround(point: PickerPoint, half: number): [number, number][] {
  const dLat = metresToDegLat(half);
  const dLon = metresToDegLon(half, point.lat);
  return [
    [point.lon - dLon, point.lat - dLat],
    [point.lon + dLon, point.lat - dLat],
    [point.lon + dLon, point.lat + dLat],
    [point.lon - dLon, point.lat + dLat],
  ];
}

export default function PickerMap({
  mode,
  point,
  zoneSize,
  verts,
  closed,
  focus,
  onPickPoint,
  onAddVert,
  onCloseZone,
  onMovePoint,
  onMoveVert,
}: PickerMapProps) {
  const [viewState, setViewState] = useState<PickerViewState>({ ...HOME_VIEW });
  const [grab, setGrab] = useState(false);
  const dragRef = useRef<DragTarget>(null);

  useEffect(() => {
    if (!focus) return;
    setViewState((vs) => ({ ...vs, longitude: focus.lon, latitude: focus.lat, zoom: 15 }));
  }, [focus]);

  const handleClick = (info: PickingInfo) => {
    const coord = info.coordinate;
    if (!coord) return;
    const [lon, lat] = coord as [number, number];
    if (mode === 'point') {
      if (info.layer?.id === 'picked-point') return;
      onPickPoint(lat, lon);
      return;
    }
    if (closed) return;
    if (info.layer?.id === 'draw-verts') {
      if (info.index === 0 && verts.length >= 3) onCloseZone();
      return;
    }
    if (verts.length >= 3 && info.viewport) {
      const [fx, fy] = info.viewport.project([verts[0][1], verts[0][0]]);
      if (Math.hypot(fx - info.x, fy - info.y) < 14) {
        onCloseZone();
        return;
      }
    }
    onAddVert(lat, lon);
  };

  const handleHover = (info: PickingInfo) => {
    if (dragRef.current) return;
    setGrab(info.layer?.id === 'picked-point' || info.layer?.id === 'draw-verts');
  };

  const handleDragStart = (info: PickingInfo) => {
    if (info.layer?.id === 'picked-point') dragRef.current = { type: 'point' };
    else if (info.layer?.id === 'draw-verts' && info.index >= 0)
      dragRef.current = { type: 'vert', index: info.index };
  };

  const handleDrag = (info: PickingInfo) => {
    const target = dragRef.current;
    if (!target || !info.coordinate) return;
    const [lon, lat] = info.coordinate as [number, number];
    if (target.type === 'point') onMovePoint(lat, lon);
    else onMoveVert(target.index, lat, lon);
  };

  const handleDragEnd = () => {
    dragRef.current = null;
  };

  const layers = useMemo(() => {
    const out: Layer[] = [];

    out.push(
      new TileLayer({
        id: 'basemap',
        data: TILE_URL,
        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,
        renderSubLayers: (props) => {
          const { west, south, east, north } = props.tile.bbox as {
            west: number;
            south: number;
            east: number;
            north: number;
          };
          return new BitmapLayer(props, {
            data: null as unknown as undefined,
            image: props.data,
            bounds: [west, south, east, north],
          });
        },
      }),
    );

    if (mode === 'point' && point) {
      const square = squareAround(point, zoneSize);
      out.push(
        new PolygonLayer<{ ring: [number, number][] }>({
          id: 'zone-square',
          data: [{ ring: square }],
          getPolygon: (d) => d.ring,
          getFillColor: [...BLUE, 26],
          getLineColor: [...BLUE, 210],
          lineWidthUnits: 'pixels',
          getLineWidth: 1.5,
          stroked: true,
          filled: true,
        }),
        new ScatterplotLayer<PickerPoint>({
          id: 'picked-point',
          data: [point],
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 6,
          radiusUnits: 'pixels',
          getFillColor: [...POINT_COLOR, 255],
          getLineColor: [255, 255, 255, 255],
          stroked: true,
          lineWidthMinPixels: 2,
          pickable: true,
        }),
      );
    }

    if (mode === 'zone' && verts.length) {
      const ring = verts.map(([la, lo]): [number, number] => [lo, la]);
      if (closed) {
        out.push(
          new PolygonLayer<{ ring: [number, number][] }>({
            id: 'draw-polygon',
            data: [{ ring }],
            getPolygon: (d) => d.ring,
            getFillColor: [...BLUE, 32],
            getLineColor: [...BLUE, 230],
            lineWidthUnits: 'pixels',
            getLineWidth: 2,
            stroked: true,
            filled: true,
          }),
        );
      } else {
        out.push(
          new PathLayer<{ path: [number, number][] }>({
            id: 'draw-path',
            data: [{ path: ring }],
            getPath: (d) => d.path,
            getColor: [...BLUE, 230],
            getWidth: 2,
            widthUnits: 'pixels',
          }),
        );
      }
      out.push(
        new ScatterplotLayer<{ p: [number, number]; first: boolean }>({
          id: 'draw-verts',
          data: verts.map(([la, lo], i) => ({ p: [lo, la] as [number, number], first: i === 0 })),
          getPosition: (d) => d.p,
          getRadius: (d) => (d.first && !closed && verts.length >= 3 ? 7 : 4.5),
          radiusUnits: 'pixels',
          getFillColor: (d) =>
            d.first && !closed && verts.length >= 3 ? [255, 255, 255, 255] : [...BLUE, 255],
          getLineColor: [255, 255, 255, 220],
          stroked: true,
          lineWidthMinPixels: 1.5,
          pickable: true,
        }),
      );
    }

    return out;
  }, [mode, point, zoneSize, verts, closed]);

  const view = useMemo(() => new MapView({ repeat: true }), []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0 [filter:brightness(1.6)_saturate(1.5)_contrast(1.05)]">
        <DeckGL
          views={view}
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs as unknown as PickerViewState)}
          controller={{ dragRotate: false, touchRotate: false, doubleClickZoom: false, dragPan: !grab }}
          layers={layers}
          onClick={handleClick}
          onHover={handleHover}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          getCursor={() => (dragRef.current ? 'grabbing' : grab ? 'grab' : 'crosshair')}
        />
      </div>
      <div className="pointer-events-none absolute bottom-1.5 right-2 font-mono text-[10px] text-ash">
        © OpenStreetMap · © CARTO
      </div>
    </div>
  );
}
