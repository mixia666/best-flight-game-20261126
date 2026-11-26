// Screenshot scenes behind ?shot=start|play|ring|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (bank toward the next ring, pitch toward its height, steady throttle),
// so every frame is what a short game really looks like and the same seed always
// gives the same frame.
import { COURSE, STEP } from './config.js';
import { createState, stepFlight, targetRing } from './physics.js';
import { clamp } from './random.js';

const START_SECONDS = 0; // title: the plane sits on the strip, engine idling
const PLAY_SECONDS = 24; // mid-course, rings already being collected
const END_SECONDS = 240; // the whole course, flown to a landing

/** Steer toward a point in the sky: bank for heading error, pitch for height. */
function autopilot(state, targetX, targetY, throttle) {
  // Aim at a point 600 ft ahead of the target's line: the bank follows the
  // heading error, so the plane curves smoothly instead of veering sideways.
  const desiredHeading = Math.atan2(targetX - state.x, 600);
  let headingError = desiredHeading - state.heading;
  while (headingError > Math.PI) headingError -= Math.PI * 2;
  while (headingError < -Math.PI) headingError += Math.PI * 2;
  const bank = clamp(headingError * 2.2, -1, 1);
  const pitch = clamp((state.y - targetY) / 90, -1, 1); // positive pitch input = descend
  return { bank, pitch, throttleDelta: 0 };
}

/** Fly `seconds` of game time with the autopilot chasing the next ring. */
function flyCourse(state, seconds, throttleTarget) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (state.status === 'landed' || state.status === 'crashed') break;
    const ring = targetRing(state);
    let targetX = 0;
    let targetY = 200;
    let throttle = throttleTarget;
    if (state.status === 'parked') {
      targetX = 0; // roll straight down the strip until airborne
      targetY = 250;
    } else if (ring) {
      targetX = ring.x;
      targetY = ring.y;
    } else {
      // Rings done: line up on the runway, slow down, and come down gently.
      targetX = 0;
      targetY =
        state.z > COURSE.runwayStart - 3000
          ? Math.max(0, (COURSE.runwayStart + 300 - state.z) * 0.03)
          : 200;
      if (state.z > COURSE.runwayStart - 4000) throttle = 0.42;
    }
    const controls = autopilot(state, targetX, targetY, throttle);
    // Ease the throttle toward its target instead of slamming it.
    const want = throttle - state.throttle;
    controls.throttleDelta = clamp(want * 4, -1, 1);
    stepFlight(state, controls, STEP);
  }
}

/** Fly until the plane has just threaded the given ring, then a breath more. */
function flyToRing(state, ringIndex, throttleTarget) {
  const maxSteps = Math.round(200 / STEP);
  for (let i = 0; i < maxSteps; i += 1) {
    if (state.status === 'landed' || state.status === 'crashed') break;
    const ring = targetRing(state);
    const targetX = state.status === 'parked' ? 0 : ring ? ring.x : 0;
    const targetY = state.status === 'parked' ? 250 : ring ? ring.y : 200;
    const controls = autopilot(state, targetX, targetY, throttleTarget);
    const want = throttleTarget - state.throttle;
    controls.throttleDelta = clamp(want * 4, -1, 1);
    stepFlight(state, controls, STEP);
    const scored = state.events.find((e) => e.kind === 'ring' && e.index === ringIndex);
    state.events.length = 0;
    if (scored) {
      // Hold the frame a moment so the +100 popup is on screen.
      for (let j = 0; j < Math.round(0.5 / STEP); j += 1) stepFlight(state, controls, STEP);
      return;
    }
  }
}

/**
 * Set `world` to the named scene and return the fresh state, the screen to draw
 * over it, the best score to show and the scene's clock.
 */
export function stageShot(name, world, _state) {
  let state = createState(world);
  if (name === 'start') {
    flyCourse(state, START_SECONDS, 0);
    return { state, screen: 'title', best: 0, time: 0 };
  }
  if (name === 'play') {
    flyCourse(state, PLAY_SECONDS, 0.72);
    return { state, screen: 'flying', best: 0, time: PLAY_SECONDS };
  }
  if (name === 'ring') {
    // Stop just after the plane threads ring 4, while the +100 popup is still up.
    flyToRing(state, 3, 0.72);
    return { state, screen: 'flying', best: state.score, time: state.time };
  }
  // end: fly the whole course and land on runway 27.
  flyCourse(state, END_SECONDS, 0.7);
  return { state, screen: state.status === 'landed' || state.status === 'crashed' ? 'over' : 'flying', best: state.score, time: END_SECONDS };
}
