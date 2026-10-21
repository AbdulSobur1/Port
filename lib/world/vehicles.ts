/**
 * Data-driven vehicle catalogue.
 *
 * ## Honesty
 *
 * No third-party 3D vehicle model is bundled. The freely licensed models that
 * fit the brief could not be verified for provenance and redistribution in this
 * build, and labelling a generic body as a specific Bugatti, BMW or Koenigsegg
 * would be false. Every drivable car here is therefore an **original Soburr
 * design**, modelled procedurally in `components/world/car.tsx`, with fictional
 * make/model names. The requested marques are listed separately as
 * `UNAVAILABLE_MARQUES` with the reason, and the selection UI shows them as
 * unavailable rather than pretending otherwise.
 *
 * ## Specifications
 *
 * The figures below are game-tuned estimates, not manufacturer data. They are
 * internally consistent (power, mass, acceleration and braking are in the same
 * order of magnitude) and every card says so. `specSource` travels with each
 * entry so a future licensed dataset can replace one record at a time.
 *
 * ## One physics model, many cars
 *
 * `physicsFor()` maps a catalogue entry onto the `VehiclePhysics` consumed by
 * `lib/world/vehicle.ts`. Mass changes collision response, grip changes yaw
 * rate, power/0–100 changes engine acceleration, brake decel changes stopping
 * distance, dimensions change the collision circles, and wheelbase changes the
 * turning circle. Top speed is deliberately *street-limited*: a 310 km/h car
 * and a 210 km/h car still differ in this 560 m neighbourhood, but neither is
 * allowed to reach a speed at which the street becomes unusable.
 */

export type BodyStyle = 'sedan' | 'coupe' | 'suv' | 'hatch' | 'van';
export type Drivetrain = 'FWD' | 'RWD' | 'AWD';

export type VehiclePhysics = {
  wheelBase: number;
  trackWidth: number;
  length: number;
  width: number;
  maxSteer: number;
  steerRate: number;
  steerReturn: number;
  /** Simulated top speed, m/s (street-limited). */
  maxSpeed: number;
  maxReverse: number;
  /** Peak longitudinal acceleration at low speed, m/s². */
  engine: number;
  brakeDecel: number;
  rolling: number;
  drag: number;
  circleOffset: number;
  circleRadius: number;
  /** Kilograms; heavier cars keep more speed in a collision. */
  mass: number;
  /** 1.0 = neutral; >1 turns in more eagerly, <1 understeers. */
  grip: number;
};

export type VehicleDefinition = {
  id: string;
  make: string;
  model: string;
  year: number;
  trim: string;
  category: 'Compact' | 'Saloon' | 'SUV' | 'Coupé' | 'Electric' | 'Utility';
  body: BodyStyle;
  drivetrain: Drivetrain;
  seats: number;
  paint: { base: string; accent: string; caliper: string };
  /** Real-world dimensions in metres, used by the renderer and collision. */
  dimensions: { length: number; width: number; height: number; wheelbase: number; wheelRadius: number };
  /** Figures shown in the UI. Every entry is an estimate, labelled as such. */
  specs: {
    powerKw: number;
    torqueNm: number;
    massKg: number;
    zeroTo100: number;
    topSpeedKmh: number;
    /** Simulated, street-limited top speed shown next to the real figure. */
    inWorldTopSpeedKmh: number;
  };
  specSource: string;
  /** How the body was authored and under what terms. */
  modelAsset: { kind: 'procedural'; licence: string; note: string };
  blurb: string;
};

export const SPEC_SOURCE =
  'Soburr game-tuned estimate (not manufacturer data). Units: kW, Nm, kg, seconds, km/h.';

const PROCEDURAL_MODEL = {
  kind: 'procedural' as const,
  licence: 'Original geometry created for this project; no third-party model licence.',
  note: 'Body authored from scratch for Soburr. Not a replica of any production vehicle.',
};

/** Street-limited top speed: keeps differences without making a 560 m street undrivable. */
function worldTopSpeed(topSpeedKmh: number): number {
  return Math.max(24, Math.min(37, 24 + (topSpeedKmh - 150) * 0.038));
}

