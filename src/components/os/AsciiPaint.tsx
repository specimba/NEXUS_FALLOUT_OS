'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { ModeProps } from '@/lib/os/types';

// Canvas geometry (fixed). Font size is computed responsively so the
// 64x22 grid always fits inside the viewport.
const COLS = 64;
const ROWS = 22;

// Brush palette, indexed by 1..9,0 (0 -> index 9).
const PALETTE = ['█', '▓', '▒', '░', '#', '*', '+', '.', '/', '\\'] as const;

const HEADER =
  'ASCII PAINT — arrows:move  space:paint  e:erase  1-0:brush  c:clear  s:save  q:quit';

const SAVE_FILENAME = 'sketch.txt';
const STATUS_TIMEOUT_MS = 2000;

type Grid = string[][];
type CursorPos = { r: number; c: number };

function createEmptyGrid(): Grid {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ' '),
  );
}

/** Join the grid into a single string, trimming trailing spaces per line. */
function gridToArt(grid: Grid): string {
  return grid
    .map((row) => row.join('').replace(/\s+$/g, ''))
    .join('\n');
}

/** Immutable single-cell update; returns the same ref if nothing changed. */
function setCell(grid: Grid, r: number, c: number, ch: string): Grid {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return grid;
  if (grid[r][c] === ch) return grid;
  const next = grid.slice();
  next[r] = grid[r].slice();
  next[r][c] = ch;
  return next;
}

