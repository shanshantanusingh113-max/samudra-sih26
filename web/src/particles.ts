/**
 * Current flow as moving dots with fading trails, instead of arrows.
 *
 * An arrow tells you the direction in one cell. A few thousand dots carried by the same field
 * tell you where the water is *going* across the whole basin, and a viewer who has never read a
 * vector plot reads it immediately. That is the "science communication" half of PS 26067 - the
 * one paragraph the build answered with a single tour - drawn rather than written.
 *
 * **Three things this is not, and each of them is a rule.**
 *
 * It is not a trajectory. Every dot moves through **one** analysis, frozen at the Timestep on
 * screen, so the picture is the flow at that instant and not where anything would end up over
 * days. `drift.ts` is the one that runs time forward, has a published error - median 38.5 km
 * over one Argo cycle - and is what the drift pin uses. The guide entry says which is which,
 * because a reader who thinks they are watching a forecast is being misled by a pretty picture.
 *
 * It is not a second integrator. The step rule is `midpointStep` in `drift.ts` and the sampler
 * is `sample` in `drift.ts` - the same two functions the scored drift model runs on. This
 * project has been bitten once by a second copy of a curve that quietly disagreed with the
 * first, so the picture and the measurement share their arithmetic and `web/probe-particles.mjs`
 * fails if a particle and an `integrateDrift` path from the same start point diverge.
 *
 * It is not finer than the data. The field is INCOIS's 1 degree lattice, about 110 km a cell,
 * so this draws the Somali Current, the monsoon gyre and the equatorial jets and draws **no
 * eddies at all** - every swirl in a 1/12 degree rendering of the same water is smaller than one
 * of our cells. Baking a finer field purely for the animation was considered and refused: the
 * picture would then be more detailed than every number the platform reports.
 *
 * Everything here reads the **Grid** - float32 (u, v) on the model's own Levels - never a Volume.
 */

import { midpointStep, sample, type VelocityLookup } from "./drift";
import type { VectorField, VolumeSpec } from "./types";

/**
 * How fast the movie runs: seconds of ocean per second of screen.
 *
 * A current is slow. Half a metre a second over one frame is eight millimetres, which is
 * nothing on a map 6,000 km across, so any particle animation - ours, Copernicus's,
 * earth.nullschool's - speeds the clock up. At this rate a 0.3 m/s current draws about three
 * degrees a second and a trail about half a degree long, which is what makes a flow line
 * readable without turning the screen into static.
 *
 * The **relative** speeds are untouched: a current twice as fast moves twice as far, and the
 * dot's colour comes from the same palette and the same `transfer` curve as the arrows. What is
 * scaled is the clock, and only the clock.
 */
const OCEAN_SECONDS_PER_SECOND = 1_100_000;

/** Positions kept per particle. The trail is the last few, drawn with the tail faded out. */
const TRAIL = 20;

/**
 * How long a dot lives, in seconds of screen time, before it is dropped and re-seeded.
 *
 * Without this the picture goes bald. A velocity field has convergence zones, and every dot
 * eventually drains into one: after twenty seconds the open ocean is empty and the flow lines
 * are three bright knots. Ages are staggered at birth so the whole population does not blink at
 * once.
 */
const LIFE_SECONDS = 5.5;
const LIFE_JITTER = 3.5;

/** Tries at finding water before a particle is left dormant for a frame. */
const SEED_ATTEMPTS = 12;

/** Frames are clamped before they are integrated: a tab that was in the background for a minute
 * must not teleport every dot across the basin. */
const MAX_FRAME_SECONDS = 1 / 20;

export interface ParticleGeometry {
  /** Two floats a vertex: longitude and latitude. Two vertices a segment. */
  lonLat: Float32Array;
  /** Four floats a vertex: r, g, b, alpha. The tail fades along the trail. */
  tint: Float32Array;
  /** How many vertices of the arrays above are live this frame. */
  vertices: number;
}

/**
 * A population of dots drifting through one frozen current field.
 *
 * The caller owns the field: `setField` is called whenever the Timestep, the depth or the
 * loaded vectors change, and everything re-seeds. Advancing and drawing are separate calls
 * because the scene's render loop runs continuously while geometry is only rebuilt when
 * something changed - see the frame-pair rule in `CLAUDE.md`.
 */
export class ParticleFlow {
  private count: number;
  private lon: Float32Array;
  private lat: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  /** Ring of past positions per particle: TRAIL + 1 entries of (lon, lat). */
  private trail: Float32Array;
  /** How many of a particle's trail slots hold a real position yet. */
  private filled: Uint8Array;
  /** Where the newest position sits in each particle's ring. */
  private head: Uint8Array;

