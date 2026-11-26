// The valley: terrain height, the winding river, the ring course, the runway,
// and the trees and clouds scattered over it. Everything is a pure function of
// the seed, so the world is identical every time it is built from that seed.
import { COURSE, RINGS } from './config.js';
import { clamp, fbm, mulberry32 } from './random.js';

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The river's centre line wanders across the valley floor as z grows. */
export function riverX(z) {
  return 300 * Math.sin(z * 0.00021 + 0.8) + 140 * Math.sin(z * 0.000053 + 2.1);
}

/** True while (x, z) is on a runway strip (take-off strip or landing runway). */
export function onRunway(x, z) {
  if (Math.abs(x) > COURSE.runwayHalfWidth) return false;
  return (
    (z >= -60 && z <= COURSE.startRunwayEnd) ||
    (z >= COURSE.runwayStart && z <= COURSE.runwayEnd)
  );
}

/** How flat the ground must be here: 1 on a runway, 0 out in the hills. */
function runwayMask(x, z) {
  // The valley mouth past the strip stays flat a while, so a pilot who is slow
  // to pull up after take-off meets meadow, not a hillside, for the first seconds.
  const nearStart = 1 - smoothstep(COURSE.startRunwayEnd, COURSE.startRunwayEnd + 1300, z);
  const nearLand =
    smoothstep(COURSE.runwayStart - 350, COURSE.runwayStart, z) *
    (1 - smoothstep(COURSE.runwayEnd, COURSE.runwayEnd + 350, z));
  const along = Math.max(z < 2000 ? nearStart : 0, nearLand);
  const across = 1 - smoothstep(COURSE.runwayHalfWidth + 60, COURSE.runwayHalfWidth + 260, Math.abs(x));
  return clamp(along * across, 0, 1);
}

/** Ground height in feet at world (x, z). The valley floor is ~0; hills rise each side. */
export function terrainHeight(x, z, seed) {
  const ax = Math.abs(x);
  let h = 0;
  // Rolling farmland hills.
  h += 120 * fbm(x * 0.0011, z * 0.0009, seed, 3);
  // A few taller, rockier peaks further out.
  const peak = fbm(x * 0.00045 + 7.3, z * 0.0004, seed, 2);
  h += 340 * Math.max(0, peak - 0.55) * 2.4;
  // Keep the valley floor gentle so the river and fields read.
  const valley = smoothstep(140, 520, ax);
  h = h * (0.06 + 0.94 * valley) + 18 * (1 - valley);
  // Mountains climb steeply at the map's edges.
  if (ax > 900) h += (ax - 900) * 0.38;
  // The runway strips are dead flat.
  h *= 1 - runwayMask(x, z);
  return Math.max(0, h);
}

/** Build one whole world from a seed: rings, trees, clouds. */
export function buildWorld(seed) {
  const rng = mulberry32(seed);
  const rings = [];
  for (let i = 0; i < RINGS.count; i += 1) {
    const z = RINGS.firstZ + i * RINGS.stepZ;
    const x = 210 * Math.sin(i * 1.31 + 0.4);
    const y = clamp(165 + 115 * Math.sin(i * 0.83 + 1.2), 120, 380);
    rings.push({ index: i, x, y, z, radius: RINGS.radius, passed: false });
  }

  const trees = [];
  for (let i = 0; i < 520; i += 1) {
    const x = (rng() * 2 - 1) * 820;
    const z = rng() * (COURSE.runwayEnd + 600);
    const h = terrainHeight(x, z, seed);
    if (h > 175) continue; // nothing grows above the treeline
    if (Math.abs(x - riverX(z)) < 34) continue; // not in the river
    if (onRunway(x, z)) continue;
    trees.push({ x, z, y: h, s: 0.7 + rng() * 0.9 });
  }

  const clouds = [];
  for (let i = 0; i < 48; i += 1) {
    clouds.push({
      x: (rng() * 2 - 1) * 1700,
      y: 430 + rng() * 520,
      z: rng() * (COURSE.runwayEnd + 2000),
      s: 70 + rng() * 130,
    });
  }

  return { seed, rings, trees, clouds };
}

/** Reset the rings for a fresh flight. */
export function resetRings(world) {
  for (const ring of world.rings) ring.passed = false;
}
