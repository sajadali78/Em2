/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs, CalculatedGeometry } from '../types/motor';
import { calculateWindingFactors } from './windingFunction';

export interface FluxDensityPoint {
  mechAngleDeg: number;
  elecAngleDeg: number;
  totalFluxDensityTesla: number; // B(theta) with slot permeance modulation
  fundamentalTesla: number;      // B1(theta)
  rotorEnvelopeTesla: number;    // Brotor(theta) without slotting
  permeanceRatio: number;        // lambda(theta)
  nearestSlotIndex: number;
  isOverSlotOpening: boolean;
}

export interface SpatialHarmonicPoint {
  orderElec: number;
  orderMech: number;
  name: string;
  amplitudeTesla: number;
  relativePct: number;
  isSlotHarmonic: boolean;
  origin: string;
}

export interface AirgapFluxDensityResult {
  bgFundamentalTesla: number;
  bgPeakTesla: number;
  bgAverageTesla: number;
  poleArcFactorAlpha: number;
  carterCoefficient: number;
  carterDipDepthPct: number;
  slotOpeningRatio: number; // bs0 / g
  thdPct: number;
  spatialHarmonics: SpatialHarmonicPoint[];
  fullWaveformPoints: FluxDensityPoint[];      // 0 to 360 deg mechanical
  poleWaveformPoints: FluxDensityPoint[];      // 0 to 180 deg electrical (1 pole pitch)
  twoPoleWaveformPoints: FluxDensityPoint[];   // 0 to 360 deg electrical (2 pole pitches)
}

/**
 * Analytically computes the 2D air-gap flux density distribution B(theta) around the motor periphery,
 * accounting for rotor MMF/magnet field distribution, space harmonics, and stator slot permeance modulation (Carter effect).
 */
