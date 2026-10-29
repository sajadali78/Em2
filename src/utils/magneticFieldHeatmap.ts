/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs, CalculatedGeometry, ElectricalSteelGrade } from '../types/motor';
import { STEEL_GRADE_OPTIONS } from './materialLimits';

export interface SaturationHotspot {
  id: string;
  locationName: string;
  zone: 'tooth_root' | 'tooth_body' | 'tooth_tip' | 'yoke_interpoler' | 'rotor_surface';
  localFluxTesla: number;
  kneeTesla: number;
  saturationRatioPct: number;
  status: 'safe' | 'caution' | 'saturated';
  description: string;
  remedy: string;
  angleDeg: number;
}

export interface MagneticHeatmapResult {
  toothBodyFluxTesla: number;
  toothRootHotspotTesla: number;
  toothTipHotspotTesla: number;
  yokePeakFluxTesla: number;
  airgapPeakFluxTesla: number;
  steelKneeTesla: number;
  maxSteelRecommendedTesla: number;
  maxFluxInMachineTesla: number;
  maxSaturationRatioPct: number;
  overallMagneticStatus: 'linear' | 'moderate_saturation' | 'deep_saturation';
  saturatedVolumePct: number;
  hotspots: SaturationHotspot[];
  teethProfiles: {
    toothIndex: number;
    angleDeg: number;
    bodyFluxTesla: number;
    rootFluxTesla: number;
    tipFluxTesla: number;
    status: 'safe' | 'caution' | 'saturated';
  }[];
  yokeSectors: {
    sectorIndex: number;
    angleDeg: number;
    fluxTesla: number;
    status: 'safe' | 'caution' | 'saturated';
  }[];
}

// Magnetic color interpolation utility (0.0T Navy -> 1.0T Cyan -> 1.5T Green -> 1.7T Amber -> 1.9T Red -> 2.1T+ Magenta)
export function getMagneticColor(bVal: number, bKnee = 1.72): string {
  const norm = Math.max(0, Math.min(1.3, bVal / bKnee));
  if (norm < 0.45) return '#0f2942'; // Dark Blue / Low Flux
  if (norm < 0.70) return '#0284c7'; // Cyan / Nominal Airgap/Yoke
  if (norm < 0.88) return '#10b981'; // Green / Linear High Permeance
  if (norm < 1.00) return '#eab308'; // Yellow-Amber / Approaching Knee
  if (norm < 1.10) return '#f97316'; // Orange / Knee Saturation
  if (norm < 1.20) return '#ef4444'; // Red / Saturated Hotspot
  return '#d946ef';                  // Magenta / Deep Saturation Hotspot
}

/**
 * Computes localized cross-sectional magnetic flux densities, tooth/yoke bottlenecks,
 * and pinpoints saturation hot spots across the motor lamination geometry.
 */
