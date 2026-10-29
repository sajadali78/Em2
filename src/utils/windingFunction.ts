/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WindingHarmonic, WindingFunctionPoint, SlotCoilAllocation } from '../types/motor';

/**
 * Calculates fundamental and harmonic winding factors for a 3-phase AC machine.
 */
export function calculateWindingFactors(
  statorSlots: number,
  poles: number,
  coilPitchSlots: number,
  phases = 3
): {
  q: number;
  gammaDeg: number;
  kd1: number;
  kp1: number;
  kw1: number;
  harmonics: WindingHarmonic[];
  thdPct: number;
} {
  const q = statorSlots / (poles * phases);
  const gammaDeg = (poles * 180) / statorSlots; // Slot pitch electrical angle in degrees
  const gammaRad = (gammaDeg * Math.PI) / 180;
  const polePitchSlots = statorSlots / poles;

  // Pitch electrical angle: beta = (coilPitchSlots / polePitchSlots) * 180 deg
  const chordingRatio = coilPitchSlots / polePitchSlots;

  const harmonicOrders = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 23, 25];
  const harmonics: WindingHarmonic[] = [];

  for (const nu of harmonicOrders) {
    // Distribution factor kd(nu)
    const num = Math.sin((q * nu * gammaRad) / 2);
    const den = q * Math.sin((nu * gammaRad) / 2);
    const kd = Math.abs(den) > 1e-6 ? num / den : 1.0;

    // Pitch factor kp(nu) = sin(nu * chordingRatio * pi / 2)
    const kp = Math.sin((nu * chordingRatio * Math.PI) / 2);

    const kw = Math.abs(kd * kp);

    harmonics.push({
      order: nu,
      kd: Number(kd.toFixed(4)),
      kp: Number(kp.toFixed(4)),
      kw: Number(kw.toFixed(4)),
      relativeAmplitudePct: 0, // will compute after fundamental
    });
  }

  const fundamental = harmonics[0];
  const kw1 = fundamental.kw > 0 ? fundamental.kw : 0.95;

  let sumHarmonicsSquared = 0;
  harmonics.forEach((h) => {
    // Relative MMF amplitude is proportional to kw / order
    const relAmp = ((h.kw / h.order) / (kw1 / 1)) * 100;
    h.relativeAmplitudePct = Number(relAmp.toFixed(2));
    if (h.order > 1) {
      sumHarmonicsSquared += Math.pow(h.kw / h.order, 2);
    }
  });

  const thdPct = Number(((Math.sqrt(sumHarmonicsSquared) / kw1) * 100).toFixed(2));

  return {
    q: Number(q.toFixed(3)),
    gammaDeg: Number(gammaDeg.toFixed(2)),
    kd1: fundamental.kd,
    kp1: fundamental.kp,
    kw1: Number(kw1.toFixed(4)),
    harmonics,
    thdPct,
  };
}

/**
 * Generates the slot allocation table for a double-layer distributed winding.
 */
export function generateSlotAllocations(
  statorSlots: number,
  poles: number,
  coilPitchSlots: number,
  phases = 3
): SlotCoilAllocation[] {
  const allocations: SlotCoilAllocation[] = [];
  const slotElectricalAngleDeg = (poles * 180) / statorSlots;
  const q = statorSlots / (poles * phases);

  // Standard 60-degree phase belt sequence: +A, -C, +B, -A, +C, -B
  const phaseBelts: Array<{ phase: 'A' | 'B' | 'C'; polarity: 1 | -1 }> = [
    { phase: 'A', polarity: 1 },
    { phase: 'C', polarity: -1 },
    { phase: 'B', polarity: 1 },
    { phase: 'A', polarity: -1 },
    { phase: 'C', polarity: 1 },
    { phase: 'B', polarity: -1 },
  ];

  const topLayer: Array<{ phase: 'A' | 'B' | 'C'; polarity: 1 | -1 }> = [];

  for (let slot = 0; slot < statorSlots; slot++) {
    // Electrical angle in degrees modulo 360
    const elecAngle = (slot * slotElectricalAngleDeg) % 360;
    const beltIndex = Math.floor(elecAngle / 60) % 6;
    topLayer.push(phaseBelts[beltIndex]);
  }

  // Bottom layer is shifted by coilPitchSlots
  for (let slot = 0; slot < statorSlots; slot++) {
    const bottomSlotIndex = (slot - coilPitchSlots + statorSlots) % statorSlots;
    const top = topLayer[slot];
    // In standard lap winding, bottom coil side has opposite current direction of corresponding top side
    const bottomOrigin = topLayer[bottomSlotIndex];
    const bottom = {
      phase: bottomOrigin.phase,
      polarity: (-bottomOrigin.polarity) as (1 | -1),
    };

    allocations.push({
      slotNumber: slot + 1,
      slotMechanicalAngleDeg: Number(((slot * 360) / statorSlots).toFixed(2)),
      topLayerPhase: top.phase,
      topLayerPolarity: top.polarity,
      bottomLayerPhase: bottom.phase,
      bottomLayerPolarity: bottom.polarity,
    });
  }

  return allocations;
}

