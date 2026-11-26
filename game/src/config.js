// Sky Courier — Valley Run: shared tuning constants.
// Units: feet for distance/altitude, knots for speed, seconds for time.
export const VIEW = { width: 1280, height: 720 };

export const COURSE = {
  length: 24000, // z of the landing runway threshold
  runwayStart: 24000,
  runwayEnd: 25200,
  runwayHalfWidth: 42,
  startRunwayEnd: 900, // take-off strip at the start of the course
};

export const PLANE = {
  minSpeed: 55, // knots: below this the plane barely flies
  maxSpeed: 225, // knots at full throttle
  cruiseSpeed: 150,
  stallSpeed: 72, // knots: below this the wing quits and the plane sinks
  maxPitchDeg: 24,
  maxBankDeg: 48,
  climbRate: 1.0, // vertical speed scales with speed * sin(pitch)
  turnRate: 0.55, // heading change per second at full bank, scaled by speed
  fuelStart: 100,
  fuelDrainBase: 0.45, // fuel units per second at idle
  fuelDrainThrottle: 0.5, // extra drain per second at full throttle
  ringFuelBonus: 5, // fuel back for each ring flown
  ringScore: 100,
  landingBonus: 500,
};

export const RINGS = {
  count: 10,
  firstZ: 2500,
  stepZ: 2200,
  radius: 70, // feet; the hole the plane must pass through
};

export const STEP = 1 / 60; // fixed physics step, seconds

// Golden-hour palette for the valley: one warm style for sky, land and plane.
export const PALETTE = {
  skyTop: [46, 92, 158],
  skyMid: [127, 178, 221],
  skyHorizon: [255, 217, 160],
  sun: [255, 214, 130],
  haze: [214, 226, 238],
  ridgeFar: [122, 148, 178],
  ridgeNear: [84, 112, 138],
  water: [47, 127, 196],
  waterLight: [63, 154, 216],
  asphalt: [58, 63, 70],
  runwayLine: [232, 232, 232],
  ringGold: [255, 196, 66],
  ringGlow: [255, 220, 120],
  planeOrange: [232, 106, 40],
  planeCream: [250, 240, 216],
  planeDark: [52, 58, 66],
};
