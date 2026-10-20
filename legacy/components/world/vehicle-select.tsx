'use client';

import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  SPEC_SOURCE,
  UNAVAILABLE_MARQUES,
  VEHICLES,
  vehicleById,
} from '@/lib/world/vehicles';
import { CarModel } from './car';
import { chooseVehicle, setUi, storedVehicleId, useUi } from './store';

/**
 * First-run vehicle chooser and the "change car" screen.
 *
 * The catalogue is data, the preview is the same procedurally authored body the
 * player will drive, and the specification panel says plainly that the numbers
 * are game-tuned estimates. The marques the brief named but that have no
 * licensed model appear in a separate list with the reason, rather than being
 * faked with an original car wearing a famous badge.
 */
export function VehicleSelect() {
  const { vehicleSelect, vehicleId } = useUi();
  const [choice, setChoice] = useState(vehicleId);
  const [tab, setTab] = useState<'garage' | 'marques'>('garage');

  const vehicle = useMemo(() => vehicleById(choice), [choice]);
  const isCurrent = vehicle.id === vehicleId;
  const canDismiss = Boolean(storedVehicleId());

  if (!vehicleSelect) return null;

  const choose = () => chooseVehicle(vehicle.id);

  return (
    <div className="car-select" role="dialog" aria-modal="true" aria-labelledby="car-select-title">
      <header className="car-select__head">
        <div>
          <p className="dossier__eyebrow">Soburr / garage</p>
          <h1 id="car-select-title">Choose the car you will drive.</h1>
        </div>
        {canDismiss && (
          <button className="car-select__close" onClick={() => setUi({ vehicleSelect: false })} aria-label="Close vehicle selection">
            ✕
          </button>
        )}
      </header>

      <div className="car-select__tabs" role="tablist" aria-label="Vehicle catalogue views">
        <button
          role="tab"
          aria-selected={tab === 'garage'}
          className={tab === 'garage' ? 'is-active' : ''}
          onClick={() => setTab('garage')}
        >
          Garage <span>{VEHICLES.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'marques'}
          className={tab === 'marques' ? 'is-active' : ''}
          onClick={() => setTab('marques')}
        >
          Requested marques <span>{UNAVAILABLE_MARQUES.length}</span>
        </button>
      </div>

      {tab === 'garage' ? (
        <div className="car-select__grid">
          <ol className="car-list" aria-label="Available cars">
            {VEHICLES.map((v) => {
              const active = v.id === vehicle.id;
              return (
                <li key={v.id}>
                  <button
                    className={`car-list__item ${active ? 'is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setChoice(v.id)}
                    style={{ ['--car-accent' as string]: v.paint.base }}
                  >
                    <span className="car-list__swatch" />
                    <span className="car-list__text">
                      <strong>
                        {v.make} {v.model}
                      </strong>
                      <small>
                        {v.year} · {v.trim} · {v.drivetrain}
                      </small>
                      <span className="car-list__quick">
                        {v.specs.powerKw} kW · 0–100 {v.specs.zeroTo100.toFixed(1)} s
                      </span>
                    </span>
                    {v.id === vehicleId && <span className="car-list__current">Current</span>}
                  </button>
                </li>
              );
            })}
          </ol>

          <section className="car-preview" aria-label={`${vehicle.make} ${vehicle.model} preview`}>
            <div className="car-preview__stage">
              <Canvas
                dpr={[1, 1.7]}
                shadows
                camera={{ position: [5.6, 2.35, 7.2], fov: 34, near: 0.1, far: 60 }}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
                onCreated={({ gl, scene }) => {
                  gl.toneMapping = THREE.ACESFilmicToneMapping;
                  gl.toneMappingExposure = 1.05;
                  scene.background = new THREE.Color('#101a1a');
                  scene.environmentIntensity = 0.9;
                }}
              >
                <hemisphereLight args={['#d8e8ee', '#30372f', 1.1]} />
                <directionalLight position={[6, 9, 4]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} />
                <directionalLight position={[-5, 3, -6]} intensity={0.7} color="#9fc4c8" />
                <group position={[0, -0.02, 0]}>
                  <CarModel vehicle={vehicle} />
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                    <circleGeometry args={[6, 64]} />
                    <meshStandardMaterial color="#182322" roughness={0.86} metalness={0.1} />
                  </mesh>
                  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
                    <ringGeometry args={[3.1, 3.16, 64]} />
                    <meshBasicMaterial color={vehicle.paint.base} transparent opacity={0.7} />
                  </mesh>
                </group>
                <OrbitControls
                  makeDefault
                  target={[0, 0.72, 0]}
                  enablePan={false}
                  minDistance={4.6}
                  maxDistance={12}
                  minPolarAngle={0.18}
                  maxPolarAngle={Math.PI / 2.08}
                  autoRotate
                  autoRotateSpeed={0.55}
                />
              </Canvas>
              <p className="car-preview__hint">Drag to inspect · scroll to zoom</p>
            </div>
            <div className="car-preview__id">
              <p>{vehicle.make}</p>
              <h2>
                {vehicle.model} <span>{vehicle.trim}</span>
              </h2>
              <p className="car-preview__meta">
                {vehicle.year} · {vehicle.category} · {vehicle.drivetrain} · {vehicle.seats} seats
              </p>
              <p className="car-preview__blurb">{vehicle.blurb}</p>
            </div>
          </section>

          <aside className="car-specs" aria-label="Specifications">
            <h3>Specifications</h3>
            <dl>
              <div><dt>Power</dt><dd>{vehicle.specs.powerKw} kW</dd></div>
              <div><dt>Torque</dt><dd>{vehicle.specs.torqueNm} Nm</dd></div>
              <div><dt>Mass</dt><dd>{vehicle.specs.massKg} kg</dd></div>
              <div><dt>0–100 km/h</dt><dd>{vehicle.specs.zeroTo100.toFixed(1)} s</dd></div>
              <div><dt>Top speed</dt><dd>{vehicle.specs.topSpeedKmh} km/h</dd></div>
              <div>
                <dt>In-world limit</dt>
                <dd>{Math.round(vehicle.specs.inWorldTopSpeedKmh)} km/h</dd>
              </div>
              <div><dt>Drivetrain</dt><dd>{vehicle.drivetrain}</dd></div>
              <div><dt>Wheelbase</dt><dd>{vehicle.dimensions.wheelbase.toFixed(2)} m</dd></div>
            </dl>
            <p className="car-specs__note">{SPEC_SOURCE}</p>
            <p className="car-specs__note">
              The street is 561 × 565 m, so simulated top speed is deliberately lower than the
              quoted figure. Differences in mass, power, grip, brakes and wheelbase still change how
              the car drives.
            </p>
            <p className="car-specs__model">{vehicle.modelAsset.note}</p>
            <p className="car-specs__model">{vehicle.modelAsset.licence}</p>
            <button className="world-button world-button--primary car-specs__cta" onClick={choose}>
              {isCurrent ? 'Drive this car' : `Drive the ${vehicle.model}`}
            </button>
          </aside>
        </div>
      ) : (
        <div className="marques">
          <p className="marques__intro">
            The brief named these marques as examples. None has a licensed, provenance-checked 3D
            model bundled with this project, so none is drivable. They are listed here rather than
            relabelled onto a generic body.
          </p>
          <ul>
            {UNAVAILABLE_MARQUES.map((m) => (
              <li key={m.make}>
                <strong>{m.make}</strong>
                <span>Unavailable</span>
                <small>{m.reason}</small>
              </li>
            ))}
          </ul>
          <p className="marques__note">
            Adding one is a data change, not a rewrite: add a catalogue entry with a verified model
            URL, licence and specifications, and the existing driving system picks it up.
          </p>
        </div>
      )}

      <footer className="car-select__foot">
        <p>
          All bodies are original Soburr geometry. No third-party vehicle model, badge or trade
          dress is used.
        </p>
        <button className="world-button" onClick={() => setUi({ vehicleSelect: false })} disabled={!canDismiss && !isCurrent}>
          {canDismiss ? 'Back to the street' : 'Choose a car to begin'}
        </button>
      </footer>
    </div>
  );
}