  private field: VectorField | null = null;
  private volume: VolumeSpec | null = null;
  private velocity: VelocityLookup = () => null;

  private lonLat: Float32Array;
  private tint: Float32Array;

  constructor(count: number) {
    this.count = Math.max(1, Math.round(count));
    this.lon = new Float32Array(this.count);
    this.lat = new Float32Array(this.count);
    this.age = new Float32Array(this.count);
    this.life = new Float32Array(this.count);
    this.trail = new Float32Array(this.count * (TRAIL + 1) * 2);
    this.filled = new Uint8Array(this.count);
    this.head = new Uint8Array(this.count);
    // Two vertices a segment, TRAIL segments a particle.
    this.lonLat = new Float32Array(this.count * TRAIL * 2 * 2);
    this.tint = new Float32Array(this.count * TRAIL * 2 * 4);
  }

  /** How many dots this population holds. */
  get size(): number {
    return this.count;
  }

  /**
   * Point the population at one Timestep's field, at one Level, and scatter it.
   *
   * Re-seeding rather than carrying positions over is deliberate: the depth control moves the
   * dots to a different current, and a trail drawn half at 5 m and half at 1000 m would be a
   * line no water ever took.
   */
  setField(field: VectorField, volume: VolumeSpec, level: number): void {
    this.field = field;
    this.volume = volume;
    this.velocity = (lon, lat) => sample(field, volume, level, lon, lat);
    for (let i = 0; i < this.count; i++) this.seed(i, true);
  }

  /** Whether there is a field to move through at all. */
  get ready(): boolean {
    return this.field !== null && this.volume !== null;
  }

  /**
   * Move every dot one frame.
   *
   * `seconds` is real wall-clock time, clamped. A dot that cannot be stepped - it reached land,
   * or the edge of the grid - is re-seeded immediately rather than being left to pile up on the
   * coast, which is what draws the white streaks across Gujarat that a naive version produces.
   */
  advance(seconds: number): void {
    if (!this.ready) return;
    const dt = Math.min(Math.max(seconds, 0), MAX_FRAME_SECONDS);
    if (dt <= 0) return;
    const oceanSeconds = dt * OCEAN_SECONDS_PER_SECOND;

    for (let i = 0; i < this.count; i++) {
      this.age[i] = (this.age[i] ?? 0) + dt;
      if ((this.age[i] ?? 0) > (this.life[i] ?? 0)) {
        this.seed(i, false);
        continue;
      }
      const next = midpointStep(
        this.velocity,
        this.lon[i] ?? 0,
        this.lat[i] ?? 0,
        0,
        oceanSeconds,
      );
      if (!next) {
        this.seed(i, false);
        continue;
      }
      this.lon[i] = next.lon;
      this.lat[i] = next.lat;
      this.push(i, next.lon, next.lat);
    }
  }

  /**
   * The trails as line segments, coloured by a caller that owns the palette.
   *
   * `colourAt` is handed the speed in m/s at the dot's own position and returns the colour the
   * arrows would have used, so the two styles of this one layer cannot disagree with each other
   * or with the colourbar. Returning null - a speed outside the Transfer Function window - drops
   * that trail, exactly as it drops an arrow.
   */
  build(colourAt: (speed: number, lon: number, lat: number) => [number, number, number] | null): ParticleGeometry {
    let at = 0;
    let tintAt = 0;
    if (!this.ready) return { lonLat: this.lonLat, tint: this.tint, vertices: 0 };

    for (let i = 0; i < this.count; i++) {
      const held = this.filled[i] ?? 0;
      if (held < 2) continue;

      const lon = this.lon[i] ?? 0;
      const lat = this.lat[i] ?? 0;
      const here = this.velocity(lon, lat, 0);
      if (!here) continue;
      const colour = colourAt(Math.hypot(here[0], here[1]), lon, lat);
      if (!colour) continue;

      // Fade the whole dot in as it is born and out as it dies, so nothing pops.
      const age = this.age[i] ?? 0;
      const life = this.life[i] ?? 1;
      const fade = Math.min(1, Math.min(age, Math.max(life - age, 0)) / 0.6);

      const ring = i * (TRAIL + 1) * 2;
      const head = this.head[i] ?? 0;
      for (let step = 0; step < held - 1; step++) {
        const newer = (head - step + TRAIL + 1) % (TRAIL + 1);
        const older = (newer - 1 + TRAIL + 1) % (TRAIL + 1);
        // The tail is dimmest. `step` counts back from the head, so this runs 1 to nearly 0.
        const head_alpha = fade * (1 - step / TRAIL);
        const tail_alpha = fade * (1 - (step + 1) / TRAIL);

        this.lonLat[at++] = this.trail[ring + newer * 2] ?? 0;
        this.lonLat[at++] = this.trail[ring + newer * 2 + 1] ?? 0;
        this.lonLat[at++] = this.trail[ring + older * 2] ?? 0;
        this.lonLat[at++] = this.trail[ring + older * 2 + 1] ?? 0;

        for (const alpha of [head_alpha, tail_alpha]) {
          this.tint[tintAt++] = colour[0] / 255;
          this.tint[tintAt++] = colour[1] / 255;
          this.tint[tintAt++] = colour[2] / 255;
          this.tint[tintAt++] = alpha;
        }
      }
    }

    return { lonLat: this.lonLat, tint: this.tint, vertices: at / 2 };
  }

