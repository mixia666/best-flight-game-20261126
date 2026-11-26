// Everything the player sees: golden-hour sky, ridge silhouettes, the patchwork
// valley floor with its river and runway, the ring course, the courier plane in
// chase view, and a lit HUD (altitude/speed tapes, compass, fuel, score).
// The world is projected with a simple pinhole camera sitting just behind the plane.
import { COURSE, PALETTE, PLANE, RINGS, VIEW } from './config.js';
import { clamp, css, fbm, hash2, lerp, mixRgb } from './random.js';
import { onRunway, riverX, terrainHeight } from './world.js';

const { width: W, height: H } = VIEW;
const FIELD_COLORS = [
  [127, 174, 78],
  [143, 184, 79],
  [168, 180, 90],
  [109, 163, 68],
  [194, 178, 94],
];
const FOREST = [45, 90, 46];
const HILL = [93, 138, 60];
const ROCK = [138, 141, 148];
const SNOW = [238, 242, 245];

/** Ground colour at (x, z): fields, forest, rock, snow, river or runway. */
function groundColor(x, z, h, seed) {
  if (onRunway(x, z)) {
    if (Math.abs(x) < 2.5 && Math.floor(z / 130) % 2 === 0) return PALETTE.runwayLine;
    // Edge lines only once the strip is a little way off: right under the camera
    // a 5 ft strip would cover half the screen.
    if (Math.abs(x) > 37 && z > 250) return [214, 216, 210];
    return PALETTE.asphalt;
  }
  if (Math.abs(x - riverX(z)) < 26 && h < 45) {
    return (Math.floor(z / 90) + Math.floor(x / 40)) % 2 === 0 ? PALETTE.water : PALETTE.waterLight;
  }
  if (h > 300) return SNOW;
  if (h > 210) return ROCK;
  if (h > 140) return FOREST;
  if (h > 55) return HILL;
  const patch = Math.floor(hash2(Math.floor(x / 380), Math.floor(z / 380), seed) * FIELD_COLORS.length);
  return FIELD_COLORS[clamp(patch, 0, FIELD_COLORS.length - 1)];
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.focal = H * 0.95;
  }

  project(cam, x, y, z) {
    const dz = z - cam.z;
    if (dz < 2) return null; // near plane: 2 ft, so the closest strip still fills the screen bottom
    const s = this.focal / dz;
    return { x: W / 2 + (x - cam.x) * s, y: this.horizonY - (y - cam.y) * s, s, dz };
  }

  drawSky(cam, time) {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, this.horizonY + 60);
    grad.addColorStop(0, css(PALETTE.skyTop));
    grad.addColorStop(0.55, css(PALETTE.skyMid));
    grad.addColorStop(1, css(PALETTE.skyHorizon));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, this.horizonY + 60);
    // Low sun with a warm glow.
    const sunX = W * 0.76;
    const sunY = this.horizonY - 150;
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 190);
    glow.addColorStop(0, css(PALETTE.sun, 0.9));
    glow.addColorStop(0.25, css(PALETTE.sun, 0.35));
    glow.addColorStop(1, css(PALETTE.sun, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 200, sunY - 200, 400, 400);
    ctx.fillStyle = css(PALETTE.sun);
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();
    // Two hazy ridge layers, drifting slowly with the camera.
    this.drawRidge(cam, 1, 150, PALETTE.ridgeFar, 0.9);
    this.drawRidge(cam, 2, 84, PALETTE.ridgeNear, 0.95);
  }

  drawRidge(cam, layer, amp, color, alpha) {
    const ctx = this.ctx;
    const base = this.horizonY + (layer === 1 ? 2 : 10);
    ctx.fillStyle = css(color, alpha);
    ctx.beginPath();
    ctx.moveTo(0, base + 4);
    for (let sx = 0; sx <= W; sx += 16) {
      const n = fbm(sx * 0.004 + layer * 13.7 + cam.x * 0.00035, layer * 9.1, 7, 3);
      ctx.lineTo(sx, base - (30 + amp * (n * 0.5 + 0.5)));
    }
    ctx.lineTo(W, base + 4);
    ctx.closePath();
    ctx.fill();
  }

  drawGround(cam, state) {
    const ctx = this.ctx;
    const seed = state.world.seed;
    const slices = 52;
    const zs = [];
    let z = cam.z + 3; // start almost at the camera so the ground fills the screen bottom
    for (let i = 0; i <= slices; i += 1) {
      zs.push(z);
      z += 34 * Math.pow(1.094, i) * 0.55 + 26;
    }
    // Far to near so nearer strips paint over farther ones.
    for (let i = slices - 1; i >= 0; i -= 1) {
      const zFar = zs[i + 1];
      const zNear = zs[i];
      const sFar = this.focal / (zFar - cam.z);
      const halfFar = Math.min(1500, W / 2 / sFar + 120);
      const sNear = this.focal / (zNear - cam.z);
      const halfNear = Math.min(1500, W / 2 / sNear + 120);
      const half = Math.max(halfFar, halfNear);
      const nx = 16;
      for (let k = 0; k < nx; k += 1) {
        const x0 = cam.x - half + (2 * half * k) / nx;
        const x1 = cam.x - half + (2 * half * (k + 1)) / nx;
        const xm = (x0 + x1) / 2;
        const zm = (zNear + zFar) / 2;
        const h = terrainHeight(xm, zm, seed);
        const haze = clamp((zm - cam.z) / 4200, 0, 1) * 0.55;
        ctx.fillStyle = css(mixRgb(groundColor(xm, zm, h, seed), PALETTE.haze, haze));
        const p0 = this.project(cam, x0, terrainHeight(x0, zNear, seed), zNear);
        const p1 = this.project(cam, x1, terrainHeight(x1, zNear, seed), zNear);
        const p2 = this.project(cam, x1, terrainHeight(x1, zFar, seed), zFar);
        const p3 = this.project(cam, x0, terrainHeight(x0, zFar, seed), zFar);
        if (!p0 || !p1 || !p2 || !p3) continue;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  drawClouds(cam, state) {
    const ctx = this.ctx;
    const clouds = [...state.world.clouds].sort((a, b) => b.z - a.z);
    for (const cloud of clouds) {
      const p = this.project(cam, cloud.x, cloud.y, cloud.z);
      if (!p || p.x < -260 || p.x > W + 260 || p.y < -120 || p.y > H + 60) continue;
      const s = p.s * cloud.s;
      const alpha = clamp(1 - p.dz / 5200, 0.15, 0.75);
      ctx.fillStyle = css([255, 252, 246], alpha);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s, s * 0.34, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x - s * 0.55, p.y + s * 0.1, s * 0.62, s * 0.26, 0, 0, Math.PI * 2);
      ctx.ellipse(p.x + s * 0.55, p.y + s * 0.08, s * 0.66, s * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTrees(cam, state) {
    const ctx = this.ctx;
    const trees = state.world.trees.filter((t) => t.z > cam.z + 30 && t.z < cam.z + 3200);
    trees.sort((a, b) => b.z - a.z);
    for (const tree of trees) {
      const p = this.project(cam, tree.x, tree.y, tree.z);
      if (!p || p.x < -40 || p.x > W + 40 || p.y < this.horizonY - 10 || p.y > H + 20) continue;
      const h = clamp(p.s * 30 * tree.s, 3, 110);
      const w = h * 0.42;
      ctx.fillStyle = css([38, 74, 40]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - h);
      ctx.lineTo(p.x - w, p.y);
      ctx.lineTo(p.x + w, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = css([52, 102, 52]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - h * 1.25);
      ctx.lineTo(p.x - w * 0.7, p.y - h * 0.45);
      ctx.lineTo(p.x + w * 0.7, p.y - h * 0.45);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawRings(cam, state, time) {
    const ctx = this.ctx;
    const rings = [...state.world.rings].sort((a, b) => b.z - a.z);
    for (const ring of rings) {
      const p = this.project(cam, ring.x, ring.y, ring.z);
      if (!p) continue;
      const r = ring.radius * p.s;
      if (r < 2 || p.x < -r - 80 || p.x > W + r + 80 || p.y < -r - 60 || p.y > H + r + 60) continue;
      const passed = ring.passed;
      const next = state.nextRing === ring.index;
      const pulse = next ? 1 + 0.08 * Math.sin(time * 5) : 1;
      ctx.save();
      ctx.lineWidth = Math.max(2, r * 0.09 * pulse);
      ctx.strokeStyle = passed ? css([120, 220, 120], 0.85) : css(PALETTE.ringGold);
      ctx.shadowColor = passed ? '#4caf50' : PALETTE.ringGlow;
      ctx.shadowBlur = next ? 26 : 12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, r * 0.02);
      ctx.strokeStyle = css([255, 255, 255], 0.7);
      ctx.setLineDash([r * 0.16, r * 0.12]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.82 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (r > 26) {
        ctx.fillStyle = css([255, 255, 255], 0.95);
        ctx.font = `bold ${Math.max(13, Math.min(26, r * 0.34))}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ring.index + 1), p.x, p.y - r - 14);
      }
      ctx.restore();
    }
    // A small marker over the next ring so the pilot always knows where to aim.
    const target = state.world.rings[state.nextRing];
    if (target && state.status === 'flying') {
      const p = this.project(cam, target.x, target.y, target.z);
      if (p && (p.x < 0 || p.x > W || p.y < 0 || p.y > H)) {
        const cx = clamp(p.x, 60, W - 60);
        const cy = clamp(p.y, 60, H - 60);
        ctx.fillStyle = css(PALETTE.ringGold);
        ctx.beginPath();
        ctx.moveTo(cx, cy - 12);
        ctx.lineTo(cx + 10, cy + 8);
        ctx.lineTo(cx - 10, cy + 8);
        ctx.closePath();
        ctx.fill();
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round((target.z - state.z) / 100) * 100} ft`, cx, cy + 26);
      }
    }
  }

  drawPlaneShadow(cam, state) {
    if (state.terrainClearance > 420 || state.status === 'parked') return;
    const ctx = this.ctx;
    const ground = terrainHeight(state.x, state.z + 30, state.world.seed);
    const p = this.project(cam, state.x, ground + 1, state.z + 30);
    if (!p) return;
    const alpha = (1 - state.terrainClearance / 420) * 0.32;
    ctx.fillStyle = css([20, 26, 20], alpha);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 46 * p.s + 8, 12 * p.s + 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPlane(state, time) {
    const ctx = this.ctx;
    const px = W / 2 + state.bank * 42;
    const py = H * 0.6 - state.pitch * 70;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.bank * 0.55);
    const flash = Math.floor(time * 2) % 2 === 0;
    // Wings: wide, slightly swept, orange with cream tips.
    ctx.fillStyle = css(PALETTE.planeOrange);
    ctx.beginPath();
    ctx.moveTo(-96, 10);
    ctx.lineTo(-22, -8);
    ctx.lineTo(22, -8);
    ctx.lineTo(96, 10);
    ctx.lineTo(88, 20);
    ctx.lineTo(-88, 20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css(PALETTE.planeCream);
    ctx.fillRect(-96, 8, 18, 12);
    ctx.fillRect(78, 8, 18, 12);
    // Fuselage: a capsule seen from behind-above, nose far (up), tail near (down).
    ctx.fillStyle = css(PALETTE.planeCream);
    ctx.beginPath();
    ctx.roundRect(-15, -78, 30, 128, 15);
    ctx.fill();
    ctx.fillStyle = css(PALETTE.planeOrange);
    ctx.fillRect(-15, -30, 30, 10);
    ctx.fillRect(-15, 6, 30, 6);
    // Cockpit windshield and the courier's roundel.
    ctx.fillStyle = css([38, 58, 84]);
    ctx.beginPath();
    ctx.ellipse(0, -56, 10, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(PALETTE.planeOrange);
    ctx.beginPath();
    ctx.arc(0, -12, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css([255, 255, 255]);
    ctx.beginPath();
    ctx.arc(0, -12, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Tailplane and fin.
    ctx.fillStyle = css(PALETTE.planeOrange);
    ctx.beginPath();
    ctx.moveTo(-46, 38);
    ctx.lineTo(-10, 30);
    ctx.lineTo(10, 30);
    ctx.lineTo(46, 38);
    ctx.lineTo(40, 48);
    ctx.lineTo(-40, 48);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, 34);
    ctx.lineTo(-9, 58);
    ctx.lineTo(9, 58);
    ctx.closePath();
    ctx.fill();
    // Spinning prop disc at the nose.
    ctx.fillStyle = css([220, 226, 232], 0.28);
    ctx.beginPath();
    ctx.ellipse(0, -80, 17, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = css([120, 126, 132], 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, -80, 17, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Navigation lights: red left, green right, white strobe at the tail.
    ctx.fillStyle = '#ff4d4d';
    ctx.beginPath();
    ctx.arc(-94, 14, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#37d67a';
    ctx.beginPath();
    ctx.arc(94, 14, 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (flash) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 56, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawHud(state, time) {
    const ctx = this.ctx;
    ctx.textBaseline = 'alphabetic';
    const headingDeg = ((state.heading * 180) / Math.PI % 360 + 360) % 360;
    // Compass tape across the top centre.
    ctx.fillStyle = css([10, 16, 24], 0.55);
    ctx.fillRect(W / 2 - 170, 10, 340, 30);
    ctx.strokeStyle = css([255, 255, 255], 0.5);
    ctx.strokeRect(W / 2 - 170, 10, 340, 30);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let d = -40; d <= 40; d += 10) {
      const deg = Math.round((headingDeg + d + 360) % 360);
      const x = W / 2 + d * 3.4;
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg);
      ctx.fillStyle = d === 0 ? css(PALETTE.ringGold) : css([255, 255, 255], 0.9);
      ctx.fillText(label, x, 30);
    }
    ctx.fillStyle = css(PALETTE.ringGold);
    ctx.beginPath();
    ctx.moveTo(W / 2, 40);
    ctx.lineTo(W / 2 - 6, 48);
    ctx.lineTo(W / 2 + 6, 48);
    ctx.closePath();
    ctx.fill();
    // Mission line under the compass.
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = css([255, 255, 255], 0.92);
    ctx.fillText(
      `RINGS ${state.ringsHit}/${RINGS.count}  •  LAND ON RUNWAY 27  •  ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`,
      W / 2,
      66,
    );
    this.drawTape(28, H / 2 - 70, 140, Math.round(state.y), 'ALT', 'ft', 100);
    this.drawTape(W - 28, H / 2 - 70, 140, Math.round(state.speed), 'SPD', 'kt', 20);
    // Score block, top right, on a dark backing so it reads against bright cloud.
    ctx.textAlign = 'right';
    ctx.fillStyle = css([10, 16, 24], 0.55);
    ctx.fillRect(W - 178, 10, 154, 54);
    ctx.strokeStyle = css([255, 255, 255], 0.35);
    ctx.strokeRect(W - 178, 10, 154, 54);
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE ${state.score}`, W - 24, 40);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = css([255, 255, 255], 0.85);
    ctx.fillText(`BEST ${this.best}`, W - 24, 60);
    // Fuel bar, bottom left.
    const fuelX = 24;
    const fuelY = H - 44;
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = state.fuel < 20 && Math.floor(time * 2) % 2 === 0 ? '#ff6b5e' : '#ffffff';
    ctx.fillText('FUEL', fuelX, fuelY - 8);
    ctx.fillStyle = css([10, 16, 24], 0.6);
    ctx.fillRect(fuelX, fuelY, 170, 14);
    ctx.fillStyle = state.fuel < 20 ? '#ff6b5e' : state.fuel < 45 ? '#ffb84d' : '#5fd35f';
    ctx.fillRect(fuelX + 1, fuelY + 1, 168 * clamp(state.fuel / 100, 0, 1), 12);
    ctx.strokeStyle = css([255, 255, 255], 0.6);
    ctx.strokeRect(fuelX, fuelY, 170, 14);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${Math.round(state.fuel)}%`, fuelX + 178, fuelY + 12);
    // Throttle lever, bottom right.
    const thX = W - 44;
    const thY0 = H - 110;
    ctx.fillStyle = css([10, 16, 24], 0.6);
    ctx.fillRect(thX - 9, thY0, 18, 80);
    ctx.fillStyle = css(PALETTE.ringGold);
    const leverY = thY0 + 80 - state.throttle * 74;
    ctx.fillRect(thX - 13, leverY - 4, 26, 8);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText('THR', thX - 16, thY0 + 44);
    ctx.fillText(`${Math.round(state.throttle * 100)}%`, thX - 16, thY0 + 60);
    // Attitude indicator, bottom centre.
    this.drawAttitude(state);
    // Centre reticle and flight-path marker.
    const cx = W / 2;
    const cy = H * 0.44;
    ctx.strokeStyle = css([255, 255, 255], 0.75);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx - 13, cy);
    ctx.moveTo(cx + 13, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy - 13);
    ctx.moveTo(cx, cy + 13);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();
    // Warnings.
    if (state.status === 'flying') {
      if (state.terrainClearance < 60 && state.verticalSpeed < -2) {
        this.flashText('PULL UP — TERRAIN', W / 2, 120, '#ff5a4d', time);
      } else if (state.fuel < 20) {
        this.flashText('LOW FUEL', W / 2, 120, '#ffb84d', time);
      } else if (state.speed < PLANE.stallSpeed) {
        this.flashText('STALL — ADD THROTTLE', W / 2, 120, '#ffb84d', time);
      }
    }
    // Floating score popups.
    ctx.textAlign = 'center';
    state.popups.forEach((popup, i) => {
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillStyle = popup.good ? css([120, 230, 130], popup.life) : css([255, 120, 100], popup.life);
      ctx.fillText(popup.text, W / 2, H * 0.34 - i * 30 - (1.6 - popup.life) * 40);
    });
  }

  drawTape(x, y, height, value, label, unit, step) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = css([10, 16, 24], 0.55);
    ctx.fillRect(x - 34, y, 68, height);
    ctx.strokeStyle = css([255, 255, 255], 0.45);
    ctx.strokeRect(x - 34, y, 68, height);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const centre = y + height / 2;
    const range = step * 3;
    const start = Math.floor((value - range) / step) * step;
    for (let v = start; v <= value + range; v += step) {
      const ty = centre - ((v - value) / step) * 18;
      if (ty < y + 8 || ty > y + height - 8) continue;
      ctx.fillStyle = css([255, 255, 255], 0.8);
      ctx.fillRect(x - 8, ty, 16, 1);
      ctx.fillText(String(v), x, ty - 4);
    }
    ctx.fillStyle = css(PALETTE.ringGold);
    ctx.fillRect(x - 34, centre - 11, 68, 22);
    ctx.fillStyle = '#10151c';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(String(value), x, centre + 5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(`${label} ${unit}`, x, y - 8);
    ctx.restore();
  }

  drawAttitude(state) {
    const ctx = this.ctx;
    const cx = W / 2;
    const cy = H - 52;
    const r = 34;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-state.bank);
    const pitchPx = clamp(state.pitch * 90, -r, r);
    ctx.fillStyle = '#5fa8dd';
    ctx.fillRect(-r, -r + pitchPx - r, r * 2, r * 2);
    ctx.fillStyle = '#8a6b46';
    ctx.fillRect(-r, pitchPx, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r, pitchPx - 1, r * 2, 2);
    ctx.restore();
    ctx.strokeStyle = css([255, 255, 255], 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 12, cy + 4);
    ctx.lineTo(cx + 12, cy + 4);
    ctx.closePath();
    ctx.fill();
  }

  flashText(text, x, y, color, time) {
    if (Math.floor(time * 2.4) % 2 === 1) return;
    const ctx = this.ctx;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  drawPanel(title, lines, accent) {
    const ctx = this.ctx;
    const pw = 560;
    const ph = 150 + lines.length * 30;
    const px = (W - pw) / 2;
    const py = (H - ph) / 2 - 80; // up a little, so the parked plane shows beneath it
    ctx.fillStyle = css([8, 14, 22], 0.78);
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 14);
    ctx.fill();
    ctx.strokeStyle = css(accent, 0.9);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = css(accent);
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(title, W / 2, py + 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = '17px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, W / 2, py + 96 + i * 30));
  }

  /** One full frame. `screen` is title | flying | paused | over. */
  render(state, screen, time, best = 0) {
    const ctx = this.ctx;
    this.best = best;
    const cam = {
      x: state.x * 0.85,
      y: state.y + 16,
      z: state.z - 95,
    };
    this.horizonY = H * 0.44 - state.pitch * 260;
    ctx.clearRect(0, 0, W, H);
    this.drawSky(cam, time);
    this.drawClouds(cam, state);
    this.drawGround(cam, state);
    this.drawTrees(cam, state);
    this.drawRings(cam, state, time);
    this.drawPlaneShadow(cam, state);
    if (state.status !== 'parked' || screen === 'title') this.drawPlane(state, time);
    if (screen === 'flying' || screen === 'paused') this.drawHud(state, time);

    if (screen === 'title') {
      ctx.fillStyle = css([8, 14, 22], 0.35);
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 18;
      ctx.fillText('SKY COURIER', W / 2, H * 0.22);
      ctx.font = 'bold 30px system-ui, sans-serif';
      ctx.fillStyle = css(PALETTE.ringGold);
      ctx.fillText('— VALLEY RUN —', W / 2, H * 0.22 + 44);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('Fly the courier plane through all 10 golden rings,', W / 2, H * 0.22 + 92);
      ctx.fillText('then bring her home on runway 27 — before the fuel runs out.', W / 2, H * 0.22 + 118);
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillStyle = css([255, 255, 255], 0.85);
      ctx.fillText('↑ ↓ pitch   ← → bank   W / S throttle   drag with mouse or finger', W / 2, H * 0.22 + 158);
      if (Math.floor(time * 1.6) % 2 === 0) {
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.fillStyle = css(PALETTE.ringGold);
        ctx.fillText('PRESS ENTER OR CLICK TO FLY', W / 2, H * 0.22 + 208);
      }
      if (best > 0) {
        ctx.font = '15px system-ui, sans-serif';
        ctx.fillStyle = css([255, 255, 255], 0.8);
        ctx.fillText(`Best score: ${best}`, W / 2, H * 0.22 + 238);
      }
    } else if (screen === 'paused') {
      this.drawPanel('PAUSED', ['Press P to keep flying.'], PALETTE.ringGold);
    } else if (screen === 'over') {
      if (state.status === 'landed') {
        this.drawPanel('MISSION COMPLETE!', [
          state.landingRating,
          `Score ${state.score}  •  Rings ${state.ringsHit}/${RINGS.count}  •  Time ${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`,
          `Fuel left ${Math.round(state.fuel)}%`,
          'Press R to fly again.',
        ], [120, 220, 120]);
      } else {
        this.drawPanel('CRASHED', [
          state.cause,
          `Score ${state.score}  •  Rings ${state.ringsHit}/${RINGS.count}`,
          'Press R to try again.',
        ], [255, 90, 77]);
      }
    }
  }
}