export function calculateAirgapFluxDensity(
  specs: MotorSpecs,
  geom: CalculatedGeometry
): AirgapFluxDensityResult {
  const p = Math.max(1, specs.poles / 2);
  const Qs = Math.max(3, specs.statorSlots);
  const Bg = Math.max(0.1, geom.airgapFluxDensityTesla);
  const kc = Math.max(1.01, geom.carterCoefficient ?? 1.15);
  const g_mm = Math.max(0.2, geom.airgapLengthMm);
  const bs0_mm = Math.max(0.5, geom.slotOpeningWidthMm);
  const slotRatio = bs0_mm / g_mm;

  // Carter slot permeance dip amplitude beta:
  // beta = 0.5 * (1 - 1 / sqrt(1 + (bs0 / (2*g))^2))
  const u = slotRatio / 2;
  const beta = Math.min(0.45, Math.max(0.08, 0.5 * (1 - 1 / Math.sqrt(1 + u * u))));
  const carterDipDepthPct = Number((beta * 100).toFixed(1));

  // Winding factors for space harmonics
  const { harmonics: wfList, kw1 } = calculateWindingFactors(
    specs.statorSlots,
    specs.poles,
    specs.coilPitchSlots,
    specs.phases
  );

  const getWf = (order: number, fallback: number) => {
    const item = wfList.find((h) => h.order === order);
    return item ? item.kw : fallback;
  };

  const kw5 = getWf(5, 0.05);
  const kw7 = getWf(7, 0.04);
  const kw11 = getWf(11, 0.02);
  const kw13 = getWf(13, 0.015);

  // Slot harmonic orders in electrical reference: (Qs / p) +- 1
  const slotHarmLower = Math.max(1, Math.round(Qs / p) - 1);
  const slotHarmUpper = Math.round(Qs / p) + 1;

  // Synthesize points across 360 mechanical degrees
  const totalSteps = 360; // 1 step = 1 mechanical degree
  const fullWaveformPoints: FluxDensityPoint[] = [];

  const slotPitchMechDeg = 360 / Qs;
  const slotOpeningHalfDeg = (bs0_mm / (Math.PI * geom.statorBoreDiameterMm)) * 180;

  let maxB = 0;
  let sumBabs = 0;

  for (let i = 0; i <= totalSteps; i++) {
    const theta_m_deg = (i / totalSteps) * 360;
    const theta_m_rad = (theta_m_deg * Math.PI) / 180;
    const theta_e_deg = theta_m_deg * p;
    const theta_e_rad = theta_m_rad * p;

    // 1. Rotor MMF / Magnet waveform envelope Brotor(theta)
    let b_rotor = 0;
    let b_fund = Bg * Math.sin(theta_e_rad);

    if (specs.topology === 'pmsm_spm' || specs.topology === 'pmsm_ipm') {
      // Surface PM / Interior PM: Fourier series of pole arc magnet distribution
      const alpha_p = specs.magnetPoleArcRatio ?? 0.74;
      const orders = [1, 3, 5, 7, 9, 11, 13];
      for (const n of orders) {
        // Flat-topped magnet distribution harmonic amplitude
        const cn = (4 / (Math.PI * n)) * Math.sin((n * alpha_p * Math.PI) / 2);
        const term = Bg * cn * Math.sin(n * theta_e_rad);
        b_rotor += term;
      }
    } else {
      // Induction / Synchronous machine: Distributed winding MMF space harmonics
      b_rotor =
        Bg * Math.sin(theta_e_rad) -
        (Bg * 0.18 * (kw5 / (5 * Math.max(0.6, kw1)))) * Math.sin(5 * theta_e_rad) +
        (Bg * 0.14 * (kw7 / (7 * Math.max(0.6, kw1)))) * Math.sin(7 * theta_e_rad) -
        (Bg * 0.08 * (kw11 / (11 * Math.max(0.6, kw1)))) * Math.sin(11 * theta_e_rad) +
        (Bg * 0.06 * (kw13 / (13 * Math.max(0.6, kw1)))) * Math.sin(13 * theta_e_rad);
    }

    // 2. Stator Slot Permeance Modulation lambda(theta_m)
    // Dips at slot openings: theta_m = k * (2*pi / Qs)
    const slotAngleRad = Qs * theta_m_rad;
    // Permeance fluctuation
    const lambda = 1 - beta * Math.cos(slotAngleRad) - 0.22 * beta * Math.cos(2 * slotAngleRad);
    const permeanceRatio = Number((lambda / (1 / kc)).toFixed(3));

    // 3. Total Airgap Flux Density: B(theta) = Brotor * (lambda / kc_avg)
    // Scale by 1/kc to maintain fundamental flux integral
    const b_total = (b_rotor * lambda) / kc;

    // Check slot opening proximity
    const nearestSlot = Math.round(theta_m_deg / slotPitchMechDeg) % Qs;
    const distToSlotCenterDeg = Math.abs(theta_m_deg - nearestSlot * slotPitchMechDeg);
    const isOverOpening = distToSlotCenterDeg <= slotOpeningHalfDeg * 1.2;

    const absB = Math.abs(b_total);
    if (absB > maxB) maxB = absB;
    sumBabs += absB;

    fullWaveformPoints.push({
      mechAngleDeg: Number(theta_m_deg.toFixed(1)),
      elecAngleDeg: Number((theta_e_deg % 360).toFixed(1)),
      totalFluxDensityTesla: Number(b_total.toFixed(4)),
      fundamentalTesla: Number(b_fund.toFixed(4)),
      rotorEnvelopeTesla: Number(b_rotor.toFixed(4)),
      permeanceRatio,
      nearestSlotIndex: nearestSlot + 1,
      isOverSlotOpening: isOverOpening,
    });
  }

  const bgAverageTesla = Number((sumBabs / (totalSteps + 1)).toFixed(3));
  const bgPeakTesla = Number(maxB.toFixed(3));
  const poleArcFactorAlpha = Number((bgAverageTesla / Math.max(0.01, bgPeakTesla)).toFixed(3));

  // Subset for 1 Pole Pitch (0 to 180 deg electrical = 360 / (2p) deg mechanical)
  const onePoleMechDeg = 360 / specs.poles;
  const poleWaveformPoints = fullWaveformPoints.filter(
    (pt) => pt.mechAngleDeg <= onePoleMechDeg + 0.1
  );

  // Subset for 2 Pole Pitches (0 to 360 deg electrical = 720 / (2p) deg mechanical)
  const twoPoleMechDeg = (2 * 360) / specs.poles;
  const twoPoleWaveformPoints = fullWaveformPoints.filter(
    (pt) => pt.mechAngleDeg <= twoPoleMechDeg + 0.1
  );

  // Spatial Harmonic Spectrum Decomposition
  const b1 = Bg;
  const b3 = Number((Bg * 0.22 * (specs.topology?.includes('pmsm') ? 0.35 : 0.05)).toFixed(3));
  const b5 = Number((Bg * (kw5 / (5 * Math.max(0.6, kw1))) * 0.45).toFixed(3));
  const b7 = Number((Bg * (kw7 / (7 * Math.max(0.6, kw1))) * 0.38).toFixed(3));
  const b11 = Number((Bg * (kw11 / (11 * Math.max(0.6, kw1))) * 0.25).toFixed(3));
  const b13 = Number((Bg * (kw13 / (13 * Math.max(0.6, kw1))) * 0.2).toFixed(3));

  // Slot ripple harmonic amplitudes (slot harmonics)
  const b_slot1 = Number((Bg * beta * 0.42).toFixed(3));
  const b_slot2 = Number((Bg * beta * 0.36).toFixed(3));

  const spatialHarmonics: SpatialHarmonicPoint[] = [
    {
      orderElec: 1,
      orderMech: p,
      name: `Fundamental (ν = 1, ${p} pole-pairs)`,
      amplitudeTesla: Number(b1.toFixed(3)),
      relativePct: 100,
      isSlotHarmonic: false,
      origin: 'Main working air-gap magnetic flux wave',
    },
    {
      orderElec: 3,
      orderMech: 3 * p,
      name: `3rd Spatial (ν = 3, ${3 * p} poles)`,
      amplitudeTesla: b3,
      relativePct: Number(((b3 / b1) * 100).toFixed(1)),
      isSlotHarmonic: false,
      origin: 'Rotor magnet pole-arc flatness / triplen spatial distribution',
    },
    {
      orderElec: 5,
      orderMech: 5 * p,
      name: `5th Spatial (ν = 5, ${5 * p} poles)`,
      amplitudeTesla: b5,
      relativePct: Number(((b5 / b1) * 100).toFixed(1)),
      isSlotHarmonic: false,
      origin: 'Stator 5th space MMF harmonic (backward rotating)',
    },
    {
      orderElec: 7,
      orderMech: 7 * p,
      name: `7th Spatial (ν = 7, ${7 * p} poles)`,
      amplitudeTesla: b7,
      relativePct: Number(((b7 / b1) * 100).toFixed(1)),
      isSlotHarmonic: false,
      origin: 'Stator 7th space MMF harmonic (forward rotating)',
    },
    {
      orderElec: 11,
      orderMech: 11 * p,
      name: `11th Spatial (ν = 11, ${11 * p} poles)`,
      amplitudeTesla: b11,
      relativePct: Number(((b11 / b1) * 100).toFixed(1)),
      isSlotHarmonic: false,
      origin: 'Stator 11th space harmonic',
    },
    {
      orderElec: 13,
      orderMech: 13 * p,
      name: `13th Spatial (ν = 13, ${13 * p} poles)`,
      amplitudeTesla: b13,
      relativePct: Number(((b13 / b1) * 100).toFixed(1)),
      isSlotHarmonic: false,
      origin: 'Stator 13th space harmonic',
    },
    {
      orderElec: slotHarmLower,
      orderMech: slotHarmLower * p,
      name: `Slot Lower (ν = ${slotHarmLower})`,
      amplitudeTesla: b_slot1,
      relativePct: Number(((b_slot1 / b1) * 100).toFixed(1)),
      isSlotHarmonic: true,
      origin: `Stator slotting permeance modulation: (Qs/p - 1) = ${slotHarmLower}`,
    },
    {
      orderElec: slotHarmUpper,
      orderMech: slotHarmUpper * p,
      name: `Slot Upper (ν = ${slotHarmUpper})`,
      amplitudeTesla: b_slot2,
      relativePct: Number(((b_slot2 / b1) * 100).toFixed(1)),
      isSlotHarmonic: true,
      origin: `Stator slotting permeance modulation: (Qs/p + 1) = ${slotHarmUpper}`,
    },
  ];

  // Calculate Spatial Flux THD: sqrt(sum(Bn^2)) / B1
  const sumHarmSq =
    b3 * b3 +
    b5 * b5 +
    b7 * b7 +
    b11 * b11 +
    b13 * b13 +
    b_slot1 * b_slot1 +
    b_slot2 * b_slot2;
  const thdPct = Number(((Math.sqrt(sumHarmSq) / b1) * 100).toFixed(1));

  return {
    bgFundamentalTesla: Number(Bg.toFixed(3)),
    bgPeakTesla,
    bgAverageTesla,
    poleArcFactorAlpha,
    carterCoefficient: Number(kc.toFixed(3)),
    carterDipDepthPct,
    slotOpeningRatio: Number(slotRatio.toFixed(2)),
    thdPct,
    spatialHarmonics,
    fullWaveformPoints,
    poleWaveformPoints,
    twoPoleWaveformPoints,
  };
}
