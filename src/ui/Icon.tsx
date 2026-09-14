import type { CSSProperties } from 'react';

const paths: Record<string, string> = {
  sun: 'M12 5v2m0 10v2M5 12h2m10 0h2M7 7l1.4 1.4m7.2 7.2L17 17M7 17l1.4-1.4m7.2-7.2L17 7M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z',
  settler: 'M4 20h16M6 20V10l6-6 6 6v10M4 11l8-8 8 8M10 20v-6h4v6M12 3V1l5 1-5 2',
  city: 'M3 20h18M5 20V10h4v10m6 0V7h4v13M9 20V4h6v16M11 7h2m-2 4h2m-2 4h2',
  scout: 'M12 2l7 18-7-4-7 4L12 2Zm0 0v14',
  warrior: 'm6 3 5 5-3 3-5-5m13 15-6-6m-3 3 11-11 3-1-1 3-11 11m6-4 4 4M3 21l4-4',
  archer: 'M7 3q18 9 0 18M7 3v18m0-9h14m-3-3 3 3-3 3',
  worker: 'm5 20 11-13M6 5q7-5 14 4M9 3l11 10',
  cavalry: 'M5 21h14l-1-4-5-3 5-4V4l-4 2-4-1-5 8 4 2-3 3v3M16 8h.01',
  siege: 'M5 17h14L15 9H7l-2 8Zm2 0-2-6m5-2 7-6m-3-1 5 3M8 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm12 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  science: 'M9 3h6m-5 0v6l-6 10q-1 2 2 2h12q3 0 2-2L14 9V3M7 15h10',
  gold: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM12 7v10m3-8h-4q-4 0 0 3h2q4 3 0 3H9',
  food: 'M12 21V5M12 15Q3 16 4 9q8 0 8 6ZM12 10q-1-6 5-7 2 6-5 7Zm0 8q0-7 7-6 0 6-7 6Z',
  production: 'm4 20 10-10m-5 0 6 6m-5-9 4-4 7 7-4 4-7-7ZM3 18l3 3',
  culture: 'M4 20h16M6 17V9m6 8V9m6 8V9M3 7l9-5 9 5H3Zm2 10h14',
  diplomacy: 'm3 9 4-4 5 2 5-2 4 4-3 7-4 3-4-1-5-3-2-6Zm4 4 5 4m-3-6 6 5m-5-8-3 3 3 2 4-3 4 3',
  shield: 'M12 2 4 5v7q0 6 8 10 8-4 8-10V5l-8-3Zm-4 10 3 3 5-6',
  crown: 'm3 6 5 5 4-7 4 7 5-5-2 12H5L3 6Zm2 15h14',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16',
  save: 'M4 3h13l3 3v15H4V3Zm3 0v7h9V3M8 21v-7h8v7',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  chevron: 'm9 5 7 7-7 7',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  target: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM12 2v5m0 10v5M2 12h5m10 0h5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'm5 12 4 4L19 6',
  heart: 'M12 21 3 12C-2 4 8-1 12 6c4-7 14-2 9 6l-9 9Z',
  flag: 'M5 22V3m0 0q4-3 8 0t7 0v10q-3 3-7 0t-8 0',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-3-6h6l1 4 4 1 2 5-3 3 1 4-5 3-3-3-4 1-4-4 2-4-3-3 2-5 4-1Z',
  book: 'M12 5q-5-4-10-1v15q5-3 10 1 5-4 10-1V4q-5-3-10 1Zm0 0v15',
  download: 'M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 15v6h16v-6',
};
export function Icon({ name, size = 20, style, className = '' }: { name: string; size?: number; style?: CSSProperties; className?: string }) {
  return <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name] ?? paths.sun}/></svg>;
}

export function EmpireMark({ size = 64 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M50 3 91 26v48L50 97 9 74V26Z" stroke="currentColor" strokeWidth="1.2"/><path d="M50 11 84 30v40L50 89 16 70V30Z" stroke="currentColor" strokeOpacity=".35"/><path d="M27 63h46M33 63V44h10v19m14 0V44h10v19M43 63V34l7-7 7 7v29M24 70h52" stroke="currentColor" strokeWidth="2.5"/><path d="M32 37a21 21 0 0 1 36 0M50 15v5M28 23l4 4m40-4-4 4M20 40l5 1m55-1-5 1" stroke="currentColor" strokeWidth="1.5"/></svg>;
}
