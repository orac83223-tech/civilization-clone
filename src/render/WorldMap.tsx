import { useCallback, useEffect, useRef, useState } from 'react';
import type { Observation, PathResult, Terrain, Tile, UnitType } from '../game/core/types';
import { UNITS } from '../game/data/balance';
import { Icon } from '../ui/Icon';

type Geometry = { id: number; q: number; r: number };
interface Props {
  observation: Observation;
  geometry: Geometry[];
  selectedTile: number | null;
  selectedUnit: string | null;
  reachable: Record<number, number>;
  path: PathResult | null;
  onTile: (id: number) => void;
  focusTile: { id: number; nonce: number } | null;
  disabled?: boolean;
  mini?: boolean;
}
const SQRT3 = Math.sqrt(3);
const HEX = 35;
const palette: Record<Terrain, string[]> = {
  ocean: ['#163d4e', '#123442'], grassland: ['#839c73', '#739169'],
  plains: ['#b0ae78', '#a0a172'], forest: ['#63836a', '#547660'],
  hills: ['#909879', '#7c8e73'], mountain: ['#73827d', '#596e70'],
  desert: ['#c9b27b', '#b4a274'],
};
const p = (tile: { q: number; r: number }) => ({ x: HEX * SQRT3 * (tile.q + tile.r / 2), y: HEX * 1.5 * tile.r });
function polygon(c: CanvasRenderingContext2D, x: number, y: number, radius = HEX) {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    const px = x + radius * Math.cos(a); const py = y + radius * Math.sin(a);
    if (!i) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
}
function hash(a: number, b = 0) { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123; return n - Math.floor(n); }
function tree(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.fillStyle = '#3c5c50'; c.fillRect(x - .8, y + 1, 1.6, s * .6);
  c.fillStyle = '#365c4c'; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x - s * .5, y + s * .25); c.lineTo(x + s * .5, y + s * .25); c.closePath(); c.fill();
  c.fillStyle = '#486f56'; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x - s * .5, y + s * .25); c.lineTo(x, y); c.closePath(); c.fill();
}
function mountain(c: CanvasRenderingContext2D, x: number, y: number, s: number, snow: boolean) {
  c.fillStyle = '#53696a'; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x - s * .7, y + s * .5); c.lineTo(x + s * .8, y + s * .5); c.closePath(); c.fill();
  c.fillStyle = '#94a49a'; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x - s * .7, y + s * .5); c.lineTo(x + s * .12, y); c.closePath(); c.fill();
  if (snow) { c.fillStyle = '#d4dace'; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x - s * .25, y - s * .46); c.lineTo(x - s * .06, y - s * .6); c.lineTo(x + s * .06, y - s * .38); c.lineTo(x + s * .27, y - s * .49); c.closePath(); c.fill(); }
}
function decoration(c: CanvasRenderingContext2D, tile: Tile, x: number, y: number) {
  const { terrain, id } = tile;
  if (terrain === 'forest') {
    for (let i = 0; i < 8; i++) tree(c, x + (hash(id, i) - .5) * 42, y + (hash(i + 17, id) - .5) * 29, 9 + hash(id + 3, i) * 6);
  } else if (terrain === 'mountain') {
    mountain(c, x - 10, y + 1, 19, true); mountain(c, x + 7, y + 5, 26, true);
  } else if (terrain === 'hills') {
    for (let i = 0; i < 3; i++) {
      c.beginPath(); c.ellipse(x + (i - 1) * 13, y + i * 5 - 4, 15, 11, -.1, Math.PI, Math.PI * 2); c.fillStyle = i % 2 ? '#849776' : '#a0a987'; c.fill(); c.strokeStyle = '#687f63'; c.lineWidth = 1; c.stroke();
    }
  } else if (terrain === 'ocean') {
    c.strokeStyle = '#4b8290'; c.globalAlpha = .24; c.lineWidth = 1;
    for (let i = 0; i < 3; i++) { c.beginPath(); const yy = y + (i - 1) * 13; c.moveTo(x - 12, yy); c.quadraticCurveTo(x - 6, yy - 3, x, yy); c.quadraticCurveTo(x + 6, yy + 3, x + 12, yy); c.stroke(); } c.globalAlpha = 1;
  } else {
    c.strokeStyle = terrain === 'desert' ? '#e3cb94' : '#d0d4a0'; c.globalAlpha = .42; c.lineWidth = .8;
    for (let i = 0; i < 9; i++) { const xx = x + (hash(id, i) - .5) * 42; const yy = y + (hash(i + 10, id) - .5) * 38; c.beginPath(); c.moveTo(xx - 3, yy + 2); c.quadraticCurveTo(xx, yy - 3, xx + 3, yy + 1); c.stroke(); } c.globalAlpha = 1;
  }
  if (tile.improvement === 'farm') {
    c.save(); c.translate(x, y + 8); c.rotate(-.3); c.strokeStyle = '#e4cd83'; c.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(-10, i * 4); c.lineTo(10, i * 4); c.stroke(); } c.restore();
  } else if (tile.improvement === 'mine') {
    c.fillStyle = '#384e4d'; c.fillRect(x - 9, y, 18, 13); c.strokeStyle = '#dac89b'; c.lineWidth = 3; c.strokeRect(x - 8, y, 16, 13); c.beginPath(); c.moveTo(x - 11, y); c.lineTo(x, y - 8); c.lineTo(x + 11, y); c.stroke();
  } else if (tile.improvement === 'tradingPost') {
    c.fillStyle = '#eee0b2'; c.fillRect(x - 9, y + 1, 18, 10); c.fillStyle = '#a57151'; c.beginPath(); c.moveTo(x - 13, y + 1); c.lineTo(x, y - 10); c.lineTo(x + 13, y + 1); c.closePath(); c.fill();
  }
  if (tile.ruin) { c.fillStyle = '#e2d4af'; c.fillRect(x - 8, y - 3, 4, 12); c.fillRect(x + 4, y - 3, 4, 12); c.fillRect(x - 10, y - 6, 20, 4); c.strokeStyle = '#4b655a'; c.lineWidth = 1; c.strokeRect(x - 10, y - 6, 20, 4); }
}
function unitSymbol(c: CanvasRenderingContext2D, type: UnitType, x: number, y: number) {
  c.save(); c.translate(x, y); c.strokeStyle = '#fff1ce'; c.fillStyle = '#fff1ce'; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
  if (type === 'settler') { c.moveTo(-6, 4); c.lineTo(-6, -3); c.lineTo(0, -8); c.lineTo(6, -3); c.lineTo(6, 4); c.closePath(); c.moveTo(-8, 4); c.lineTo(8, 4); c.moveTo(-2, 4); c.lineTo(-2, -1); c.lineTo(2, -1); c.lineTo(2, 4); }
  if (type === 'scout') { c.moveTo(0, -8); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath(); c.moveTo(0, -8); c.lineTo(0, 3); }
  if (type === 'worker') { c.moveTo(-6, 7); c.lineTo(5, -6); c.moveTo(-4, -5); c.quadraticCurveTo(3, -10, 8, -1); }
  if (type === 'warrior') { c.moveTo(-6, 7); c.lineTo(7, -7); c.lineTo(5, -2); c.moveTo(-7, -6); c.lineTo(6, 7); c.moveTo(-7, 1); c.lineTo(-1, 7); c.moveTo(1, 7); c.lineTo(7, 1); }
  if (type === 'archer') { c.moveTo(-5, -8); c.quadraticCurveTo(10, 0, -5, 8); c.lineTo(-5, -8); c.moveTo(-5, 0); c.lineTo(8, 0); c.lineTo(5, -3); c.moveTo(8, 0); c.lineTo(5, 3); }
  if (type === 'cavalry') { c.moveTo(-7, 7); c.lineTo(7, 7); c.lineTo(5, 2); c.lineTo(1, 0); c.lineTo(7, -5); c.lineTo(7, -9); c.lineTo(3, -7); c.lineTo(-2, -8); c.lineTo(-7, 1); c.lineTo(-3, 3); c.closePath(); }
  if (type === 'siege') { c.moveTo(-7, 4); c.lineTo(7, 4); c.lineTo(3, -3); c.lineTo(-5, -3); c.closePath(); c.moveTo(0, -3); c.lineTo(7, -9); c.moveTo(-5, 7); c.arc(-5, 7, 2, 0, Math.PI * 2); c.moveTo(7, 7); c.arc(5, 7, 2, 0, Math.PI * 2); }
  c.stroke(); c.restore();
}