  /** A dot's position now, for a probe to follow. */
  positionOf(index: number): { lon: number; lat: number } {
    return { lon: this.lon[index] ?? 0, lat: this.lat[index] ?? 0 };
  }

  /**
   * Put one dot at a known place and stop it ageing, so a probe can follow it.
   *
   * `web/probe-particles.mjs` runs a single particle from a drift pin's start point and fails if
   * the two land in different water. It needs the particle to survive the run, which a normal
   * one does not: ages are staggered at birth and a dot is re-seeded when its life runs out.
   */
  placeForTest(index: number, lon: number, lat: number): void {
    this.lon[index] = lon;
    this.lat[index] = lat;
    this.age[index] = 0;
    this.life[index] = Number.POSITIVE_INFINITY;
    this.filled[index] = 1;
    this.head[index] = 0;
    const ring = index * (TRAIL + 1) * 2;
    this.trail[ring] = lon;
    this.trail[ring + 1] = lat;
  }

  /** Put one particle somewhere in the water, with an empty trail. */
  private seed(index: number, stagger: boolean): void {
    const volume = this.volume;
    if (!volume) return;
    for (let attempt = 0; attempt < SEED_ATTEMPTS; attempt++) {
      const lon = volume.west + Math.random() * (volume.east - volume.west);
      const lat = volume.south + Math.random() * (volume.north - volume.south);
      if (!this.velocity(lon, lat, 0)) continue;
      this.lon[index] = lon;
      this.lat[index] = lat;
      this.life[index] = LIFE_SECONDS + Math.random() * LIFE_JITTER;
      // At the first scatter the whole population would otherwise die on the same frame.
      this.age[index] = stagger ? Math.random() * (this.life[index] ?? 0) : 0;
      this.filled[index] = 1;
      this.head[index] = 0;
      const ring = index * (TRAIL + 1) * 2;
      this.trail[ring] = lon;
      this.trail[ring + 1] = lat;
      return;
    }
    // Every attempt landed on land. Leave it dormant this frame; it is retried on the next.
    this.filled[index] = 0;
    this.age[index] = 0;
    this.life[index] = LIFE_SECONDS;
  }

  /** Append one position to a particle's ring buffer. */
  private push(index: number, lon: number, lat: number): void {
    const head = ((this.head[index] ?? 0) + 1) % (TRAIL + 1);
    this.head[index] = head;
    const ring = index * (TRAIL + 1) * 2;
    this.trail[ring + head * 2] = lon;
    this.trail[ring + head * 2 + 1] = lat;
    this.filled[index] = Math.min((this.filled[index] ?? 0) + 1, TRAIL + 1);
  }
}

/**
 * How far a dot moves in one second of screen time, in kilometres, for a given current.
 *
 * Not used by the renderer. It exists so the guide entry and the probe can both state the clock
 * rate from the same constant rather than quoting a number typed into prose - the trap that had
 * four figures on the guide panel stale since August.
 */
export function screenKmPerSecond(metresPerSecond: number): number {
  return (metresPerSecond * OCEAN_SECONDS_PER_SECOND) / 1000;
}

/** Ocean time per second of animation, in days. The honest way to say "sped up". */
export function speedUpDays(): number {
  return OCEAN_SECONDS_PER_SECOND / 86400;
}

/** The clock rate itself, so a probe can integrate the same elapsed ocean time. */
export function oceanSecondsPerSecond(): number {
  return OCEAN_SECONDS_PER_SECOND;
}