/**
 * Calculates the spatial turn distribution n_A(theta) and spatial winding function M_A(theta).
 * Based on discrete slot conductors across 360 electrical degrees.
 */
export function calculateWindingFunctionWaveform(
  allocations: SlotCoilAllocation[],
  poles: number,
  kw1: number,
  numSamples = 360
): WindingFunctionPoint[] {
  const points: WindingFunctionPoint[] = [];
  const statorSlots = allocations.length;
  const p = poles / 2;

  // Conductor density distribution for Phase A
  // Each slot has top and bottom layer conductors
  const slotAngleStep = 360 / statorSlots; // mechanical degrees per slot

  // Build slot conductor counts for Phase A
  const slotPhaseAConductors = allocations.map((alloc) => {
    let count = 0;
    if (alloc.topLayerPhase === 'A') count += alloc.topLayerPolarity;
    if (alloc.bottomLayerPhase === 'A') count += alloc.bottomLayerPolarity;
    return count;
  });

  // Sample along 360 electrical degrees (one pole pair = 360/p mechanical degrees)
  // For uniform visual display, sample over 1 mechanical period or 1 electrical period
  const samples: { elecDeg: number; mechDeg: number; rawTurns: number }[] = [];
  let cumulativeTurns = 0;

  // Discretize across 360 electrical degrees
  for (let i = 0; i < numSamples; i++) {
    const elecDeg = (i * 360) / numSamples;
    const mechDeg = elecDeg / p;

    // Find which slot we are currently in
    const currentSlot = Math.floor((mechDeg % 360) / slotAngleStep) % statorSlots;
    
    // Step accumulation at slot boundaries
    cumulativeTurns = 0;
    for (let s = 0; s <= currentSlot; s++) {
      cumulativeTurns += slotPhaseAConductors[s];
    }

    samples.push({
      elecDeg,
      mechDeg,
      rawTurns: cumulativeTurns,
    });
  }

  // Calculate the mean value of n_A(theta) to eliminate DC offset
  const meanTurns = samples.reduce((acc, s) => acc + s.rawTurns, 0) / samples.length;

  // Max peak for normalization
  const maxM = Math.max(1, ...samples.map((s) => Math.abs(s.rawTurns - meanTurns)));

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const windingFuncVal = s.rawTurns - meanTurns;
    const normalizedWindingFunc = windingFuncVal / maxM;

    // Ideal fundamental sine wave: M_1(theta) = kw1 * cos(theta_elec)
    const elecRad = (s.elecDeg * Math.PI) / 180;
    const fundamental = kw1 * Math.cos(elecRad - Math.PI / 6); // standard phase alignment

    points.push({
      electricalDegree: Number(s.elecDeg.toFixed(1)),
      mechanicalDegree: Number(s.mechDeg.toFixed(1)),
      turnsDistributionA: Number(s.rawTurns.toFixed(2)),
      windingFunctionA: Number(normalizedWindingFunc.toFixed(3)),
      fundamentalA: Number(fundamental.toFixed(3)),
    });
  }

  return points;
}
