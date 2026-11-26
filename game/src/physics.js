// The flight model: one fixed step of the courier plane.
// Speed follows the throttle, pitch sets the climb, bank turns the heading, and
// the wing quits below stall speed. Rings, fuel, terrain and the runway are all
// checked here; the renderer only draws what this module decides.
import { COURSE, PLANE, RINGS, STEP } from './config.js';
import { clamp } from './random.js';
import { onRunway, resetRings, terrainHeight } from './world.js';

export const KT_TO_FT_S = 1.68781; // one knot is this many feet per second

/** A fresh flight, parked on the take-off strip, engine idling. */
export function createState(world) {
  resetRings(world);
  return {
    world,
    x: 0,
    y: 0,
    z: 0,
    heading: 0, // radians, 0 = straight down the valley (+z)
    pitch: 0, // radians, positive = nose up
    bank: 0, // radians, positive = right wing down
    speed: 0, // knots
    throttle: 0,
    fuel: PLANE.fuelStart,
    score: 0,
    ringsHit: 0,
    time: 0,
    status: 'parked', // parked | flying | landed | crashed
    cause: '',
    events: [], // {kind, ...} drained by the game loop each tick
    popups: [], // floating score texts: {text, x, y, life}
    verticalSpeed: 0,
    terrainClearance: 0,
    nextRing: 0,
    landingRating: '',
  };
}

/** The ring the plane is flying toward next, or null once they are all flown. */
export function targetRing(state) {
  return state.nextRing < state.world.rings.length ? state.world.rings[state.nextRing] : null;
}

function pushEvent(state, event) {
  state.events.push(event);
}

function addPopup(state, text, good) {
  state.popups.push({ text, life: 1.6, good });
  if (state.popups.length > 5) state.popups.shift();
}

/**
 * One physics step. `input` is {bank, pitch, throttleDelta} in [-1, 1].
 * Returns nothing; events land in state.events for the loop to play and show.
 */
export function stepFlight(state, input, dt) {
  const world = state.world;
  if (state.status === 'landed' || state.status === 'crashed') return;

  // Throttle: a nudge moves the lever, which the speed then chases.
  state.throttle = clamp(state.throttle + input.throttleDelta * dt * 0.6, 0, 1);
  const targetSpeed = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
  state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 0.45);
  // On the ground the plane rolls, it does not fly.
  if (state.status === 'parked') {
    state.z += state.speed * KT_TO_FT_S * dt;
    if (state.speed > 62) {
      state.status = 'flying';
      pushEvent(state, { kind: 'takeoff' });
    }
    state.time += dt;
    return;
  }

  // Pitch and bank ease toward what the pilot asks for.
  const targetPitch = (input.pitch * -1 * PLANE.maxPitchDeg * Math.PI) / 180;
  const targetBank = (input.bank * PLANE.maxBankDeg * Math.PI) / 180;
  const control = state.speed < PLANE.stallSpeed ? 0.45 : 1; // mushy controls near stall
  state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 2.2 * control);
  state.bank += (targetBank - state.bank) * Math.min(1, dt * 2.6 * control);

  // A banked wing turns the heading; a level wing flies straight.
  const turnRate = Math.tan(state.bank) * (state.speed / PLANE.cruiseSpeed) * PLANE.turnRate;
  state.heading += turnRate * dt;

  // Climb from pitch and speed; a stalled wing sinks instead.
  let verticalSpeed = state.speed * KT_TO_FT_S * Math.sin(state.pitch);
  const stalled = state.speed < PLANE.stallSpeed;
  if (stalled) verticalSpeed -= (PLANE.stallSpeed - state.speed) * 0.9;
  state.verticalSpeed = verticalSpeed;

  const forward = state.speed * KT_TO_FT_S * Math.cos(state.pitch);
  state.x += forward * Math.sin(state.heading) * dt;
  state.z += forward * Math.cos(state.heading) * dt;
  state.y = Math.max(0, state.y + verticalSpeed * dt);
  state.time += dt;

  // Fuel burns with the throttle; rings top it up a little.
  state.fuel = Math.max(0, state.fuel - (PLANE.fuelDrainBase + state.throttle * PLANE.fuelDrainThrottle) * dt);
  if (state.fuel <= 0 && state.throttle > 0) {
    state.throttle = 0;
    pushEvent(state, { kind: 'flameout' });
  }

  // Popups age out.
  for (const popup of state.popups) popup.life -= dt;
  state.popups = state.popups.filter((p) => p.life > 0);

  // Rings: crossing a ring's plane scores when the hole is hit, warns when missed.
  const ring = targetRing(state);
  if (ring && state.z >= ring.z && state.z - forward * dt < ring.z) {
    const miss = Math.hypot(state.x - ring.x, state.y - ring.y);
    if (miss <= ring.radius) {
      ring.passed = true;
      state.ringsHit += 1;
      state.nextRing += 1;
      state.score += PLANE.ringScore;
      state.fuel = Math.min(100, state.fuel + PLANE.ringFuelBonus);
      addPopup(state, `+${PLANE.ringScore}  RING ${ring.index + 1}`, true);
      pushEvent(state, { kind: 'ring', index: ring.index });
    } else {
      state.nextRing += 1;
      addPopup(state, `MISSED RING ${ring.index + 1}`, false);
      pushEvent(state, { kind: 'miss', index: ring.index });
    }
  }

  // Terrain: the ground is a hard limit everywhere but a gentle runway touchdown.
  const ground = terrainHeight(state.x, state.z, world.seed);
  state.terrainClearance = state.y - ground;
  if (state.y <= ground + 2) {
    const onStrip = onRunway(state.x, state.z);
    const gentle = Math.abs(state.verticalSpeed) < 9 && state.speed < 150;
    const climbingAway = state.verticalSpeed > 15;
    if (state.y < ground - 4) {
      // Deep inside a hillside: no recovery.
      state.status = 'crashed';
      state.cause = 'Flew into the terrain';
      pushEvent(state, { kind: 'crash' });
    } else if (state.z < COURSE.startRunwayEnd + 100 && !climbingAway) {
      // Rolling on the take-off strip: flat ground, not a crash. Once the pitch
      // has built up and the plane is climbing away, this branch lets go.
      state.y = ground;
    } else if (onStrip && gentle && state.z > COURSE.runwayStart - 200) {
      state.status = 'landed';
      state.y = ground;
      state.speed = Math.max(0, state.speed - 40);
      const bonus = PLANE.landingBonus + Math.round(state.fuel) * 5;
      state.score += bonus;
      state.landingRating =
        Math.abs(state.verticalSpeed) < 4 && Math.abs(state.x) < 12 ? 'Butter-smooth landing!' : 'Down safe.';
      pushEvent(state, { kind: 'landed', bonus });
    } else if (climbingAway) {
      // Scraping the ground while climbing away: it clears in a moment.
    } else {
      state.status = 'crashed';
      state.cause = state.fuel <= 0 ? 'Out of fuel over the valley' : 'Flew into the terrain';
      if (Math.abs(state.x) > 1200) state.cause = 'Lost over the mountains';
      pushEvent(state, { kind: 'crash' });
    }
    if (state.status === 'landed' || state.status === 'crashed') return;
  }

  // Flying past the runway with no landing is a missed approach, not a crash.
  if (state.z > COURSE.runwayEnd + 600 && state.status === 'flying') {
    state.status = 'crashed';
    state.cause = 'Overshot the runway — out of valley';
    pushEvent(state, { kind: 'crash' });
  }
}

export { STEP };