export function WorldMap({ observation, geometry, selectedTile, selectedUnit, reachable, path, onTile, focusTile, disabled = false, mini = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const centerX = size.width / 2;
  const centerY = !mini && size.width <= 650 ? size.height * .36 : size.height / 2;
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: mini ? .25 : 1.05 });
  const initialized = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ x: 0, y: 0, moved: false, distance: 0 });
  const visible = new Set(observation.self.visible);
  const focus = useCallback((id: number) => {
    const tile = geometry.find(t => t.id === id); if (!tile) return;
    const point = p(tile); setCamera(c => ({ ...c, x: -point.x, y: -point.y }));
  }, [geometry]);
  useEffect(() => {
    const el = host.current; if (!el) return;
    const resize = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    window.addEventListener('resize', resize); return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    if (!initialized.current && geometry.length) { focus(observation.self.capitalId ? observation.ownCities.find(c => c.id === observation.self.capitalId)?.tile ?? observation.units[0]?.tile ?? 0 : observation.units.find(u => u.owner === observation.actorId)?.tile ?? 0); initialized.current = true; }
  }, [geometry, observation, focus]);
  useEffect(() => { if (focusTile) focus(focusTile.id); }, [focusTile, focus]);
  useEffect(() => {
    if (!mini) return;
    const coords = geometry.map(p); const minX = Math.min(...coords.map(a => a.x)); const maxX = Math.max(...coords.map(a => a.x)); const maxY = Math.max(...coords.map(a => a.y));
    setCamera({ x: -(minX + maxX) / 2, y: -maxY / 2, zoom: Math.min(size.width / (maxX - minX + 80), size.height / (maxY + 80)) });
  }, [mini, size, geometry]);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const c = el.getContext('2d'); if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    el.width = Math.round(size.width * dpr); el.height = Math.round(size.height * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#102733'; c.fillRect(0, 0, size.width, size.height);
    const bg = c.createRadialGradient(size.width * .5, size.height * .5, 0, size.width * .5, size.height * .5, size.width * .7);
    bg.addColorStop(0, '#204453'); bg.addColorStop(1, '#0b1b26'); c.fillStyle = bg; c.fillRect(0, 0, size.width, size.height);
    c.save(); c.translate(centerX, centerY); c.scale(camera.zoom, camera.zoom); c.translate(camera.x, camera.y);
    for (const point of geometry) {
      const { x, y } = p(point); const tile = observation.tiles[point.id];
      if (!tile) { polygon(c, x, y); c.fillStyle = hash(point.id) > .6 ? '#203640' : '#1d333e'; c.fill(); c.strokeStyle = '#2a434b'; c.lineWidth = .5; c.stroke(); if (!mini && hash(point.id) > .95) { c.fillStyle = '#536970'; c.font = '11px Georgia'; c.textAlign = 'center'; c.fillText('·', x, y); } continue; }
      const colors = palette[tile.terrain]; polygon(c, x, y); const g = c.createLinearGradient(x, y - HEX, x, y + HEX); g.addColorStop(0, colors[0]!); g.addColorStop(1, colors[1]!); c.fillStyle = g; c.fill();
      c.strokeStyle = '#15373233'; c.lineWidth = .7; c.stroke();
      if (!mini) decoration(c, tile, x, y);
      if (tile.owner !== null) { const faction = observation.factions.find(f => f.id === tile.owner); if (faction) { polygon(c, x, y, HEX - 1); c.fillStyle = `${faction.color}15`; c.fill(); c.strokeStyle = `${faction.color}90`; c.lineWidth = 1.8; c.stroke(); } }
      if (!visible.has(point.id)) { polygon(c, x, y); c.fillStyle = '#1027379e'; c.fill(); }
      if (tile.resource && !mini) {
        c.beginPath(); c.arc(x + 16, y + 16, 7, 0, Math.PI * 2); c.fillStyle = '#203c36dd'; c.fill(); c.strokeStyle = '#e5d6a488'; c.lineWidth = .7; c.stroke(); c.fillStyle = '#eadcaf'; c.font = 'bold 9px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(tile.resource === 'grain' ? '穀' : tile.resource === 'iron' ? 'Fe' : '馬', x + 16, y + 16.5);
      }
    }
    if (!mini) {
      for (const id of Object.keys(reachable).map(Number)) { const tile = geometry[id]; if (!tile || !observation.tiles[id]) continue; const { x, y } = p(tile); polygon(c, x, y, HEX - 3); c.fillStyle = '#e7d18c18'; c.fill(); c.strokeStyle = '#e7d18c80'; c.lineWidth = 1.5; c.setLineDash([3, 5]); c.stroke(); c.setLineDash([]); }
      if (path && path.path.length > 1) { c.beginPath(); for (const [index, id] of path.path.entries()) { const tile = geometry[id]; if (!tile || !observation.tiles[id]) continue; const { x, y } = p(tile); if (!index) c.moveTo(x, y); else c.lineTo(x, y); } c.strokeStyle = '#f4da90'; c.lineWidth = 3; c.setLineDash([5, 5]); c.stroke(); c.setLineDash([]); }
    }
    for (const city of observation.cities) {
      const tile = geometry[city.tile]; if (!tile || !observation.tiles[city.tile]) continue;
      const { x, y } = p(tile); const faction = observation.factions.find(f => f.id === city.owner); const color = faction?.color ?? '#ccb785';
      if (mini) { c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.fillStyle = color; c.fill(); continue; }
      c.globalAlpha = city.visible ? 1 : .6;
      c.fillStyle = '#20373180'; c.beginPath(); c.ellipse(x, y + 10, 22, 8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#eddfb6'; c.fillRect(x - 18, y - 4, 8, 13); c.fillRect(x - 9, y - 10, 9, 20); c.fillRect(x + 1, y - 17, 9, 27); c.fillRect(x + 11, y - 6, 8, 16);
      c.fillStyle = color; c.fillRect(x - 10, y - 12, 11, 3); c.fillRect(x, y - 20, 11, 4); c.fillRect(x - 20, y + 9, 42, 3);
      c.fillStyle = '#596e61'; for (let i = 0; i < 3; i++) c.fillRect(x + 4, y - 13 + i * 7, 3, 3);
      c.strokeStyle = color; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 5, y - 20); c.lineTo(x + 5, y - 29); c.stroke(); c.fillStyle = color; c.beginPath(); c.moveTo(x + 5, y - 29); c.lineTo(x + 15, y - 25); c.lineTo(x + 5, y - 22); c.fill();
      const label = `${city.originalCapitalOf !== null ? '◇ ' : ''}${city.name}`; c.font = '600 10px system-ui'; const tw = c.measureText(label).width;
      c.fillStyle = '#102633ee'; c.beginPath(); c.roundRect(x - tw / 2 - 10, y - 48, tw + 20, 18, 3); c.fill(); c.strokeStyle = `${color}aa`; c.lineWidth = .8; c.stroke(); c.fillStyle = '#f0e9d1'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, x, y - 39);
      if (!city.visible) { c.font = '8px system-ui'; c.fillStyle = '#d6d1bd'; c.fillText(`${city.lastSeen}R 확인`, x, y + 21); }
      c.globalAlpha = 1;
    }
    if (!mini) for (const unit of observation.units) {
      const tile = geometry[unit.tile]; if (!tile) continue;
      const point = p(tile); const colocated = observation.units.filter(u => u.tile === unit.tile); const index = colocated.findIndex(u => u.id === unit.id); const x = point.x + (colocated.length > 1 ? (index ? 12 : -12) : 0); const y = point.y + (observation.cities.some(c => c.tile === unit.tile) ? 23 : 3);
      const faction = observation.factions.find(f => f.id === unit.owner); const color = faction?.color ?? '#aa8b70';
      c.beginPath(); c.arc(x + 1, y + 3, 14, 0, Math.PI * 2); c.fillStyle = '#0b202766'; c.fill();
      c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.fillStyle = unit.owner === observation.actorId ? '#1d4950' : '#47343a'; c.fill(); c.strokeStyle = selectedUnit === unit.id ? '#ffe4a1' : color; c.lineWidth = selectedUnit === unit.id ? 3 : 2; c.stroke(); unitSymbol(c, unit.type, x, y);
      if (unit.owner === observation.actorId && unit.moves > 0 && !unit.waiting) { c.beginPath(); c.arc(x + 10, y - 10, 3, 0, Math.PI * 2); c.fillStyle = '#eddb95'; c.fill(); }
      if (unit.hp < UNITS[unit.type].hp) { c.fillStyle = '#182932'; c.fillRect(x - 11, y + 16, 22, 3); c.fillStyle = '#8ab578'; c.fillRect(x - 11, y + 16, 22 * unit.hp / UNITS[unit.type].hp, 3); }
    }
    if (selectedTile !== null && !mini) { const tile = geometry[selectedTile]; if (tile) { const { x, y } = p(tile); polygon(c, x, y, HEX - 1.5); c.strokeStyle = '#ffe1a0'; c.lineWidth = 3; c.stroke(); polygon(c, x, y, HEX + 2); c.strokeStyle = '#10273399'; c.lineWidth = 1; c.stroke(); } }
    c.restore();
  }, [observation, geometry, selectedTile, selectedUnit, reachable, path, size, camera, mini, centerX, centerY]);
  const pointToTile = useCallback((cx: number, cy: number) => {
    const rect = canvas.current?.getBoundingClientRect(); if (!rect) return;
    const x = (cx - rect.left - centerX) / camera.zoom - camera.x; const y = (cy - rect.top - centerY) / camera.zoom - camera.y;
    const qf = (SQRT3 / 3 * x - y / 3) / HEX; const rf = (2 / 3 * y) / HEX; const sf = -qf - rf;
    let q = Math.round(qf); let r = Math.round(rf); const s = Math.round(sf); const qd = Math.abs(q - qf); const rd = Math.abs(r - rf); const sd = Math.abs(s - sf);
    if (qd > rd && qd > sd) q = -r - s; else if (rd > sd) r = -q - s;
    return geometry.find(t => t.q === q && t.r === r)?.id;
  }, [camera, centerX, centerY, geometry]);
  const zoomAt = useCallback((ratio: number, px = centerX, py = centerY) => {
    setCamera(c => { const zoom = Math.max(.4, Math.min(2.4, c.zoom * ratio)); const wx = (px - centerX) / c.zoom - c.x; const wy = (py - centerY) / c.zoom - c.y; return { zoom, x: (px - centerX) / zoom - wx, y: (py - centerY) / zoom - wy }; });
  }, [centerX, centerY]);
  useEffect(() => {
    const el = canvas.current; if (!el || mini) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const rect = el.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * .001), e.clientX - rect.left, e.clientY - rect.top); };
    el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt, mini]);
  return <div className={`world-map ${mini ? 'mini-world' : ''}`} ref={host}>
    <canvas ref={canvas} data-testid={mini ? 'mini-map' : 'map-canvas'} tabIndex={mini ? -1 : 0} aria-label="육각 세계 지도. 드래그로 이동, 휠 또는 두 손가락으로 확대. 방향키로 타일 선택, Enter로 선택 실행."
      onKeyDown={e => { if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.key)) return; e.preventDefault(); const current = geometry[selectedTile ?? observation.units[0]?.tile ?? 0]; if (!current) return; if (e.key === 'Enter') { onTile(current.id); return; } const delta = e.key === 'ArrowUp' ? [0, -1] : e.key === 'ArrowDown' ? [0, 1] : e.key === 'ArrowLeft' ? [-1, 0] : [1, 0]; const next = geometry.find(t => t.q === current.q + delta[0]! && t.r === current.r + delta[1]!); if (next) { onTile(next.id); focus(next.id); } }}
      onPointerDown={e => { if (mini) return; e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); gesture.current = { x: e.clientX, y: e.clientY, moved: pointers.current.size > 1, distance: 0 }; }}
      onPointerMove={e => {
        if (!pointers.current.has(e.pointerId)) return;
        const previous = pointers.current.get(e.pointerId)!; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size > 1) { gesture.current.moved = true; const [a, b] = [...pointers.current.values()]; if (!a || !b) return; const dist = Math.hypot(a.x - b.x, a.y - b.y); const rect = e.currentTarget.getBoundingClientRect(); if (gesture.current.distance) zoomAt(dist / gesture.current.distance, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top); gesture.current.distance = dist; }
        else if (gesture.current.moved || Math.hypot(e.clientX - gesture.current.x, e.clientY - gesture.current.y) > 6) { gesture.current.moved = true; setCamera(c => ({ ...c, x: c.x + (e.clientX - previous.x) / c.zoom, y: c.y + (e.clientY - previous.y) / c.zoom })); }
      }}
      onPointerUp={e => { const moved = gesture.current.moved; pointers.current.delete(e.pointerId); if (!moved && !disabled) { const id = pointToTile(e.clientX, e.clientY); if (id !== undefined) onTile(id); } if (pointers.current.size) gesture.current.moved = true; }}
      onPointerCancel={e => { pointers.current.delete(e.pointerId); gesture.current.moved = true; }}
    />
    {!mini && <><div className="map-atmosphere"/><div className="compass" aria-hidden="true"><span>N</span><svg width="38" height="46" viewBox="0 0 38 46"><path d="M19 2 28 35 19 28 10 35Z" fill="none" stroke="currentColor"/><path d="M19 2v26l-9 7Z" fill="currentColor" opacity=".6"/></svg></div><div className="map-controls"><button aria-label="지도 축소" onClick={() => zoomAt(.8)}><Icon name="minus" size={17}/></button><span>{Math.round(camera.zoom * 100)}%</span><button aria-label="지도 확대" onClick={() => zoomAt(1.25)}><Icon name="plus" size={17}/></button><button aria-label="선택 위치로 이동" onClick={() => focus(selectedTile ?? observation.units[0]?.tile ?? 0)}><Icon name="target" size={17}/></button></div><div className="map-credit">TERRA INCOGNITA <span>·</span> 미지의 세계</div></>}
  </div>;
}