function physicsFrom(v: VehicleDefinition): VehiclePhysics {
  const { dimensions, specs, drivetrain } = v;
  const driveFactor = drivetrain === 'AWD' ? 1.12 : drivetrain === 'RWD' ? 1.0 : 0.94;
  return {
    wheelBase: dimensions.wheelbase,
    trackWidth: dimensions.width * 0.86,
    length: dimensions.length,
    width: dimensions.width,
    maxSteer: v.body === 'van' ? 0.46 : v.body === 'suv' ? 0.5 : 0.58,
    steerRate: v.body === 'van' ? 2.6 : 3.2,
    steerReturn: 4.8,
    maxSpeed: worldTopSpeed(specs.topSpeedKmh),
    maxReverse: v.body === 'van' ? 5.5 : 6.5,
    // 0–100 is the anchor, lifted into an arcade acceleration curve. The
    // previous 0.72 factor could not overcome rolling resistance, so the HUD
    // promised 210 km/h and the car topped out around 50. The 0.35 floor in
    // the engine curve (vehicle.ts) then lets it actually reach maxSpeed.
    engine: Math.max(3.8, (27.8 / Math.max(2.5, specs.zeroTo100)) * 2.0 * driveFactor),
    brakeDecel: Math.max(8.5, Math.min(14.5, 15.5 - specs.massKg / 460)),
    rolling: 0.9 + specs.massKg / 6000,
    drag: 0.0016 + (v.body === 'van' ? 0.0006 : 0),
    circleOffset: Math.max(1.1, dimensions.wheelbase / 2 - 0.12),
    circleRadius: Math.max(0.86, dimensions.width / 2 + 0.06),
    mass: specs.massKg,
    grip: v.body === 'van' ? 0.86 : v.body === 'suv' ? 0.92 : v.body === 'coupe' ? 1.08 : 1.0,
  };
}

