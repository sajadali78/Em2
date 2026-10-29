/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MotorSpecs, CalculatedGeometry, MaterialLimitsConfig } from '../types/motor';
import { generateSlotAllocations } from '../utils/windingFunction';
import { COOLING_OPTIONS, INSULATION_OPTIONS } from '../utils/materialLimits';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Crosshair,
  Flame,
  Thermometer,
  Layers,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  Waves,
  Activity,
  Info,
  Gauge,
} from 'lucide-react';
import {
  calculateAirgapFluxDensity,
  AirgapFluxDensityResult,
  FluxDensityPoint,
  SpatialHarmonicPoint,
} from '../utils/airgapFluxDensityAnalysis';

interface MotorCadViewProps {
  specs: MotorSpecs;
  geom: CalculatedGeometry;
  materialConfig?: MaterialLimitsConfig;
}

// Thermal color interpolation utility (FEA blue -> cyan -> green -> yellow -> red -> hot-spot magenta)
function interpolateColor(color1: string, color2: string, factor: number): string {
  const f = Math.max(0, Math.min(1, factor));
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);

  const r1 = (c1 >> 16) & 255;
  const g1 = (c1 >> 8) & 255;
  const b1 = c1 & 255;

  const r2 = (c2 >> 16) & 255;
  const g2 = (c2 >> 8) & 255;
  const b2 = c2 & 255;

  const r = Math.round(r1 + f * (r2 - r1));
  const g = Math.round(g1 + f * (g2 - g1));
  const b = Math.round(b1 + f * (b2 - b1));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function getThermalColor(tVal: number, minT = 40, maxT = 145): string {
  const norm = Math.max(0, Math.min(1, (tVal - minT) / (maxT - minT)));
  if (norm < 0.2) return interpolateColor('#1e3a8a', '#0284c7', norm / 0.2);
  if (norm < 0.4) return interpolateColor('#0284c7', '#10b981', (norm - 0.2) / 0.2);
  if (norm < 0.6) return interpolateColor('#10b981', '#f59e0b', (norm - 0.4) / 0.2);
  if (norm < 0.8) return interpolateColor('#f59e0b', '#ef4444', (norm - 0.6) / 0.2);
  return interpolateColor('#ef4444', '#f43f5e', (norm - 0.8) / 0.2);
}

