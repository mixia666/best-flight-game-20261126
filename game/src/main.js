// Sky Courier — Valley Run: the loop that ties input, physics, sound and rendering
// together. Runs the real game in the browser, or one frozen screenshot scene when
// the page is opened with ?shot=start|play|ring|end (see shots.js).
import { STEP, VIEW } from './config.js';
import { Input } from './input.js';
import { createState, stepFlight } from './physics.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { stageShot } from './shots.js';
import { buildWorld } from './world.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || '1') || 1;
const shotName = params.get('shot');

const world = buildWorld(seed);
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new Sound();
let state = createState(world);
let screen = 'title'; // title | flying | paused | over
let best = 0;
try {
  best = Number(localStorage.getItem('sky-courier-best') || '0') || 0;
} catch {
  best = 0;
}

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

function startFlight() {
  state = createState(world);
  screen = 'flying';
  sound.ensure();
  announce('Flying. Fly through the golden rings, then land on runway 27.');
}

function endFlight() {
  screen = 'over';
  if (state.status === 'landed' && state.score > best) {
    best = state.score;
    try {
      localStorage.setItem('sky-courier-best', String(best));
    } catch {
      // Private mode: the score just does not persist.
    }
  }
  announce(
    state.status === 'landed'
      ? `Mission complete. Score ${state.score}.`
      : `Crashed: ${state.cause}. Score ${state.score}.`,
  );
}

function handleEvents() {
  for (const event of state.events) {
    if (event.kind === 'ring') sound.ring();
    else if (event.kind === 'miss') sound.miss();
    else if (event.kind === 'takeoff') sound.takeoff();
    else if (event.kind === 'landed') sound.landed();
    else if (event.kind === 'crash') sound.crash();
  }
  state.events.length = 0;
}

let last = performance.now();
let accumulator = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const controls = input.read();
  if (controls.mute) sound.setMuted(!sound.muted);
  if (controls.enter && screen === 'title') startFlight();
  if (controls.restart && (screen === 'over' || screen === 'paused' || screen === 'flying')) startFlight();
  if (controls.pause && screen === 'flying') {
    screen = 'paused';
    announce('Paused.');
  } else if (controls.pause && screen === 'paused') {
    screen = 'flying';
  }
  if (screen === 'flying') {
    accumulator += dt;
    while (accumulator >= STEP) {
      stepFlight(state, controls, STEP);
      accumulator -= STEP;
    }
    handleEvents();
    sound.update(state.throttle, state.speed, state.status === 'flying');
    if (state.status === 'landed' || state.status === 'crashed') endFlight();
  }
  renderer.render(state, screen, now / 1000, best);
  requestAnimationFrame(frame);
}

// A screenshot scene: stage the world with the autopilot, draw one frame, stop.
// The frame is a real moment of the game, not a mock-up.
if (shotName) {
  const staged = stageShot(shotName, world, state);
  state = staged.state;
  best = staged.best;
  screen = staged.screen;
  renderer.render(state, screen, staged.time, best);
  announce(`Sky Courier screenshot scene: ${shotName}.`);
} else {
  canvas.width = VIEW.width;
  canvas.height = VIEW.height;
  requestAnimationFrame(frame);
}