export const VEHICLES: VehicleDefinition[] = [
  {
    id: 'kestrel',
    make: 'Soburr',
    model: 'Kestrel',
    year: 2024,
    trim: '1.6 Drive',
    category: 'Compact',
    body: 'hatch',
    drivetrain: 'FWD',
    seats: 5,
    paint: { base: '#d8f851', accent: '#20262a', caliper: '#a9b831' },
    dimensions: { length: 4.12, width: 1.78, height: 1.46, wheelbase: 2.58, wheelRadius: 0.32 },
    specs: { powerKw: 118, torqueNm: 250, massKg: 1290, zeroTo100: 8.6, topSpeedKmh: 210, inWorldTopSpeedKmh: 94.6 },
    specSource: SPEC_SOURCE,
    modelAsset: PROCEDURAL_MODEL,
    blurb: 'Light, front-driven and easy to place in tight Lagos traffic. The default if you just want to drive.',
  },
  {
    id: 'meridian',
    make: 'Soburr',
    model: 'Meridian',
    year: 2023,
    trim: '300 Executive',
    category: 'Saloon',
    body: 'sedan',
    drivetrain: 'RWD',
    seats: 5,
    paint: { base: '#8fa7ad', accent: '#0f1718', caliper: '#c4cbc9' },
    dimensions: { length: 4.78, width: 1.88, height: 1.47, wheelbase: 2.92, wheelRadius: 0.35 },
    specs: { powerKw: 190, torqueNm: 400, massKg: 1660, zeroTo100: 6.3, topSpeedKmh: 250, inWorldTopSpeedKmh: 100.1 },
    specSource: SPEC_SOURCE,
    modelAsset: PROCEDURAL_MODEL,
    blurb: 'A rear-driven saloon with a long wheelbase: stable at speed, wide turning circle in the side streets.',
  },
  {
    id: 'okapi',
    make: 'Soburr',
    model: 'Okapi',
    year: 2025,
    trim: 'X7 All-Terrain',
    category: 'SUV',
    body: 'suv',
    drivetrain: 'AWD',
    seats: 7,
    paint: { base: '#5d6b5c', accent: '#151b18', caliper: '#8d9789' },
    dimensions: { length: 4.96, width: 1.98, height: 1.82, wheelbase: 2.98, wheelRadius: 0.4 },
    specs: { powerKw: 210, torqueNm: 450, massKg: 2140, zeroTo100: 7.4, topSpeedKmh: 220, inWorldTopSpeedKmh: 96.0 },
    specSource: SPEC_SOURCE,
    modelAsset: PROCEDURAL_MODEL,
    blurb: 'High seating, all-wheel drive and more mass: it shrugs off kerbs but takes longer to stop.',
  },
  {
    id: 'lagos-gt',
    make: 'Soburr',
    model: 'Lagos GT',
    year: 2025,
    trim: 'RS',
    category: 'Coupé',
    body: 'coupe',
    drivetrain: 'RWD',
    seats: 2,
    paint: { base: '#ffb467', accent: '#141819', caliper: '#ff7863' },
    dimensions: { length: 4.52, width: 1.92, height: 1.28, wheelbase: 2.7, wheelRadius: 0.36 },
    specs: { powerKw: 285, torqueNm: 480, massKg: 1490, zeroTo100: 4.5, topSpeedKmh: 285, inWorldTopSpeedKmh: 104.9 },
    specSource: SPEC_SOURCE,
    modelAsset: PROCEDURAL_MODEL,
    blurb: 'Low, wide and rear-driven. Sharper turn-in, shorter gearing and much less tolerance for a late brake.',
  },
  {
    id: 'volt',
    make: 'Soburr',
    model: 'Volt',
    year: 2026,
    trim: 'Dual Motor',
    category: 'Electric',
    body: 'sedan',
    drivetrain: 'AWD',
    seats: 5,
    paint: { base: '#6de0dd', accent: '#0d1a1b', caliper: '#39a9a6' },
    dimensions: { length: 4.9, width: 1.93, height: 1.45, wheelbase: 2.96, wheelRadius: 0.36 },
    specs: { powerKw: 340, torqueNm: 660, massKg: 2030, zeroTo100: 4.1, topSpeedKmh: 250, inWorldTopSpeedKmh: 100.1 },
    specSource: SPEC_SOURCE,
    modelAsset: PROCEDURAL_MODEL,
    blurb: 'Instant torque and a heavy battery pack. The quickest car here to 100 km/h and the hardest on its brakes.',
  },
  {
    id: 'kano',
    make: 'Soburr',
    model: 'Kano',
    year: 2022,
    trim: 'Panel Van',
    category: 'Utility',
    body: 'van',
    drivetrain: 'FWD',
    seats: 2,
    paint: { base: '#cdd5ce', accent: '#1a2324', caliper: '#8c9691' },
    dimensions: { length: 5.35, width: 2.0, height: 2.25, wheelbase: 3.2, wheelRadius: 0.38 },
    specs: { powerKw: 110, torqueNm: 350, massKg: 2210, zeroTo100: 11.4, topSpeedKmh: 165, inWorldTopSpeedKmh: 88.5 },
    specSource: SPEC_SOURCE,
    modelAsset: PROCEDURAL_MODEL,
    blurb: 'Tall, long and slow to change direction. It behaves like a van: plan the corner before you reach it.',
  },
];

export const DEFAULT_VEHICLE_ID = 'kestrel';

export function vehicleById(id: string | null | undefined): VehicleDefinition {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
}

export function physicsById(id: string | null | undefined): VehiclePhysics {
  return physicsFrom(vehicleById(id));
}

/** Kept for the vehicle tests and any caller that has no selection yet. */
export function physicsFor(v: VehicleDefinition): VehiclePhysics {
  return physicsFrom(v);
}

/**
 * Marques the brief asked for that are **not** represented as drivable cars.
 * Listed in the UI so the absence is explicit rather than silently pretending
 * a generic car is an Audi or a Bugatti.
 */
export const UNAVAILABLE_MARQUES: { make: string; reason: string }[] = [
  { make: 'Audi', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'BMW', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Toyota', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Honda', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Lexus', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Mercedes-Benz', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Porsche', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Ferrari', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Lamborghini', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'McLaren', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Koenigsegg', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Bugatti', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Apollo', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Aston Martin', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Nissan', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Tesla', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Ford', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Chevrolet', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Hyundai', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Kia', reason: 'No licensed, provenance-checked 3D model bundled.' },
  { make: 'Volkswagen', reason: 'No licensed, provenance-checked 3D model bundled.' },
];
