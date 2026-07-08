/**
 * Task 2a — Fake Weather API
 * ---------------------------------------------------------------------------
 * Returns plausible-but-fictional weather for a set of cyberpunk cities.
 * Randomness is seeded from (city name + current UTC hour) so the report is
 * stable within an hour but drifts over time, giving the terminal a
 * "live feed" feel. No external packages — pure TypeScript + next/server.
 *
 * GET /api/weather?city=Neon%20City
 */

import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Fictional city climate profiles: baseline temp (°C) + half-range.
// ---------------------------------------------------------------------------
type Profile = { base: number; range: number };

const CITY_PROFILES: Record<string, Profile> = {
  'neon city': { base: 18, range: 8 },
  'vaporhaven': { base: 27, range: 6 },
  'dustpeak': { base: 34, range: 10 },
  'halcyon': { base: 14, range: 5 },
  'iron harbor': { base: 9, range: 7 },
  'glimmerwald': { base: 5, range: 9 },
  'nullside': { base: 22, range: 4 },
  'solaris prime': { base: 41, range: 8 },
};

// Mixed bag: retro-cyberpunk flavor + mundane conditions.
const CONDITIONS = [
  'Neon Drizzle',
  'Acid Mist',
  'Solar Flare',
  'Static Storm',
  'Clear',
  'Cloudy',
  'Light Rain',
  'Haze',
  'Toxic Smog',
  'Quantum Fog',
  'Magenta Snow',
  'Ember Winds',
  'Overcast',
  'Thunderstorm',
  'Glitch Rain',
  'Frostbite',
] as const;

const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

// ---------------------------------------------------------------------------
// Deterministic PRNG helpers (FNV-1a hash -> mulberry32)
// ---------------------------------------------------------------------------
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Build a small RNG toolkit around a seed.
function rngToolkit(seed: number) {
  const rand = mulberry32(seed);
  const between = (lo: number, hi: number) =>
    Math.round(lo + rand() * (hi - lo));
  const pick = <T>(arr: readonly T[]): T =>
    arr[Math.floor(rand() * arr.length)];
  return { rand, between, pick };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const url = new URL(req.url);
  const city =
    (url.searchParams.get('city') ?? '').trim() || 'Neon City';

  // Artificial latency so the terminal can show a "fetching..." state.
  await new Promise((r) => setTimeout(r, 250));

  const now = new Date();
  const hour = now.getUTCHours();
  const profile = CITY_PROFILES[city.toLowerCase()] ?? { base: 20, range: 8 };

  // Stable within an hour, varies hour-to-hour.
  const seed =
    (hashString(city.toLowerCase()) ^ Math.imul(hour + 1, 2654435761)) >>> 0;
  const { between, pick } = rngToolkit(seed);

  const tempC = between(profile.base - profile.range, profile.base + profile.range);
  const windKph = between(2, 45);
  const humidity = between(25, 95);
  const feelsLikeC =
    tempC + between(-4, 3) + (humidity > 70 ? 2 : 0) - (windKph > 25 ? 3 : 0);
  const condition = pick(CONDITIONS);
  const windDir = pick(WIND_DIRS);
  const visibilityKm = between(1, 15);
  const pressureHpa = between(985, 1035);
  const uvIndex = between(0, 11);
  const sunrise = formatHM(between(330, 435)); // 05:30 – 07:15
  const sunset = formatHM(between(1080, 1200)); // 18:00 – 20:00

  const forecast = [1, 2, 3].map((i) => {
    const fseed = (seed ^ Math.imul(i, 2246822519)) >>> 0;
    const fk = rngToolkit(fseed);
    const hi = fk.between(profile.base - 2, profile.base + profile.range + 2);
    const lo = hi - fk.between(4, 12);
    return {
      day: i === 1 ? 'Tomorrow' : `+${i}`,
      cond: fk.pick(CONDITIONS),
      hi,
      lo,
    };
  });

  const body = {
    city,
    fetchedAt: now.toISOString(),
    tempC,
    feelsLikeC,
    condition,
    humidity,
    windKph,
    windDir,
    visibilityKm,
    pressureHpa,
    uvIndex,
    sunrise,
    sunset,
    forecast,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