export function calculateMagneticFieldHeatmap(
  specs: MotorSpecs,
  geom: CalculatedGeometry,
  steelGrade: ElectricalSteelGrade = 'm400_50a'
): MagneticHeatmapResult {
  const selectedSteel =
    STEEL_GRADE_OPTIONS.find((s) => s.id === steelGrade) ?? STEEL_GRADE_OPTIONS[0];
  const bKnee = selectedSteel.nominalKneeTesla;
  const bMaxRec = selectedSteel.maxRecommendedTesla;

  const p = Math.max(1, specs.poles / 2);
  const Qs = Math.max(3, specs.statorSlots);

  // Fundamental 1D magnetic loading from sizing equations
  const Bg = Math.max(0.1, geom.airgapFluxDensityTesla);
  const Bts = Math.max(0.2, geom.toothFluxDensityTesla);
  const Bys = Math.max(0.2, geom.yokeFluxDensityTesla);

  // 1. Stator Tooth Root Bottleneck & Tooth Tip Fringing
  // Stress concentration factor at tooth-yoke fillet: kt ~ 1.08 + 0.05 * (hs / bts)
  const hs_bts_ratio = geom.slotDepthMm / Math.max(1, geom.toothWidthMm);
  const kRoot = Math.min(1.22, Math.max(1.06, 1.06 + 0.03 * (hs_bts_ratio / 3)));
  const Bts_root = Number((Bts * kRoot).toFixed(3));

  // Tooth shoe tip corner concentration near slot opening bs0
  const kTip = Math.min(1.25, Math.max(1.05, 1.04 + 0.08 * (geom.slotOpeningWidthMm / Math.max(0.2, geom.airgapLengthMm) / 3)));
  const Bts_tip = Number((Bts * kTip).toFixed(3));

  // 2. Circumferential Modulation across Stator Teeth
  // Along the periphery, teeth under pole centers carry maximum radial flux |cos(p*theta)|
  const teethProfiles = [];
  const slotPitchDeg = 360 / Qs;

  for (let i = 0; i < Qs; i++) {
    const angleDeg = i * slotPitchDeg;
    const angleRad = (angleDeg * Math.PI) / 180;
    // Spatial modulation factor (accounting for fundamental + 3rd/5th spatial field)
    const poleSpatialMod = Math.max(0.35, Math.abs(Math.cos(p * angleRad)));

    const localBts = Number((Bts * (0.4 + 0.6 * poleSpatialMod)).toFixed(3));
    const localRoot = Number((Bts_root * (0.4 + 0.6 * poleSpatialMod)).toFixed(3));
    const localTip = Number((Bts_tip * (0.45 + 0.55 * poleSpatialMod)).toFixed(3));

    let status: 'safe' | 'caution' | 'saturated' = 'safe';
    if (localRoot >= bMaxRec || localTip >= bMaxRec) {
      status = 'saturated';
    } else if (localRoot >= bKnee || localTip >= bKnee) {
      status = 'caution';
    }

    teethProfiles.push({
      toothIndex: i + 1,
      angleDeg: Number(angleDeg.toFixed(1)),
      bodyFluxTesla: localBts,
      rootFluxTesla: localRoot,
      tipFluxTesla: localTip,
      status,
    });
  }

  // 3. Stator Yoke Circumferential Modulation
  // Yoke flux reaches maximum at inter-polar axes where flux from two adjacent poles merges into circumferential direction
  const numYokeSectors = Math.max(16, Qs);
  const yokeSectors = [];
  const yokeSectorStepDeg = 360 / numYokeSectors;

  for (let j = 0; j < numYokeSectors; j++) {
    const angleDeg = j * yokeSectorStepDeg;
    const angleRad = (angleDeg * Math.PI) / 180;
    // Inter-polar peak: sin(p*theta)
    const interpolarMod = Math.abs(Math.sin(p * angleRad));
    const localBys = Number((Bys * (0.3 + 0.7 * interpolarMod)).toFixed(3));

    let status: 'safe' | 'caution' | 'saturated' = 'safe';
    if (localBys >= bMaxRec) {
      status = 'saturated';
    } else if (localBys >= bKnee) {
      status = 'caution';
    }

    yokeSectors.push({
      sectorIndex: j + 1,
      angleDeg: Number(angleDeg.toFixed(1)),
      fluxTesla: localBys,
      status,
    });
  }

  // 4. Hotspots Identification
  const maxToothRoot = Math.max(...teethProfiles.map((t) => t.rootFluxTesla));
  const maxToothTip = Math.max(...teethProfiles.map((t) => t.tipFluxTesla));
  const maxYokeFlux = Math.max(...yokeSectors.map((y) => y.fluxTesla));
  const maxMachineFlux = Math.max(maxToothRoot, maxToothTip, maxYokeFlux);
  const maxSatRatioPct = Number(((maxMachineFlux / bKnee) * 100).toFixed(1));

  const hotspots: SaturationHotspot[] = [];

  // Tooth root hotspot
  const worstTooth = teethProfiles.reduce((p, c) => (c.rootFluxTesla > p.rootFluxTesla ? c : p));
  hotspots.push({
    id: 'hotspot_tooth_root',
    locationName: `Stator Tooth #${worstTooth.toothIndex} Root Fillet`,
    zone: 'tooth_root',
    localFluxTesla: maxToothRoot,
    kneeTesla: bKnee,
    saturationRatioPct: Number(((maxToothRoot / bKnee) * 100).toFixed(1)),
    status: maxToothRoot >= bMaxRec ? 'saturated' : maxToothRoot >= bKnee ? 'caution' : 'safe',
    description: `Flux turning bottleneck at the transition between stator tooth body (bts = ${geom.toothWidthMm} mm) and yoke ring. Stress concentration k = ${kRoot.toFixed(2)}x.`,
    remedy: 'Increase tooth width (bts) by 5-10% or select a higher saturation steel grade (e.g. M270-35A / Vacoflux 50).',
    angleDeg: worstTooth.angleDeg,
  });

  // Tooth tip hotspot
  hotspots.push({
    id: 'hotspot_tooth_tip',
    locationName: `Stator Tooth Shoe Corner (Near Slot Opening)`,
    zone: 'tooth_tip',
    localFluxTesla: maxToothTip,
    kneeTesla: bKnee,
    saturationRatioPct: Number(((maxToothTip / bKnee) * 100).toFixed(1)),
    status: maxToothTip >= bMaxRec ? 'saturated' : maxToothTip >= bKnee ? 'caution' : 'safe',
    description: `Airgap fringing and slot leakage flux concentration at the tooth tips adjacent to slot opening bs0 = ${geom.slotOpeningWidthMm} mm.`,
    remedy: 'Increase tooth shoe depth (hs0), decrease slot opening (bs0), or use magnetic slot wedges to redistribute fringing flux.',
    angleDeg: (worstTooth.angleDeg + slotPitchDeg * 0.4) % 360,
  });

  // Inter-polar yoke bottleneck hotspot
  const worstYoke = yokeSectors.reduce((p, c) => (c.fluxTesla > p.fluxTesla ? c : p));
  hotspots.push({
    id: 'hotspot_yoke_interpolar',
    locationName: `Stator Yoke Inter-Polar Bottleneck (θ = ${worstYoke.angleDeg}°)`,
    zone: 'yoke_interpoler',
    localFluxTesla: maxYokeFlux,
    kneeTesla: bKnee,
    saturationRatioPct: Number(((maxYokeFlux / bKnee) * 100).toFixed(1)),
    status: maxYokeFlux >= bMaxRec ? 'saturated' : maxYokeFlux >= bKnee ? 'caution' : 'safe',
    description: `Peak circumferential flux carrying half of main pole flux (Phi/2 = ${(geom.magneticFluxPerPoleWb * 500).toFixed(2)} mWb) across back-iron depth hys = ${geom.statorYokeDepthMm} mm.`,
    remedy: 'Enlarge stator outer diameter (Do) to deepen yoke depth (hys) or increase core stack length (L).',
    angleDeg: worstYoke.angleDeg,
  });

  // Volume of saturated iron estimation
  let satCount = 0;
  teethProfiles.forEach((t) => {
    if (t.rootFluxTesla >= bKnee) satCount++;
  });
  yokeSectors.forEach((y) => {
    if (y.fluxTesla >= bKnee) satCount++;
  });
  const totalChecked = teethProfiles.length + yokeSectors.length;
  const saturatedVolumePct = Number(((satCount / totalChecked) * 100).toFixed(1));

  let overallMagneticStatus: 'linear' | 'moderate_saturation' | 'deep_saturation' = 'linear';
  if (maxMachineFlux >= bMaxRec) {
    overallMagneticStatus = 'deep_saturation';
  } else if (maxMachineFlux >= bKnee) {
    overallMagneticStatus = 'moderate_saturation';
  }

  return {
    toothBodyFluxTesla: Bts,
    toothRootHotspotTesla: maxToothRoot,
    toothTipHotspotTesla: maxToothTip,
    yokePeakFluxTesla: maxYokeFlux,
    airgapPeakFluxTesla: Bg,
    steelKneeTesla: bKnee,
    maxSteelRecommendedTesla: bMaxRec,
    maxFluxInMachineTesla: maxMachineFlux,
    maxSaturationRatioPct: maxSatRatioPct,
    overallMagneticStatus,
    saturatedVolumePct,
    hotspots,
    teethProfiles,
    yokeSectors,
  };
}