export default function AsciiPaint({ theme, onExit, saveFile }: ModeProps) {
  // Editable state, mirrored into refs so the (once-bound) keydown handler
  // always reads fresh values — robust against key auto-repeat & fast typing.
  const [grid, setGrid] = useState<Grid>(createEmptyGrid);
  const gridRef = useRef<Grid>(grid);
  const writeGrid = (next: Grid) => {
    gridRef.current = next;
    setGrid(next);
  };

  const [cursor, setCursor] = useState<CursorPos>({ r: 0, c: 0 });
  const cursorRef = useRef<CursorPos>(cursor);
  const writeCursor = (next: CursorPos) => {
    cursorRef.current = next;
    setCursor(next);
  };

  const [brush, setBrush] = useState<number>(0);
  const brushRef = useRef<number>(brush);
  const writeBrush = (next: number) => {
    brushRef.current = next;
    setBrush(next);
  };

  const [status, setStatus] = useState<string>('');

  // Viewport tracking for responsive font sizing.
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: 1024,
    h: 768,
  });

  // Transient status-message clear timer.
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExitRef = useRef(onExit);
  const saveFileRef = useRef(saveFile);
  useEffect(() => {
    onExitRef.current = onExit;
    saveFileRef.current = saveFile;
  }, [onExit, saveFile]);

  // Track viewport for responsive font sizing.
  useEffect(() => {
    const update = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Cleanup any pending status timer on unmount.
  useEffect(() => {
    return () => {
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  // Compute a font size that keeps the 64x22 grid inside the viewport.
  const fontSize = useMemo(() => {
    const padX = 24; // 12px root padding * 2
    const overheadY = 96; // header + footer + paddings
    const maxByWidth = (viewport.w - padX) / COLS / 0.6;
    const maxByHeight = (viewport.h - overheadY) / ROWS / 1.2;
    return Math.max(
      8,
      Math.min(18, Math.floor(Math.min(maxByWidth, maxByHeight))),
    );
  }, [viewport]);

  const showStatus = (msg: string) => {
    setStatus(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(
      () => setStatus(''),
      STATUS_TIMEOUT_MS,
    );
  };

  // Main keyboard handler — bound once; reads fresh state from refs.
  useEffect(() => {
    const paintCell = (r: number, c: number, ch: string) => {
      writeGrid(setCell(gridRef.current, r, c, ch));
    };

    const clearCanvas = () => {
      writeGrid(createEmptyGrid());
      showStatus('canvas cleared');
    };

    const saveCanvas = () => {
      const sf = saveFileRef.current;
      if (!sf) {
        showStatus('save not available');
        return;
      }
      const art = gridToArt(gridRef.current);
      const path = sf(SAVE_FILENAME, art);
      showStatus(`saved to ${path}`);
    };

    const quit = () => {
      const art = gridToArt(gridRef.current);
      onExitRef.current(['[paint] session ended', ...art.split('\n')]);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Let browser/OS shortcuts (Cmd/Ctrl/Alt combos) pass through.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const cur = cursorRef.current;

      switch (k) {
        case 'ArrowUp':
          e.preventDefault();
          writeCursor({ ...cur, r: Math.max(0, cur.r - 1) });
          return;
        case 'ArrowDown':
          e.preventDefault();
          writeCursor({ ...cur, r: Math.min(ROWS - 1, cur.r + 1) });
          return;
        case 'ArrowLeft':
          e.preventDefault();
          writeCursor({ ...cur, c: Math.max(0, cur.c - 1) });
          return;
        case 'ArrowRight':
          e.preventDefault();
          writeCursor({ ...cur, c: Math.min(COLS - 1, cur.c + 1) });
          return;
        case ' ':
          e.preventDefault();
          paintCell(cur.r, cur.c, PALETTE[brushRef.current]);
          return;
        case 'e':
        case 'E':
          e.preventDefault();
          paintCell(cur.r, cur.c, ' ');
          return;
        case 'c':
        case 'C':
          e.preventDefault();
          clearCanvas();
          return;
        case 's':
        case 'S':
          e.preventDefault();
          saveCanvas();
          return;
        case 'Escape':
        case 'q':
        case 'Q':
          e.preventDefault();
          quit();
          return;
      }

      // Brush selection: 1..9 -> indices 0..8, 0 -> index 9.
      if (k >= '1' && k <= '9') {
        e.preventDefault();
        const idx = Number(k) - 1;
        if (idx >= 0 && idx < PALETTE.length) writeBrush(idx);
        return;
      }
      if (k === '0') {
        e.preventDefault();
        writeBrush(9);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const rootStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background: theme.bg,
    color: theme.fg,
    padding: 12,
    overflow: 'hidden',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-mono), monospace',
    fontSize,
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
  };

  const lineStyle: CSSProperties = {
    whiteSpace: 'pre',
    lineHeight: 1.2,
    height: '1.2em',
    flexShrink: 0,
  };

  const dimLineStyle: CSSProperties = { ...lineStyle, color: theme.dim };

  return (
    <div style={rootStyle}>
      <style>{`
        @keyframes paintBlink {
          0%, 49%   { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .paint-cursor-blink {
          animation: paintBlink 1s infinite;
        }
      `}</style>

      {/* Header / controls help line */}
      <div style={dimLineStyle}>{HEADER}</div>

      {/* Canvas */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          marginTop: 4,
          marginBottom: 4,
        }}
      >
        {grid.map((row, r) => (
          <div key={r} style={lineStyle}>
            {row.map((cell, c) => {
              const isCursor = r === cursor.r && c === cursor.c;
              const painted = cell !== ' ';
              return (
                <span
                  key={c}
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    width: '1ch',
                    color: theme.fg,
                    textShadow: painted
                      ? `0 0 6px ${theme.glow}`
                      : 'none',
                  }}
                >
                  {painted ? cell : ' '}
                  {isCursor && (
                    <span
                      className="paint-cursor-blink"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: theme.fg,
                        color: theme.bg,
                        pointerEvents: 'none',
                        textShadow: 'none',
                      }}
                    >
                      {painted ? cell : ' '}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer / palette */}
      <div style={dimLineStyle}>
        {PALETTE.map((ch, i) => {
          const active = i === brush;
          const label = i === 9 ? '0' : String(i + 1);
          return (
            <span
              key={i}
              style={{
                color: active ? theme.bg : theme.dim,
                background: active ? theme.fg : 'transparent',
                marginRight: 6,
                padding: '0 4px',
              }}
            >
              {label}:{ch}
            </span>
          );
        })}
        {status ? (
          <span style={{ marginLeft: 12, color: theme.fg }}>— {status}</span>
        ) : null}
      </div>
    </div>
  );
}