export const MotorCadView: React.FC<MotorCadViewProps> = ({ specs, geom, materialConfig }) => {
  const [viewMode, setViewMode] = useState<'radial' | 'axial'>('radial');
  const [showDimensions, setShowDimensions] = useState(true);
  const [showWindings, setShowWindings] = useState(true);
  const [showThermalOverlay, setShowThermalOverlay] = useState(false);
  const [thermalOpacity, setThermalOpacity] = useState(0.85);
  const [showIsotherms, setShowIsotherms] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);

  // Air-gap flux density 2D line plot states
  const [showFluxDensityPlot, setShowFluxDensityPlot] = useState<boolean>(false);
  const [fluxSpanMode, setFluxSpanMode] = useState<'one_pole' | 'two_pole' | 'full_machine'>('two_pole');
  const [showFundWave, setShowFundWave] = useState<boolean>(true);
  const [showRotorEnvelope, setShowRotorEnvelope] = useState<boolean>(true);
  const [showSlotNotches, setShowSlotNotches] = useState<boolean>(true);
  const [hoveredFluxPoint, setHoveredFluxPoint] = useState<FluxDensityPoint | null>(null);
  const [selectedSpatialHarmonic, setSelectedSpatialHarmonic] = useState<SpatialHarmonicPoint | null>(null);

  // Compute 2D Air-Gap Flux Density distribution and spatial harmonics
  const airgapFluxResult: AirgapFluxDensityResult = calculateAirgapFluxDensity(specs, geom);

  // Generate slot allocations for conductor coloring
  const slotAllocations = generateSlotAllocations(
    specs.statorSlots,
    specs.poles,
    specs.coilPitchSlots,
    specs.phases
  );

  // Canvas center
  const cx = 350;
  const cy = 350;

  // True physical millimetric dimensions
  const D_mm = geom.statorBoreDiameterMm;
  const Do_mm = geom.statorOuterDiameterMm;
  const hs_mm = geom.slotDepthMm;
  const bts_mm = geom.toothWidthMm;
  const bs0_mm = geom.slotOpeningWidthMm;
  const bs0_depth_mm = geom.slotOpeningDepthMm;
  const g_mm = geom.airgapLengthMm;
  const Dr_mm = geom.rotorOuterDiameterMm;
  const Dsh_mm = geom.shaftDiameterMm;
  const L_mm = geom.coreLengthMm;

  // Visual scaling: Fit stator outer diameter into 560px on a 700x700 canvas
  const baseScale = (275 / (Do_mm / 2)) * zoomLevel;

  // Scaled radii in SVG pixels
  const rOuter = (Do_mm / 2) * baseScale;
  const rYokeInner = (D_mm / 2 + hs_mm) * baseScale;
  const rBore = (D_mm / 2) * baseScale;
  const rRotor = (Dr_mm / 2) * baseScale;
  const rShaft = (Dsh_mm / 2) * baseScale;

  const numSlots = specs.statorSlots;
  const slotAngleStep = (2 * Math.PI) / numSlots;

  // -------------------------------------------------------------
  // Thermal Nodal Temperature Calculation (Physics-based)
  // -------------------------------------------------------------
  const coolingId = materialConfig?.cooling ?? 'ic411_tefc';
  const insulationId = materialConfig?.insulation ?? 'class_f_155';
  const coolingOpt = COOLING_OPTIONS.find((c) => c.id === coolingId) ?? COOLING_OPTIONS[1];
  const insulationOpt = INSULATION_OPTIONS.find((ins) => ins.id === insulationId) ?? INSULATION_OPTIONS[1];

  const ambientC = 40.0;
  const insulationLimitC = insulationOpt.temperatureLimit; // e.g. 155°C

  // Cooling multiplier based on active cooling convection
  const kCoolRise = coolingId === 'ic71w_liquid' ? 0.68 : coolingId === 'ic411_tefc' ? 1.0 : 1.18;

  // Winding Hot-Spot Temperature (Active copper Joule heating)
  const hotspotWindingC = Number((ambientC + (geom.copperTemperatureC - ambientC) * kCoolRise).toFixed(1));
  // Stator Tooth Core Temperature (iron hysteresis & eddy loss conduction)
  const statorToothC = Number((hotspotWindingC - 16 * kCoolRise).toFixed(1));
  // Stator Back-Iron Yoke Temperature
  const statorYokeC = Number((statorToothC - 18 * kCoolRise).toFixed(1));
  // Stator Outer Frame & Fins Temperature (convecting to ambient)
  const frameOuterC = Number(Math.max(ambientC + 12, statorYokeC - 14 * kCoolRise).toFixed(1));

  // Rotor nodal temperatures
  const isInduction = specs.topology === 'induction';
  const rotorBarsOrMagnetsC = Number(
    (isInduction ? hotspotWindingC - 8 : hotspotWindingC - 26).toFixed(1)
  );
  const rotorCoreC = Number((rotorBarsOrMagnetsC - 8).toFixed(1));
  const airgapC = Number(((statorToothC + rotorCoreC) / 2).toFixed(1));
  const shaftC = Number((rotorCoreC - 15).toFixed(1));

  const thermalMarginC = Number((insulationLimitC - hotspotWindingC).toFixed(1));
  const minThermalT = 40.0;
  const maxThermalT = Math.max(140.0, hotspotWindingC + 10);

  const getPhaseColor = (phase: 'A' | 'B' | 'C') => {
    switch (phase) {
      case 'A':
        return '#EF4444'; // Red
      case 'B':
        return '#3B82F6'; // Blue
      case 'C':
        return '#F59E0B'; // Amber
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full shadow-xl">
      {/* Top Controls Toolbar */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            <button
              onClick={() => setViewMode('radial')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === 'radial'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Radial Cross-Section (XY Plane)
            </button>
            <button
              onClick={() => setViewMode('axial')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                viewMode === 'axial'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Axial Longitudinal Section (XZ Plane)
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Thermal Heatmap Toggle Button */}
          <button
            onClick={() => setShowThermalOverlay(!showThermalOverlay)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all shadow-sm ${
              showThermalOverlay
                ? 'bg-gradient-to-r from-rose-600 via-amber-600 to-yellow-500 text-white shadow-rose-950/60 ring-1 ring-amber-300/60'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
          >
            <Flame
              className={`w-3.5 h-3.5 ${
                showThermalOverlay ? 'text-amber-200 animate-pulse' : 'text-slate-400'
              }`}
            />
            Thermal Heatmap {showThermalOverlay ? 'ON' : 'OFF'}
          </button>

          {/* Thermal Opacity & Isotherm Controls */}
          {showThermalOverlay && (
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2 py-0.5 text-xs font-mono">
              <span className="text-[10px] text-slate-400">Opacity:</span>
              {[0.5, 0.75, 1.0].map((op) => (
                <button
                  key={op}
                  onClick={() => setThermalOpacity(op)}
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    thermalOpacity === op
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {Math.round(op * 100)}%
                </button>
              ))}

              <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer ml-1 pl-1.5 border-l border-slate-800 select-none">
                <input
                  type="checkbox"
                  checked={showIsotherms}
                  onChange={(e) => setShowIsotherms(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 w-3 h-3"
                />
                <span>Isotherms</span>
              </label>
            </div>
          )}

          {/* Air-Gap Flux Density B(θ) 2D Plot Toggle */}
          <button
            onClick={() => setShowFluxDensityPlot(!showFluxDensityPlot)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all shadow-sm ${
              showFluxDensityPlot
                ? 'bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 text-white shadow-cyan-950/60 ring-1 ring-cyan-400'
                : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'
            }`}
            title="Toggle Air-Gap Flux Density B(θ) 2D Line Plot & Spatial Harmonics Verification"
          >
            <Waves
              className={`w-3.5 h-3.5 ${
                showFluxDensityPlot ? 'text-cyan-200 animate-pulse' : 'text-cyan-400'
              }`}
            />
            Air-Gap Flux B(θ) {showFluxDensityPlot ? 'ON' : 'OFF'}
          </button>

          {/* Quick Span Selector Pills when Flux Plot is ON */}
          {showFluxDensityPlot && (
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
              <span className="text-[10px] text-slate-400 px-1">Span:</span>
              <button
                onClick={() => setFluxSpanMode('one_pole')}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  fluxSpanMode === 'one_pole'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="1 Pole Pitch (180° electrical)"
              >
                1 Pole
              </button>
              <button
                onClick={() => setFluxSpanMode('two_pole')}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  fluxSpanMode === 'two_pole'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="2 Pole Pitches (360° electrical)"
              >
                2 Poles
              </button>
              <button
                onClick={() => setFluxSpanMode('full_machine')}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  fluxSpanMode === 'full_machine'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Full 360° Mechanical Revolution"
              >
                360°
              </button>
            </div>
          )}

          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDimensions}
              onChange={(e) => setShowDimensions(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span>Dimensions</span>
          </label>

          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showWindings}
              onChange={(e) => setShowWindings(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span>Phase Winding Color</span>
          </label>

          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-md p-0.5">
            <button
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.15))}
              className="p-1 text-slate-400 hover:text-white"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-300 px-1">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={() => setZoomLevel((z) => Math.min(3.0, z + 0.15))}
              className="p-1 text-slate-400 hover:text-white"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(1.0)}
              className="p-1 text-slate-400 hover:text-white ml-0.5"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main SVG Graphic Canvas */}
      <div className="relative flex-1 bg-slate-950 flex items-center justify-center p-4 min-h-[520px]">
        {viewMode === 'radial' ? (
          <svg viewBox="0 0 700 700" className="w-full h-full max-h-[640px] select-none">
            <defs>
              <radialGradient id="statorSteelGrad" cx="50%" cy="50%" r="50%">
                <stop offset="65%" stopColor="#334155" />
                <stop offset="100%" stopColor="#1e293b" />
              </radialGradient>
              <radialGradient id="rotorSteelGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="85%" stopColor="#334155" />
                <stop offset="100%" stopColor="#1e293b" />
              </radialGradient>
              <linearGradient id="northMag" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#b91c1c" />
              </linearGradient>
              <linearGradient id="southMag" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>

              {/* Thermal FEA Gradients */}
              <radialGradient id="thermalYokeGrad" cx="50%" cy="50%" r="50%">
                <stop offset={`${Math.round((rBore / rOuter) * 100)}%`} stopColor={getThermalColor(statorToothC, minThermalT, maxThermalT)} />
                <stop offset={`${Math.round((rYokeInner / rOuter) * 100)}%`} stopColor={getThermalColor(statorYokeC, minThermalT, maxThermalT)} />
                <stop offset="100%" stopColor={getThermalColor(frameOuterC, minThermalT, maxThermalT)} />
              </radialGradient>
              <radialGradient id="thermalRotorGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={getThermalColor(shaftC, minThermalT, maxThermalT)} />
                <stop offset={`${Math.max(10, Math.round((rShaft / rRotor) * 100))}%`} stopColor={getThermalColor(shaftC, minThermalT, maxThermalT)} />
                <stop offset="85%" stopColor={getThermalColor(rotorCoreC, minThermalT, maxThermalT)} />
                <stop offset="100%" stopColor={getThermalColor(rotorBarsOrMagnetsC, minThermalT, maxThermalT)} />
              </radialGradient>
              <radialGradient id="hotspotGlowGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor={getThermalColor(hotspotWindingC, minThermalT, maxThermalT)} />
                <stop offset="100%" stopColor={getThermalColor(hotspotWindingC - 10, minThermalT, maxThermalT)} />
              </radialGradient>
              <linearGradient id="thermalAxialCoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={getThermalColor(statorToothC - 10, minThermalT, maxThermalT)} />
                <stop offset="25%" stopColor={getThermalColor(statorToothC, minThermalT, maxThermalT)} />
                <stop offset="50%" stopColor={getThermalColor(hotspotWindingC - 4, minThermalT, maxThermalT)} />
                <stop offset="75%" stopColor={getThermalColor(statorToothC, minThermalT, maxThermalT)} />
                <stop offset="100%" stopColor={getThermalColor(statorToothC - 10, minThermalT, maxThermalT)} />
              </linearGradient>
            </defs>

            {/* Stator Outer Frame with realistic cast cooling fins */}
            <g
              onMouseEnter={() =>
                setHoveredElement(
                  showThermalOverlay
                    ? `Stator Frame & Cooling Ribs: T = ${frameOuterC}°C | Frame Heat Flux: ${Math.round(geom.totalLossW / Math.max(0.01, Math.PI * (Do_mm/1000) * (L_mm/1000)))} W/m² | Cooling: ${coolingOpt.name} (${coolingOpt.code})`
                    : `Stator Frame Housing: Outer Diameter Do = ${Do_mm} mm`
                )
              }
              onMouseLeave={() => setHoveredElement(null)}
              className="cursor-pointer"
            >
              <circle
                cx={cx}
                cy={cy}
                r={rOuter + 8}
                fill={showThermalOverlay ? getThermalColor(frameOuterC, minThermalT, maxThermalT) : "#1e293b"}
                stroke={showThermalOverlay ? getThermalColor(frameOuterC - 3, minThermalT, maxThermalT) : "#475569"}
                strokeWidth="1.5"
                fillOpacity={showThermalOverlay ? thermalOpacity : 1}
              />
              {/* Radial cooling ribs */}
              {Array.from({ length: 36 }).map((_, i) => {
                const angle = (i * 2 * Math.PI) / 36;
                const x1 = cx + (rOuter + 6) * Math.cos(angle);
                const y1 = cy + (rOuter + 6) * Math.sin(angle);
                const x2 = cx + (rOuter + 18) * Math.cos(angle);
                const y2 = cy + (rOuter + 18) * Math.sin(angle);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={showThermalOverlay ? getThermalColor(frameOuterC - 5, minThermalT, maxThermalT) : "#475569"}
                    strokeWidth="3.0"
                    strokeLinecap="round"
                    strokeOpacity={showThermalOverlay ? thermalOpacity : 1}
                  />
                );
              })}
            </g>

            {/* Stator Back-Iron (Yoke) Lamination Ring */}
            <g
              onMouseEnter={() =>
                setHoveredElement(
                  showThermalOverlay
                    ? `Stator Yoke Back-Iron: T = ${statorYokeC}°C | Core Loss = ${geom.yokeIronLossW} W | Yoke Flux = ${geom.yokeFluxDensityTesla} T`
                    : `Stator Yoke (Back-Iron): hys = ${geom.statorYokeDepthMm} mm | Flux Density = ${geom.yokeFluxDensityTesla} T`
                )
              }
              onMouseLeave={() => setHoveredElement(null)}
              className="cursor-pointer"
            >
              <circle
                cx={cx}
                cy={cy}
                r={rOuter}
                fill={showThermalOverlay ? "url(#thermalYokeGrad)" : "url(#statorSteelGrad)"}
                stroke="#64748b"
                strokeWidth="1"
                fillOpacity={showThermalOverlay ? thermalOpacity : 1}
              />
            </g>

            {/* Stator Teeth & Slots with TRUE Industrial Slot Profiles */}
            {Array.from({ length: numSlots }).map((_, i) => {
              const theta = i * slotAngleStep;
              const alloc = slotAllocations[i] ?? { topLayerPhase: 'A', bottomLayerPhase: 'A' };

              // True angular tooth width in radians at bore radius and at slot bottom radius
              const toothHalfWidthMm = bts_mm / 2;
              const halfAngleAtBore = Math.asin(Math.min(0.95, toothHalfWidthMm / (D_mm / 2)));
              const halfAngleAtBottom = Math.asin(Math.min(0.95, toothHalfWidthMm / (D_mm / 2 + hs_mm)));

              // Slot half angle between teeth
              const slotHalfAngleBore = slotAngleStep / 2 - halfAngleAtBore;
              const slotHalfAngleBottom = slotAngleStep / 2 - halfAngleAtBottom;

              // Slot opening half angle
              const slotOpeningHalfAngle = Math.asin(Math.min(0.8, (bs0_mm / 2) / (D_mm / 2)));

              // Coordinates of the true industrial semi-closed slot profile
              const r0 = rBore;
              const rWedge1 = rBore + bs0_depth_mm * baseScale;
              const rWedge2 = rBore + (bs0_depth_mm + 2.0) * baseScale;
              const rBottom = rYokeInner;

              // Left boundary points
              const p1x = cx + r0 * Math.cos(theta - slotOpeningHalfAngle);
              const p1y = cy + r0 * Math.sin(theta - slotOpeningHalfAngle);
              const p2x = cx + rWedge1 * Math.cos(theta - slotOpeningHalfAngle);
              const p2y = cy + rWedge1 * Math.sin(theta - slotOpeningHalfAngle);
              const p3x = cx + rWedge2 * Math.cos(theta - slotHalfAngleBore);
              const p3y = cy + rWedge2 * Math.sin(theta - slotHalfAngleBore);
              const p4x = cx + rBottom * Math.cos(theta - slotHalfAngleBottom);
              const p4y = cy + rBottom * Math.sin(theta - slotHalfAngleBottom);

              // Right boundary points
              const p5x = cx + rBottom * Math.cos(theta + slotHalfAngleBottom);
              const p5y = cy + rBottom * Math.sin(theta + slotHalfAngleBottom);
              const p6x = cx + rWedge2 * Math.cos(theta + slotHalfAngleBore);
              const p6y = cy + rWedge2 * Math.sin(theta + slotHalfAngleBore);
              const p7x = cx + rWedge1 * Math.cos(theta + slotOpeningHalfAngle);
              const p7y = cy + rWedge1 * Math.sin(theta + slotOpeningHalfAngle);
              const p8x = cx + r0 * Math.cos(theta + slotOpeningHalfAngle);
              const p8y = cy + r0 * Math.sin(theta + slotOpeningHalfAngle);

              const slotPath = `M ${p1x} ${p1y} L ${p2x} ${p2y} L ${p3x} ${p3y} L ${p4x} ${p4y} A ${rBottom} ${rBottom} 0 0 1 ${p5x} ${p5y} L ${p6x} ${p6y} L ${p7x} ${p7y} L ${p8x} ${p8y} Z`;

              // Conductor positions inside slot (top and bottom layer)
              const rMidTop = rWedge2 + (rBottom - rWedge2) * 0.32;
              const rMidBot = rWedge2 + (rBottom - rWedge2) * 0.72;
              const cTopX = cx + rMidTop * Math.cos(theta);
              const cTopY = cy + rMidTop * Math.sin(theta);
              const cBotX = cx + rMidBot * Math.cos(theta);
              const cBotY = cy + rMidBot * Math.sin(theta);
              const condRadius = Math.max(3.0, (rBottom - rWedge2) * 0.17);

              const topColor = getPhaseColor(alloc.topLayerPhase);
              const botColor = getPhaseColor(alloc.bottomLayerPhase);

              return (
                <g
                  key={i}
                  onMouseEnter={() =>
                    setHoveredElement(
                      showThermalOverlay
                        ? `Stator Slot #${i + 1}: T = ${hotspotWindingC}°C (Hot-Spot Winding) | Copper Loss = ${geom.statorCopperLossW} W (J = ${geom.actualCurrentDensityA_mm2} A/mm²) | Margin = +${thermalMarginC}°C to ${insulationOpt.name}`
                        : `Stator Slot #${i + 1}: Depth hs = ${hs_mm} mm, Tooth Width bts = ${bts_mm} mm, Tooth Flux = ${geom.toothFluxDensityTesla} T, Top: ${alloc.topLayerPhase}, Bot: ${alloc.bottomLayerPhase}`
                    )
                  }
                  onMouseLeave={() => setHoveredElement(null)}
                  className="cursor-pointer"
                >
                  {/* Slot cavity */}
                  <path
                    d={slotPath}
                    fill={showThermalOverlay ? getThermalColor(hotspotWindingC - 6, minThermalT, maxThermalT) : "#0a0f1d"}
                    stroke="#64748b"
                    strokeWidth="0.8"
                    fillOpacity={showThermalOverlay ? thermalOpacity : 1}
                  />

                  {/* Slot insulation wedge liner */}
                  <line
                    x1={p3x}
                    y1={p3y}
                    x2={p6x}
                    y2={p6y}
                    stroke={showThermalOverlay ? getThermalColor(statorToothC, minThermalT, maxThermalT) : "#0284c7"}
                    strokeWidth="1.2"
                    opacity={0.7}
                  />

                  {/* Conductors */}
                  {showWindings && (
                    <>
                      <circle
                        cx={cTopX}
                        cy={cTopY}
                        r={condRadius}
                        fill={showThermalOverlay ? "url(#hotspotGlowGrad)" : topColor}
                        stroke={showThermalOverlay ? "#fecdd3" : "#ffffff"}
                        strokeWidth={showThermalOverlay ? 1.0 : 0.6}
                        opacity={0.95}
                      />
                      <circle
                        cx={cBotX}
                        cy={cBotY}
                        r={condRadius}
                        fill={showThermalOverlay ? "url(#hotspotGlowGrad)" : botColor}
                        stroke={showThermalOverlay ? "#fecdd3" : "#ffffff"}
                        strokeWidth={showThermalOverlay ? 1.0 : 0.6}
                        opacity={0.95}
                      />
                    </>
                  )}
                </g>
              );
            })}

            {/* Stator Bore Boundary */}
            <circle
              cx={cx}
              cy={cy}
              r={rBore}
              fill="none"
              stroke="#0284c7"
              strokeWidth="1.2"
              strokeDasharray="4 2"
              onMouseEnter={() => setHoveredElement(`Stator Bore: D = ${D_mm} mm`)}
              onMouseLeave={() => setHoveredElement(null)}
              className="cursor-pointer"
            />

            {/* Mechanical Airgap Clearance & Flux Integration Path */}
            <circle
              cx={cx}
              cy={cy}
              r={(rBore + rRotor) / 2}
              fill="none"
              stroke={
                showFluxDensityPlot
                  ? "#22d3ee"
                  : showThermalOverlay
                  ? getThermalColor(airgapC, minThermalT, maxThermalT)
                  : "#38bdf8"
              }
              strokeWidth={showFluxDensityPlot ? "2.2" : "1.0"}
              strokeDasharray={showFluxDensityPlot ? "4 2" : undefined}
              onMouseEnter={() =>
                setHoveredElement(
                  showFluxDensityPlot
                    ? `Airgap Flux Path: g = ${g_mm} mm | Bg,fund = ${airgapFluxResult.bgFundamentalTesla} T | Bmax = ${airgapFluxResult.bgPeakTesla} T | Carter Dip = ${airgapFluxResult.carterDipDepthPct}%`
                    : showThermalOverlay
                    ? `Airgap Clearance: g = ${g_mm} mm | Airgap Fluid Temp = ${airgapC}°C | Effective ge = ${geom.effectiveAirgapMm} mm`
                    : `Airgap Clearance: g = ${g_mm} mm | Effective ge = ${geom.effectiveAirgapMm} mm`
                )
              }
              onMouseLeave={() => setHoveredElement(null)}
              className="cursor-pointer"
            />

            {/* Rotor Core Lamination */}
            <circle
              cx={cx}
              cy={cy}
              r={rRotor}
              fill={showThermalOverlay ? "url(#thermalRotorGrad)" : "url(#rotorSteelGrad)"}
              stroke="#64748b"
              strokeWidth="1"
              fillOpacity={showThermalOverlay ? thermalOpacity : 1}
              onMouseEnter={() =>
                setHoveredElement(
                  showThermalOverlay
                    ? `Rotor Core Lamination: Dr = ${Dr_mm} mm | T = ${rotorCoreC}°C | Rotor Loss = ${geom.rotorLossW} W`
                    : `Rotor Outer Diameter: Dr = ${Dr_mm} mm`
                )
              }
              onMouseLeave={() => setHoveredElement(null)}
              className="cursor-pointer"
            />

            {/* ---------------- ROTOR TOPOLOGIES ---------------- */}
            {specs.topology === 'induction' && (
              // Realistic Induction Rotor Slots & Embedded Copper/Aluminum Bars
              <g>
                {Array.from({ length: specs.rotorSlots ?? 28 }).map((_, j) => {
                  const numRotorSlots = specs.rotorSlots ?? 28;
                  const rAngle = (j * 2 * Math.PI) / numRotorSlots;
                  const barDepth = (geom.rotorBarHeightMm ?? 22) * baseScale;
                  const barWidth = (geom.rotorBarWidthMm ?? 6.5) * baseScale;

                  const r1 = rRotor - 1.5 * baseScale;
                  const r2 = r1 - barDepth;
                  const bx1 = cx + r1 * Math.cos(rAngle);
                  const by1 = cy + r1 * Math.sin(rAngle);
                  const bx2 = cx + r2 * Math.cos(rAngle);
                  const by2 = cy + r2 * Math.sin(rAngle);

                  const barColor = specs.rotorBarMaterial === 'copper' ? '#d97706' : '#94a3b8';

                  return (
                    <line
                      key={j}
                      x1={bx1}
                      y1={by1}
                      x2={bx2}
                      y2={by2}
                      stroke={barColor}
                      strokeWidth={Math.max(3.0, barWidth)}
                      strokeLinecap="round"
                      onMouseEnter={() =>
                        setHoveredElement(
                          `Rotor Bar #${j + 1} (${specs.rotorBarMaterial?.toUpperCase() ?? 'ALUMINUM'}): Height = ${geom.rotorBarHeightMm} mm, Width = ${geom.rotorBarWidthMm} mm`
                        )
                      }
                      onMouseLeave={() => setHoveredElement(null)}
                      className="cursor-pointer"
                    />
                  );
                })}
              </g>
            )}

            {specs.topology === 'pmsm_spm' && (
              // True Surface Permanent Magnets Mounted Directly on Rotor Periphery
              <g>
                {Array.from({ length: specs.poles }).map((_, pIdx) => {
                  const poleSpan = (2 * Math.PI) / specs.poles;
                  const poleArc = poleSpan * (specs.magnetPoleArcRatio ?? 0.74);
                  const midAngle = pIdx * poleSpan;
                  const aStart = midAngle - poleArc / 2;
                  const aEnd = midAngle + poleArc / 2;

                  const magR_outer = rRotor;
                  const magR_inner = rRotor - (geom.magnetThicknessActualMm ?? 4.0) * baseScale;

                  const x1 = cx + magR_inner * Math.cos(aStart);
                  const y1 = cy + magR_inner * Math.sin(aStart);
                  const x2 = cx + magR_outer * Math.cos(aStart);
                  const y2 = cy + magR_outer * Math.sin(aStart);
                  const x3 = cx + magR_outer * Math.cos(aEnd);
                  const y3 = cy + magR_outer * Math.sin(aEnd);
                  const x4 = cx + magR_inner * Math.cos(aEnd);
                  const y4 = cy + magR_inner * Math.sin(aEnd);

                  const path = `M ${x1} ${y1} L ${x2} ${y2} A ${magR_outer} ${magR_outer} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${magR_inner} ${magR_inner} 0 0 0 ${x1} ${y1} Z`;
                  const isNorth = pIdx % 2 === 0;

                  return (
                    <path
                      key={pIdx}
                      d={path}
                      fill={isNorth ? 'url(#northMag)' : 'url(#southMag)'}
                      stroke="#ffffff"
                      strokeWidth="0.8"
                      onMouseEnter={() =>
                        setHoveredElement(
                          `Surface Magnet Pole #${pIdx + 1} (${isNorth ? 'NORTH' : 'SOUTH'}): Thickness hm = ${geom.magnetThicknessActualMm} mm, Width bm = ${geom.magnetWidthMm} mm, Br = ${specs.magnetRemanenceBr} T`
                        )
                      }
                      onMouseLeave={() => setHoveredElement(null)}
                      className="cursor-pointer"
                    />
                  );
                })}
              </g>
            )}

            {specs.topology === 'pmsm_ipm' && (
              // True Interior V-Shape Magnet Cavities Embedded inside Lamination
              <g>
                {Array.from({ length: specs.poles }).map((_, pIdx) => {
                  const poleSpan = (2 * Math.PI) / specs.poles;
                  const midAngle = pIdx * poleSpan;
                  const isNorth = pIdx % 2 === 0;

                  // Magnet slab dimensions in pixels
                  const magThickPx = Math.max(3.5, (geom.magnetThicknessActualMm ?? 4.5) * baseScale);
                  const rInnerV = rRotor * 0.62;
                  const rOuterV = rRotor - 2.5 * baseScale; // 2.5mm outer iron bridge

                  // V-Leg 1
                  const v1_x1 = cx + rInnerV * Math.cos(midAngle - 0.16);
                  const v1_y1 = cy + rInnerV * Math.sin(midAngle - 0.16);
                  const v1_x2 = cx + rOuterV * Math.cos(midAngle - 0.28);
                  const v1_y2 = cy + rOuterV * Math.sin(midAngle - 0.28);

                  // V-Leg 2
                  const v2_x1 = cx + rInnerV * Math.cos(midAngle + 0.16);
                  const v2_y1 = cy + rInnerV * Math.sin(midAngle + 0.16);
                  const v2_x2 = cx + rOuterV * Math.cos(midAngle + 0.28);
                  const v2_y2 = cy + rOuterV * Math.sin(midAngle + 0.28);

                  return (
                    <g
                      key={pIdx}
                      onMouseEnter={() =>
                        setHoveredElement(
                          `IPM V-Magnet Pole #${pIdx + 1} (${isNorth ? 'NORTH' : 'SOUTH'}): Thickness hm = ${geom.magnetThicknessActualMm} mm, Saliency Ratio Lq/Ld = ${specs.saliencyRatio ?? 2.3}`
                        )
                      }
                      onMouseLeave={() => setHoveredElement(null)}
                      className="cursor-pointer"
                    >
                      <line
                        x1={v1_x1}
                        y1={v1_y1}
                        x2={v1_x2}
                        y2={v1_y2}
                        stroke={isNorth ? '#ef4444' : '#3b82f6'}
                        strokeWidth={magThickPx}
                        strokeLinecap="round"
                      />
                      <line
                        x1={v2_x1}
                        y1={v2_y1}
                        x2={v2_x2}
                        y2={v2_y2}
                        stroke={isNorth ? '#ef4444' : '#3b82f6'}
                        strokeWidth={magThickPx}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {specs.topology === 'vernier_pm' && (
              // Vernier PM: Outer rotor high pole-count magnets
              <g>
                {Array.from({ length: Math.min(66, geom.rotorPolesPr ?? 66) }).map((_, vIdx) => {
                  const vPoles = Math.min(66, geom.rotorPolesPr ?? 66);
                  const vSpan = (2 * Math.PI) / vPoles;
                  const vStart = vIdx * vSpan;
                  const vEnd = (vIdx + 0.85) * vSpan;
                  const magR1 = rRotor - (geom.magnetThicknessActualMm ?? 3.8) * baseScale;
                  const magR2 = rRotor;

                  const vx1 = cx + magR1 * Math.cos(vStart);
                  const vy1 = cy + magR1 * Math.sin(vStart);
                  const vx2 = cx + magR2 * Math.cos(vStart);
                  const vy2 = cy + magR2 * Math.sin(vStart);
                  const vx3 = cx + magR2 * Math.cos(vEnd);
                  const vy3 = cy + magR2 * Math.sin(vEnd);
                  const vx4 = cx + magR1 * Math.cos(vEnd);
                  const vy4 = cy + magR1 * Math.sin(vEnd);

                  const path = `M ${vx1} ${vy1} L ${vx2} ${vy2} A ${magR2} ${magR2} 0 0 1 ${vx3} ${vy3} L ${vx4} ${vy4} A ${magR1} ${magR1} 0 0 0 ${vx1} ${vy1} Z`;
                  const isNorth = vIdx % 2 === 0;

                  return (
                    <path
                      key={vIdx}
                      d={path}
                      fill={isNorth ? '#ef4444' : '#3b82f6'}
                      stroke="#0f172a"
                      strokeWidth="0.4"
                    />
                  );
                })}
              </g>
            )}

            {specs.topology === 'wound_field' && (
              // Salient Poles and field coils
              <g>
                {Array.from({ length: specs.poles }).map((_, fIdx) => {
                  const poleSpan = (2 * Math.PI) / specs.poles;
                  const angle = fIdx * poleSpan;
                  const pShoeWidth = 0.55 * poleSpan;
                  const rBase = rShaft + 15 * baseScale;
                  const rShoe = rRotor;

                  const px1 = cx + rBase * Math.cos(angle - 0.16);
                  const py1 = cy + rBase * Math.sin(angle - 0.16);
                  const px2 = cx + rShoe * Math.cos(angle - pShoeWidth / 2);
                  const py2 = cy + rShoe * Math.sin(angle - pShoeWidth / 2);
                  const px3 = cx + rShoe * Math.cos(angle + pShoeWidth / 2);
                  const py3 = cy + rShoe * Math.sin(angle + pShoeWidth / 2);
                  const px4 = cx + rBase * Math.cos(angle + 0.16);
                  const py4 = cy + rBase * Math.sin(angle + 0.16);

                  return (
                    <g key={fIdx}>
                      <polygon
                        points={`${px1},${py1} ${px2},${py2} ${px3},${py3} ${px4},${py4}`}
                        fill="#475569"
                        stroke="#94a3b8"
                        strokeWidth="1"
                      />
                      <circle
                        cx={cx + (rBase + (rShoe - rBase) * 0.45) * Math.cos(angle - 0.22)}
                        cy={cy + (rBase + (rShoe - rBase) * 0.45) * Math.sin(angle - 0.22)}
                        r={6 * baseScale}
                        fill="#d97706"
                      />
                      <circle
                        cx={cx + (rBase + (rShoe - rBase) * 0.45) * Math.cos(angle + 0.22)}
                        cy={cy + (rBase + (rShoe - rBase) * 0.45) * Math.sin(angle + 0.22)}
                        r={6 * baseScale}
                        fill="#d97706"
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Central Solid Shaft & Keyway */}
            <g
              onMouseEnter={() =>
                setHoveredElement(`Central Shaft: Diameter Dsh = ${Dsh_mm} mm`)
              }
              onMouseLeave={() => setHoveredElement(null)}
              className="cursor-pointer"
            >
              <circle cx={cx} cy={cy} r={rShaft} fill="#0a0f1d" stroke="#94a3b8" strokeWidth="1.5" />
              {/* Shaft keyway slot */}
              <rect
                x={cx - 3 * baseScale}
                y={cy - rShaft - 2 * baseScale}
                width={6 * baseScale}
                height={5 * baseScale}
                fill="#0a0f1d"
                stroke="#94a3b8"
                strokeWidth="1.0"
              />
            </g>

            {/* Dimension Callouts Overlay */}
            {showDimensions && (
              <g className="pointer-events-none select-none text-[11px] font-mono">
                {/* Outer diameter Do caliper */}
                <line
                  x1={cx}
                  y1={cy - rOuter}
                  x2={cx + rOuter + 28}
                  y2={cy - rOuter}
                  stroke="#38bdf8"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                />
                <line
                  x1={cx}
                  y1={cy + rOuter}
                  x2={cx + rOuter + 28}
                  y2={cy + rOuter}
                  stroke="#38bdf8"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                />
                <line
                  x1={cx + rOuter + 22}
                  y1={cy - rOuter}
                  x2={cx + rOuter + 22}
                  y2={cy + rOuter}
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                />
                <text
                  x={cx + rOuter + 30}
                  y={cy}
                  fill="#38bdf8"
                  dominantBaseline="middle"
                  className="text-xs font-bold"
                >
                  Do = {Do_mm} mm
                </text>

                {/* Stator bore D caliper */}
                <line
                  x1={cx}
                  y1={cy}
                  x2={cx}
                  y2={cy - rBore}
                  stroke="#f59e0b"
                  strokeWidth="1.2"
                />
                <text
                  x={cx + 6}
                  y={cy - rBore / 2}
                  fill="#f59e0b"
                  dominantBaseline="middle"
                  className="text-xs font-bold"
                >
                  D = {D_mm} mm
                </text>

                {/* Airgap label */}
                <text
                  x={cx - rBore - 15}
                  y={cy}
                  fill="#06b6d4"
                  dominantBaseline="middle"
                  textAnchor="end"
                  className="text-xs font-bold"
                >
                  g = {g_mm} mm
                </text>
              </g>
            )}

            {/* Isothermal Contour Lines (60°C, 80°C, 100°C) & Hotspot Beacon */}
            {showThermalOverlay && showIsotherms && (
              <g className="pointer-events-none select-none font-mono text-[9px]">
                {/* 60°C Isotherm (near outer frame/yoke) */}
                {frameOuterC <= 65 && statorYokeC >= 55 && (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rYokeInner + (rOuter - rYokeInner) * 0.7}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                      opacity={0.85}
                    />
                    <text
                      x={cx + rYokeInner + (rOuter - rYokeInner) * 0.7 + 4}
                      y={cy - 4}
                      fill="#38bdf8"
                      fontWeight="bold"
                    >
                      60°C
                    </text>
                  </g>
                )}

                {/* 80°C Isotherm (in stator yoke / tooth root) */}
                {statorToothC >= 75 && (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rYokeInner}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="1.2"
                      strokeDasharray="5 3"
                      opacity={0.9}
                    />
                    <text
                      x={cx + rYokeInner + 4}
                      y={cy - 6}
                      fill="#34d399"
                      fontWeight="bold"
                    >
                      80°C
                    </text>
                  </g>
                )}

                {/* 100°C Isotherm (stator tooth / slot boundary) */}
                {hotspotWindingC >= 98 && (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rBore + hs_mm * baseScale * 0.55}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="1.2"
                      strokeDasharray="4 3"
                      opacity={0.95}
                    />
                    <text
                      x={cx + rBore + hs_mm * baseScale * 0.55 + 4}
                      y={cy - 8}
                      fill="#fbbf24"
                      fontWeight="bold"
                    >
                      100°C
                    </text>
                  </g>
                )}

                {/* Max Hot-Spot Marker Beacon */}
                <g>
                  <circle
                    cx={cx + (rBore + hs_mm * baseScale * 0.5) * Math.cos(0)}
                    cy={cy + (rBore + hs_mm * baseScale * 0.5) * Math.sin(0)}
                    r="8"
                    fill="none"
                    stroke="#f43f5e"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={cx + (rBore + hs_mm * baseScale * 0.5) * Math.cos(0)}
                    cy={cy + (rBore + hs_mm * baseScale * 0.5) * Math.sin(0)}
                    r="3.5"
                    fill="#f43f5e"
                  />
                  <rect
                    x={cx + (rBore + hs_mm * baseScale * 0.5) * Math.cos(0) + 10}
                    y={cy + (rBore + hs_mm * baseScale * 0.5) * Math.sin(0) - 10}
                    width="84"
                    height="18"
                    rx="3"
                    fill="#0f172a"
                    stroke="#f43f5e"
                    strokeWidth="1"
                    opacity={0.95}
                  />
                  <text
                    x={cx + (rBore + hs_mm * baseScale * 0.5) * Math.cos(0) + 14}
                    y={cy + (rBore + hs_mm * baseScale * 0.5) * Math.sin(0) + 3}
                    fill="#fecdd3"
                    fontWeight="bold"
                    fontSize="9.5"
                  >
                    Tmax: {hotspotWindingC}°C
                  </text>
                </g>
              </g>
            )}

            {/* Synchronized Air-Gap Flux Probe Ray & Angular Crosshair */}
            {showFluxDensityPlot && hoveredFluxPoint && (
              <g className="pointer-events-none select-none">
                {(() => {
                  const angRad = (hoveredFluxPoint.mechAngleDeg * Math.PI) / 180;
                  const rAir = (rBore + rRotor) / 2;
                  const rayLen = rOuter + 22;
                  const x1 = cx;
                  const y1 = cy;
                  const x2 = cx + rayLen * Math.cos(angRad);
                  const y2 = cy + rayLen * Math.sin(angRad);
                  const ptX = cx + rAir * Math.cos(angRad);
                  const ptY = cy + rAir * Math.sin(angRad);

                  return (
                    <g>
                      {/* Radial Guide Line from Origin through Airgap */}
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#22d3ee"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        strokeOpacity="0.85"
                      />
                      {/* Active Airgap Point Marker */}
                      <circle
                        cx={ptX}
                        cy={ptY}
                        r="5"
                        fill="#22d3ee"
                        stroke="#020617"
                        strokeWidth="2"
                      />
                      {/* Floating Angle & Flux Density Badge */}
                      <g
                        transform={`translate(${
                          ptX + (Math.cos(angRad) >= 0 ? 10 : -132)
                        }, ${ptY + (Math.sin(angRad) >= 0 ? 12 : -16)})`}
                      >
                        <rect
                          width="122"
                          height="20"
                          rx="4"
                          fill="#090d16"
                          stroke="#22d3ee"
                          strokeWidth="1"
                          opacity="0.95"
                        />
                        <text
                          x="6"
                          y="13.5"
                          fill="#38bdf8"
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="bold"
                        >
                          B = {hoveredFluxPoint.totalFluxDensityTesla} T ({hoveredFluxPoint.mechAngleDeg}°m)
                        </text>
                      </g>
                    </g>
                  );
                })()}
              </g>
            )}
          </svg>
        ) : (
          /* Axial Longitudinal Core Section (XZ Plane) with True Aspect Ratio L/D */
          <svg viewBox="0 0 700 700" className="w-full h-full max-h-[640px] select-none">
            {(() => {
              // Scale so max(L, Do) fits cleanly on canvas
              const axScale = (360 / Math.max(L_mm * 1.5, Do_mm)) * zoomLevel;
              const wL = L_mm * axScale;
              const hDo = Do_mm * axScale;
              const hD = D_mm * axScale;
              const hShaft = Dsh_mm * axScale;
              const wEnd = geom.endTurnLengthMm * 0.5 * axScale;
              const wShaftExt = 70 * axScale;

              const xCoreStart = cx - wL / 2;

              return (
                <g>
                  {/* Motor Shaft Centerline */}
                  <line
                    x1={xCoreStart - wEnd - wShaftExt - 30}
                    y1={cy}
                    x2={xCoreStart + wL + wEnd + wShaftExt + 30}
                    y2={cy}
                    stroke="#64748b"
                    strokeDasharray="6 4 2 4"
                    strokeWidth="1"
                  />

                  {/* Central Shaft with Bearings and Stepped Journal */}
                  <rect
                    x={xCoreStart - wEnd - wShaftExt}
                    y={cy - hShaft / 2}
                    width={wL + 2 * wEnd + 2 * wShaftExt}
                    height={hShaft}
                    fill={showThermalOverlay ? getThermalColor(shaftC, minThermalT, maxThermalT) : "#1e293b"}
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                    fillOpacity={showThermalOverlay ? thermalOpacity : 1}
                  />

                  {/* Drive-End Bearing Step */}
                  <rect
                    x={xCoreStart + wL + wEnd + 10}
                    y={cy - hShaft * 0.75}
                    width={22}
                    height={hShaft * 1.5}
                    fill={showThermalOverlay ? getThermalColor(shaftC - 4, minThermalT, maxThermalT) : "#334155"}
                    stroke="#94a3b8"
                    strokeWidth="1"
                    fillOpacity={showThermalOverlay ? thermalOpacity : 1}
                  />
                  {/* Non-Drive-End Bearing Step */}
                  <rect
                    x={xCoreStart - wEnd - 32}
                    y={cy - hShaft * 0.75}
                    width={22}
                    height={hShaft * 1.5}
                    fill={showThermalOverlay ? getThermalColor(shaftC - 4, minThermalT, maxThermalT) : "#334155"}
                    stroke="#94a3b8"
                    strokeWidth="1"
                    fillOpacity={showThermalOverlay ? thermalOpacity : 1}
                  />

                  {/* Stator Core Upper Stack */}
                  <rect
                    x={xCoreStart}
                    y={cy - hDo / 2}
                    width={wL}
                    height={(hDo - hD) / 2}
                    fill={showThermalOverlay ? "url(#thermalAxialCoreGrad)" : "#334155"}
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                    fillOpacity={showThermalOverlay ? thermalOpacity : 1}
                  />
                  {/* Stator Core Lower Stack */}
                  <rect
                    x={xCoreStart}
                    y={cy + hD / 2}
                    width={wL}
                    height={(hDo - hD) / 2}
                    fill={showThermalOverlay ? "url(#thermalAxialCoreGrad)" : "#334155"}
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                    fillOpacity={showThermalOverlay ? thermalOpacity : 1}
                  />

                  {/* Rotor Core Stack */}
                  <rect
                    x={xCoreStart}
                    y={cy - (hD / 2 - g_mm * axScale)}
                    width={wL}
                    height={hD - 2 * g_mm * axScale}
                    fill={showThermalOverlay ? getThermalColor(rotorCoreC, minThermalT, maxThermalT) : "#475569"}
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                    fillOpacity={showThermalOverlay ? thermalOpacity : 1}
                  />

                  {/* End Windings Overhang (DE & NDE) */}
                  <path
                    d={`M ${xCoreStart} ${cy - hDo / 2 + 10} C ${xCoreStart - wEnd} ${cy - hDo / 2 + 15}, ${xCoreStart - wEnd} ${cy - hD / 2 - 5}, ${xCoreStart} ${cy - hD / 2}`}
                    fill={showThermalOverlay ? getThermalColor(hotspotWindingC, minThermalT, maxThermalT) : "#d97706"}
                    stroke={showThermalOverlay ? "#fecdd3" : "#b45309"}
                    strokeWidth="1"
                    opacity={showThermalOverlay ? thermalOpacity : 0.88}
                  />
                  <path
                    d={`M ${xCoreStart} ${cy + hDo / 2 - 10} C ${xCoreStart - wEnd} ${cy + hDo / 2 - 15}, ${xCoreStart - wEnd} ${cy + hD / 2 + 5}, ${xCoreStart} ${cy + hD / 2}`}
                    fill={showThermalOverlay ? getThermalColor(hotspotWindingC, minThermalT, maxThermalT) : "#d97706"}
                    stroke={showThermalOverlay ? "#fecdd3" : "#b45309"}
                    strokeWidth="1"
                    opacity={showThermalOverlay ? thermalOpacity : 0.88}
                  />

                  <path
                    d={`M ${xCoreStart + wL} ${cy - hDo / 2 + 10} C ${xCoreStart + wL + wEnd} ${cy - hDo / 2 + 15}, ${xCoreStart + wL + wEnd} ${cy - hD / 2 - 5}, ${xCoreStart + wL} ${cy - hD / 2}`}
                    fill={showThermalOverlay ? getThermalColor(hotspotWindingC, minThermalT, maxThermalT) : "#d97706"}
                    stroke={showThermalOverlay ? "#fecdd3" : "#b45309"}
                    strokeWidth="1"
                    opacity={showThermalOverlay ? thermalOpacity : 0.88}
                  />
                  <path
                    d={`M ${xCoreStart + wL} ${cy + hDo / 2 - 10} C ${xCoreStart + wL + wEnd} ${cy + hDo / 2 - 15}, ${xCoreStart + wL + wEnd} ${cy + hD / 2 + 5}, ${xCoreStart + wL} ${cy + hD / 2}`}
                    fill={showThermalOverlay ? getThermalColor(hotspotWindingC, minThermalT, maxThermalT) : "#d97706"}
                    stroke={showThermalOverlay ? "#fecdd3" : "#b45309"}
                    strokeWidth="1"
                    opacity={showThermalOverlay ? thermalOpacity : 0.88}
                  />

                  {/* Calipers and Dimension Lines */}
                  {showDimensions && (
                    <g className="font-mono text-xs">
                      {/* Core Length L */}
                      <line
                        x1={xCoreStart}
                        y1={cy - hDo / 2 - 25}
                        x2={xCoreStart + wL}
                        y2={cy - hDo / 2 - 25}
                        stroke="#38bdf8"
                        strokeWidth="1.2"
                      />
                      <line
                        x1={xCoreStart}
                        y1={cy - hDo / 2 - 32}
                        x2={xCoreStart}
                        y2={cy - hDo / 2 - 15}
                        stroke="#38bdf8"
                        strokeWidth="1"
                      />
                      <line
                        x1={xCoreStart + wL}
                        y1={cy - hDo / 2 - 32}
                        x2={xCoreStart + wL}
                        y2={cy - hDo / 2 - 15}
                        stroke="#38bdf8"
                        strokeWidth="1"
                      />
                      <text
                        x={cx}
                        y={cy - hDo / 2 - 30}
                        fill="#38bdf8"
                        textAnchor="middle"
                        className="font-bold text-xs"
                      >
                        Core Stack L = {L_mm} mm
                      </text>

                      {/* Stator Outer Diameter Do */}
                      <line
                        x1={xCoreStart + wL + wEnd + 28}
                        y1={cy - hDo / 2}
                        x2={xCoreStart + wL + wEnd + 28}
                        y2={cy + hDo / 2}
                        stroke="#f59e0b"
                        strokeWidth="1.2"
                      />
                      <text
                        x={xCoreStart + wL + wEnd + 36}
                        y={cy}
                        fill="#f59e0b"
                        dominantBaseline="middle"
                        className="font-bold text-xs"
                      >
                        Do = {Do_mm} mm
                      </text>
                    </g>
                  )}
                </g>
              );
            })()}
          </svg>
        )}

        {/* Floating Thermal FEA Heatmap Legend & Hot-Spot HUD */}
        {showThermalOverlay && (
          <div className="absolute top-4 left-4 z-20 bg-slate-950/90 border border-slate-700/80 rounded-xl p-3 backdrop-blur-md shadow-2xl text-xs font-mono space-y-2 select-none max-w-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold text-white flex items-center gap-1.5 font-sans">
                <Flame className="w-4 h-4 text-rose-400" />
                Thermal FEA Heatmap
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800">
                {coolingOpt.code}
              </span>
            </div>

            {/* Gradient scale bar */}
            <div className="space-y-1">
              <div
                className="w-full h-3 rounded-md border border-slate-700 overflow-hidden"
                style={{
                  background: 'linear-gradient(to right, #1e3a8a, #0284c7, #10b981, #f59e0b, #ef4444, #f43f5e)',
                }}
              />
              <div className="flex justify-between text-[9px] text-slate-400">
                <span>{minThermalT}°C</span>
                <span>65°C</span>
                <span>90°C</span>
                <span>115°C</span>
                <span className="text-rose-400 font-bold">{maxThermalT}°C</span>
              </div>
            </div>

            {/* Node Key Temperatures Grid */}
            <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] border-t border-slate-800/80">
              <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block font-sans">Winding Hot-Spot:</span>
                <span className="font-bold text-rose-400">{hotspotWindingC} °C</span>
              </div>
              <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block font-sans">Stator Teeth:</span>
                <span className="font-bold text-amber-300">{statorToothC} °C</span>
              </div>
              <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block font-sans">Stator Yoke:</span>
                <span className="font-bold text-emerald-400">{statorYokeC} °C</span>
              </div>
              <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                <span className="text-[9px] text-slate-400 block font-sans">Frame Housing:</span>
                <span className="font-bold text-cyan-300">{frameOuterC} °C</span>
              </div>
            </div>

            {/* Insulation margin callout */}
            <div className="pt-1 flex items-center justify-between text-[10px]">
              <span className="text-slate-400 font-sans">Insulation ({insulationOpt.name}):</span>
              <span
                className={`font-bold flex items-center gap-1 ${
                  thermalMarginC > 15
                    ? 'text-emerald-400'
                    : thermalMarginC > 0
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {thermalMarginC > 0 ? (
                  <>
                    <ShieldCheck className="w-3 h-3" /> +{thermalMarginC}°C Margin
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3" /> Exceeded by {Math.abs(thermalMarginC)}°C
                  </>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Live Hover Inspection Tooltip */}
        <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 border border-slate-700/80 rounded-lg p-2.5 backdrop-blur-md shadow-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Crosshair className={`w-4 h-4 shrink-0 ${showThermalOverlay ? 'text-amber-400' : 'text-cyan-400'}`} />
            <span className="font-mono text-slate-200">
              {hoveredElement ??
                (showFluxDensityPlot
                  ? '⚡ Air-Gap Flux Verification: Inspecting radial flux distribution B(θ) with Carter slot permeance dips'
                  : showThermalOverlay
                  ? '🔥 Thermal FEA Probe: Hover over winding slots, teeth, yoke, airgap, or rotor to probe localized temperatures'
                  : 'Hover over stator teeth, slots, airgap, or rotor to inspect true millimetric geometry')}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-slate-400 font-mono text-[11px]">
            <span>D: <strong className="text-white">{D_mm} mm</strong></span>
            <span>L: <strong className="text-white">{L_mm} mm</strong></span>
            <span>Do: <strong className="text-white">{Do_mm} mm</strong></span>
            <span>g: <strong className="text-cyan-400">{g_mm} mm</strong></span>
            <span>Tooth bts: <strong className="text-white">{bts_mm} mm</strong></span>
          </div>
        </div>
      </div>

      {/* EXTENDED: 2D Air-Gap Flux Density Line Plot & Spatial Harmonics Verification Panel */}
      {showFluxDensityPlot && (
        <div className="border-t border-slate-800 bg-slate-950 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Waves className="w-4 h-4 text-cyan-400" />
                Air-Gap Flux Density Distribution B(θ) & Spatial Field Harmonics
              </h3>
              <p className="text-xs text-slate-400">
                2D radial line plot of the air-gap magnetic flux density around the stator bore, visualizing the fundamental working wave B₁(θ), stator tooth peaks, slot opening permeance dips (Carter effect), and spatial harmonic spectrum.
              </p>
            </div>

            {/* Span Mode Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs font-mono">
              <span className="text-[11px] text-slate-400 px-1 font-sans">Plot Span:</span>
              <button
                onClick={() => setFluxSpanMode('one_pole')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  fluxSpanMode === 'one_pole'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="1 Pole Pitch: High-resolution view of tooth/slot permeance ripples"
              >
                1 Pole Pitch (180°e)
              </button>
              <button
                onClick={() => setFluxSpanMode('two_pole')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  fluxSpanMode === 'two_pole'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="2 Pole Pitches: Complete positive and negative electrical cycle"
              >
                2 Pole Pitches (360°e)
              </button>
              <button
                onClick={() => setFluxSpanMode('full_machine')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  fluxSpanMode === 'full_machine'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Full Machine: Complete 360° mechanical periphery"
              >
                Full Machine (360°m)
              </button>
            </div>
          </div>

          {/* 5-Metric Quick Engineering KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
            {/* Fundamental Peak Bg,1 */}
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Fundamental Peak (Bg,1)
              </span>
              <div className="text-lg font-bold text-white">
                {airgapFluxResult.bgFundamentalTesla}{' '}
                <span className="text-xs font-normal text-slate-400">T</span>
              </div>
              <span className="text-[10px] text-emerald-400 block font-sans">
                Nominal air-gap magnetic loading
              </span>
            </div>

            {/* Maximum Peak Bmax */}
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Peak Flux Density (Bmax)
              </span>
              <div className="text-lg font-bold text-cyan-300">
                {airgapFluxResult.bgPeakTesla}{' '}
                <span className="text-xs font-normal text-slate-400">T</span>
              </div>
              <span className="text-[10px] text-slate-400 block font-sans">
                Tooth tip flux concentration
              </span>
            </div>

            {/* Carter Slot Permeance Dip */}
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Carter Slot Dip (ΔB)
              </span>
              <div className="text-lg font-bold text-amber-400">
                {airgapFluxResult.carterDipDepthPct}%
              </div>
              <span className="text-[10px] text-slate-400 block font-sans">
                bs0/g = {airgapFluxResult.slotOpeningRatio} (kc = {airgapFluxResult.carterCoefficient})
              </span>
            </div>

            {/* Spatial Flux THD */}
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Spatial Field THD
              </span>
              <div className="text-lg font-bold text-purple-400">
                {airgapFluxResult.thdPct}%
              </div>
              <span className="text-[10px] text-slate-400 block font-sans">
                MMF space & slot harmonics
              </span>
            </div>

            {/* Form Factor alpha_i */}
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Field Form Factor (αi)
              </span>
              <div className="text-lg font-bold text-sky-400">
                {airgapFluxResult.poleArcFactorAlpha}
              </div>
              <span className="text-[10px] text-slate-400 block font-sans">
                Bavg / Bmax (Sawhney / Pyrhönen)
              </span>
            </div>
          </div>

          {/* Interactive 2D Line Plot Canvas & Filter Toggles */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white flex items-center gap-1.5 font-mono">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Air-Gap Radial Flux Waveform B(θ)
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {fluxSpanMode === 'one_pole'
                    ? `[1 Pole Pitch: 0° to ${(360 / specs.poles).toFixed(1)}° mech (180° elec)]`
                    : fluxSpanMode === 'two_pole'
                    ? `[2 Pole Pitches: 0° to ${(720 / specs.poles).toFixed(1)}° mech (360° elec)]`
                    : '[Full Machine: 0° to 360° mechanical revolution]'}
                </span>
              </div>

              {/* Layer Filter Checkboxes */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                  <span className="w-3 h-0.5 bg-cyan-400 inline-block shadow-sm shadow-cyan-400" />
                  <span>Total B(θ) with Slotting</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={showFundWave}
                    onChange={(e) => setShowFundWave(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="w-3 h-0.5 bg-emerald-400 border-t border-dashed border-emerald-400 inline-block" />
                  <span>Fundamental B₁(θ)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={showRotorEnvelope}
                    onChange={(e) => setShowRotorEnvelope(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="w-3 h-0.5 bg-amber-400 border-t border-dashed border-amber-400 inline-block" />
                  <span>Rotor MMF Envelope</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={showSlotNotches}
                    onChange={(e) => setShowSlotNotches(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="w-2 h-2 rounded-sm bg-amber-400/30 inline-block" />
                  <span>Slot Openings (bs0)</span>
                </label>
              </div>
            </div>

            {/* SVG 2D Line Plot Canvas */}
            {(() => {
              const svgW = 760;
              const svgH = 240;
              const padL = 55;
              const padR = 30;
              const padT = 25;
              const padB = 40;
              const iW = svgW - padL - padR;
              const iH = svgH - padT - padB;

              // Select dataset
              const dataset =
                fluxSpanMode === 'one_pole'
                  ? airgapFluxResult.poleWaveformPoints
                  : fluxSpanMode === 'two_pole'
                  ? airgapFluxResult.twoPoleWaveformPoints
                  : airgapFluxResult.fullWaveformPoints;

              const pPoles = Math.max(1, specs.poles / 2);
              const maxAngle =
                fluxSpanMode === 'one_pole'
                  ? 360 / specs.poles
                  : fluxSpanMode === 'two_pole'
                  ? 720 / specs.poles
                  : 360;

              // Vertical scale: symmetric around 0 T
              const bLimit = Math.max(0.4, Number((airgapFluxResult.bgPeakTesla * 1.25).toFixed(2)));
              const yMin = -bLimit;
              const yMax = bLimit;
              const yRange = yMax - yMin;

              const scaleX = (angle: number) => padL + (angle / maxAngle) * iW;
              const scaleY = (bVal: number) => padT + iH - ((bVal - yMin) / yRange) * iH;

              // SVG Paths
              const d_total = dataset
                .map(
                  (pt, idx) =>
                    `${idx === 0 ? 'M' : 'L'} ${scaleX(pt.mechAngleDeg).toFixed(1)} ${scaleY(
                      pt.totalFluxDensityTesla
                    ).toFixed(1)}`
                )
                .join(' ');

              const d_fund = dataset
                .map(
                  (pt, idx) =>
                    `${idx === 0 ? 'M' : 'L'} ${scaleX(pt.mechAngleDeg).toFixed(1)} ${scaleY(
                      pt.fundamentalTesla
                    ).toFixed(1)}`
                )
                .join(' ');

              const d_rotor = dataset
                .map(
                  (pt, idx) =>
                    `${idx === 0 ? 'M' : 'L'} ${scaleX(pt.mechAngleDeg).toFixed(1)} ${scaleY(
                      pt.rotorEnvelopeTesla
                    ).toFixed(1)}`
                )
                .join(' ');

              // Area fill relative to 0 T axis
              const yZero = scaleY(0);

              // X-Ticks: 6 divisions across the span
              const numTicks = 6;
              const xTicks = Array.from({ length: numTicks + 1 }, (_, i) => (i / numTicks) * maxAngle);

              // Stator slot openings within this angle span
              const Qs = specs.statorSlots;
              const slotPitchDeg = 360 / Qs;
              const halfOpeningDeg = (geom.slotOpeningWidthMm / (Math.PI * geom.statorBoreDiameterMm)) * 180;
              const visibleSlots: { slotNum: number; centerDeg: number }[] = [];
              for (let k = 0; k <= Qs; k++) {
                const deg = k * slotPitchDeg;
                if (deg <= maxAngle + 0.1) {
                  visibleSlots.push({ slotNum: (k % Qs) + 1, centerDeg: deg });
                }
              }

              const handlePlotMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const normalizedX = (mouseX / rect.width) * svgW;
                if (normalizedX >= padL && normalizedX <= padL + iW) {
                  const angle = Math.max(0, Math.min(maxAngle, ((normalizedX - padL) / iW) * maxAngle));
                  const closest = dataset.reduce((prev, curr) =>
                    Math.abs(curr.mechAngleDeg - angle) < Math.abs(prev.mechAngleDeg - angle)
                      ? curr
                      : prev
                  );
                  setHoveredFluxPoint(closest);
                }
              };

              return (
                <div className="relative">
                  <svg
                    viewBox={`0 0 ${svgW} ${svgH}`}
                    className="w-full h-60 select-none cursor-crosshair overflow-visible"
                    onMouseMove={handlePlotMouseMove}
                    onMouseLeave={() => setHoveredFluxPoint(null)}
                  >
                    <defs>
                      <linearGradient id="fluxFillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity="0.02" />
                      </linearGradient>

                      <filter id="glowFlux" x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#22d3ee" floodOpacity="0.5" />
                      </filter>
                    </defs>

                    {/* Stator Slot Opening Shaded Regions (bs0) */}
                    {showSlotNotches &&
                      visibleSlots.map((s, idx) => {
                        const x1 = Math.max(padL, scaleX(s.centerDeg - halfOpeningDeg));
                        const x2 = Math.min(padL + iW, scaleX(s.centerDeg + halfOpeningDeg));
                        const w = Math.max(1.5, x2 - x1);
                        return (
                          <g key={idx}>
                            <rect
                              x={x1}
                              y={padT}
                              width={w}
                              height={iH}
                              fill="#f59e0b"
                              fillOpacity="0.08"
                              stroke="#f59e0b"
                              strokeOpacity="0.25"
                              strokeDasharray="2 2"
                            />
                            {/* Slot index label if zoomed in */}
                            {fluxSpanMode !== 'full_machine' && (
                              <text
                                x={scaleX(s.centerDeg)}
                                y={padT - 6}
                                fill="#d97706"
                                fontSize="7.5"
                                fontFamily="monospace"
                                textAnchor="middle"
                              >
                                Slot #{s.slotNum}
                              </text>
                            )}
                          </g>
                        );
                      })}

                    {/* Horizontal Y-Gridlines & Labels */}
                    {[-bLimit, -bLimit / 2, 0, bLimit / 2, bLimit].map((yVal, idx) => {
                      const yPos = scaleY(yVal);
                      const isZero = Math.abs(yVal) < 0.001;
                      return (
                        <g key={idx}>
                          <line
                            x1={padL}
                            y1={yPos}
                            x2={padL + iW}
                            y2={yPos}
                            stroke={isZero ? '#475569' : '#1e293b'}
                            strokeWidth={isZero ? 1.2 : 1}
                            strokeDasharray={isZero ? '4 3' : '2 3'}
                          />
                          <text
                            x={padL - 8}
                            y={yPos + 3.5}
                            fill={isZero ? '#94a3b8' : '#64748b'}
                            fontSize="9"
                            fontFamily="monospace"
                            textAnchor="end"
                          >
                            {yVal.toFixed(2)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Vertical X-Gridlines & Dual Angle Labels (Mech & Elec) */}
                    {xTicks.map((deg, idx) => {
                      const xPos = scaleX(deg);
                      const elecDeg = (deg * pPoles).toFixed(0);
                      return (
                        <g key={idx}>
                          <line
                            x1={xPos}
                            y1={padT}
                            x2={xPos}
                            y2={padT + iH}
                            stroke="#1e293b"
                            strokeDasharray="2 3"
                          />
                          {/* Mechanical Degrees */}
                          <text
                            x={xPos}
                            y={padT + iH + 15}
                            fill="#94a3b8"
                            fontSize="9"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {deg.toFixed(1)}°m
                          </text>
                          {/* Electrical Degrees */}
                          <text
                            x={xPos}
                            y={padT + iH + 27}
                            fill="#64748b"
                            fontSize="8"
                            fontFamily="monospace"
                            textAnchor="middle"
                          >
                            {elecDeg}°e
                          </text>
                        </g>
                      );
                    })}

                    {/* Axis Labels */}
                    <text
                      x={-padT - iH / 2}
                      y="16"
                      transform="rotate(-90)"
                      fill="#94a3b8"
                      fontSize="9.5"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      Flux Density B [Tesla]
                    </text>

                    <text
                      x={padL + iW / 2}
                      y={padT + iH + 38}
                      fill="#94a3b8"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      Air-Gap Circumferential Angle θ [Mechanical Degrees °m / Electrical Degrees °e]
                    </text>

                    {/* Unslotted Rotor Envelope Waveform */}
                    {showRotorEnvelope && (
                      <path
                        d={d_rotor}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.3"
                        strokeDasharray="3 2"
                        strokeOpacity="0.8"
                      />
                    )}

                    {/* Fundamental Sinusoidal Waveform B1 */}
                    {showFundWave && (
                      <path
                        d={d_fund}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                        strokeOpacity="0.9"
                      />
                    )}

                    {/* Total Air-gap Flux Density Waveform B(theta) */}
                    <path
                      d={d_total}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                      filter="url(#glowFlux)"
                    />

                    {/* Hover Crosshair & Probe Dot */}
                    {hoveredFluxPoint && (
                      <g>
                        {/* Vertical line indicator */}
                        <line
                          x1={scaleX(hoveredFluxPoint.mechAngleDeg)}
                          y1={padT}
                          x2={scaleX(hoveredFluxPoint.mechAngleDeg)}
                          y2={padT + iH}
                          stroke="#e2e8f0"
                          strokeWidth="1.2"
                          strokeDasharray="3 3"
                          strokeOpacity="0.75"
                        />

                        {/* Total B marker dot */}
                        <circle
                          cx={scaleX(hoveredFluxPoint.mechAngleDeg)}
                          cy={scaleY(hoveredFluxPoint.totalFluxDensityTesla)}
                          r="5"
                          fill="#22d3ee"
                          stroke="#020617"
                          strokeWidth="2"
                        />

                        {/* Fundamental B1 marker dot */}
                        {showFundWave && (
                          <circle
                            cx={scaleX(hoveredFluxPoint.mechAngleDeg)}
                            cy={scaleY(hoveredFluxPoint.fundamentalTesla)}
                            r="3"
                            fill="#10b981"
                            stroke="#020617"
                            strokeWidth="1"
                          />
                        )}
                      </g>
                    )}
                  </svg>

                  {/* Floating Crosshair Hover Callout */}
                  {hoveredFluxPoint && (
                    <div
                      className="absolute pointer-events-none bg-slate-900/95 border border-cyan-500/60 shadow-2xl rounded-lg p-2.5 text-[11px] font-mono text-slate-200 z-30 transition-all backdrop-blur-sm"
                      style={{
                        left: `${Math.min(
                          75,
                          Math.max(8, (hoveredFluxPoint.mechAngleDeg / maxAngle) * 100)
                        )}%`,
                        top: '10px',
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 font-bold text-white border-b border-slate-800 pb-1 mb-1">
                        <span className="text-cyan-400">
                          θ = {hoveredFluxPoint.mechAngleDeg}°m ({hoveredFluxPoint.elecAngleDeg}°e)
                        </span>
                        <span className="text-emerald-400">
                          B = {hoveredFluxPoint.totalFluxDensityTesla} T
                        </span>
                      </div>
                      <div className="space-y-0.5 text-slate-300 text-[10px]">
                        <div className="flex justify-between gap-4">
                          <span className="text-emerald-400">Fundamental B₁:</span>
                          <span>{hoveredFluxPoint.fundamentalTesla} T</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-amber-400">Rotor Envelope:</span>
                          <span>{hoveredFluxPoint.rotorEnvelopeTesla} T</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-slate-400">Permeance Ratio λ:</span>
                          <span>{hoveredFluxPoint.permeanceRatio}x</span>
                        </div>
                        <div className="flex justify-between gap-4 pt-0.5 border-t border-slate-800/80">
                          <span className="text-slate-400">Stator Position:</span>
                          <span
                            className={
                              hoveredFluxPoint.isOverSlotOpening
                                ? 'text-amber-400 font-bold'
                                : 'text-slate-200'
                            }
                          >
                            {hoveredFluxPoint.isOverSlotOpening
                              ? `Slot #${hoveredFluxPoint.nearestSlotIndex} Opening (Permeance Dip)`
                              : `Tooth #${hoveredFluxPoint.nearestSlotIndex} Iron Peak`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Visual Color Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-0.5 bg-cyan-400 inline-block shadow-sm shadow-cyan-400" />
                  <span>Total Resulting B(θ) with Slot Permeance</span>
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-0.5 bg-emerald-400 border-t border-dashed border-emerald-400 inline-block" />
                  <span>Fundamental Working Wave B₁(θ)</span>
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-3 h-0.5 bg-amber-400 border-t border-dashed border-amber-400 inline-block" />
                  <span>Rotor MMF / Magnet Shape</span>
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2.5 h-2.5 bg-amber-500/20 border border-amber-500/50 inline-block rounded-sm" />
                  <span>Stator Slot Opening bs0 ({geom.slotOpeningWidthMm} mm)</span>
                </span>
              </div>

              <span className="text-[10px] text-cyan-400 font-mono">
                Probe ray live-synced with CAD cross-section above
              </span>
            </div>
          </div>

          {/* Spatial Field Harmonics Decomposition & Verification Matrix */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                Spatial Field Harmonics Verification Matrix (Air-gap Field Spectrum)
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Spatial THD = {airgapFluxResult.thdPct}% | Fundamental Bg,1 = {airgapFluxResult.bgFundamentalTesla} T
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {airgapFluxResult.spatialHarmonics.map((sh) => {
                const isSelected = selectedSpatialHarmonic?.name === sh.name;
                return (
                  <div
                    key={sh.name}
                    onClick={() => setSelectedSpatialHarmonic(isSelected ? null : sh)}
                    className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500 ring-1 ring-cyan-500/50'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-bold text-white font-mono">
                      <span>ν = {sh.orderElec}</span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          sh.isSlotHarmonic
                            ? 'bg-amber-400'
                            : sh.orderElec === 1
                            ? 'bg-emerald-400'
                            : 'bg-cyan-400'
                        }`}
                      />
                    </div>

                    <div className="mt-1 font-mono">
                      <div className="text-sm font-bold text-cyan-300">
                        {sh.amplitudeTesla} <span className="text-[9px] text-slate-500 font-normal">T</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-sans">
                        {sh.relativePct}% <span className="text-slate-500 text-[9px]">B₁</span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden mt-1.5 border border-slate-800">
                      <div
                        className={`h-full rounded-full ${
                          sh.isSlotHarmonic
                            ? 'bg-amber-400'
                            : sh.orderElec === 1
                            ? 'bg-emerald-400'
                            : 'bg-cyan-400'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(3, sh.relativePct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Harmonic Physical Engineering Drawer */}
            {selectedSpatialHarmonic && (
              <div className="p-3 bg-slate-950 rounded-lg border border-cyan-500/40 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-300 font-mono flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    {selectedSpatialHarmonic.name} Physical Origin & Impact:
                  </span>
                  <span className="font-mono text-slate-300 text-[11px]">
                    Amplitude = {selectedSpatialHarmonic.amplitudeTesla} T ({selectedSpatialHarmonic.relativePct}% of B₁)
                  </span>
                </div>
                <p className="text-slate-300 font-sans leading-relaxed text-[11px]">
                  {selectedSpatialHarmonic.origin}.{' '}
                  {selectedSpatialHarmonic.isSlotHarmonic
                    ? 'Slot ripple harmonics produce acoustic rotor noise (NVH) and high-frequency EMI. Mitigation: Applying 1.0 slot pitch stator helical skewing attenuates this component by >25 dB.'
                    : selectedSpatialHarmonic.orderElec === 5 || selectedSpatialHarmonic.orderElec === 7
                    ? 'The 5th and 7th space harmonics create 6th electrical torque ripple and rotor eddy-current losses. Mitigation: Chording stator coils with 5/6 coil pitch substantially eliminates these harmonics.'
                    : selectedSpatialHarmonic.orderElec === 3
                    ? 'The 3rd spatial harmonic stems from rotor pole-arc flatness. Mitigation: Shaping rotor pole shoe contours or optimizing magnet pole arc ratio (alpha_p ~ 0.74) eliminates triplen harmonics.'
                    : 'Fundamental electromagnetic working wave driving synchronous torque production.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
