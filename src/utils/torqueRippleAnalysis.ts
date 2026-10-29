/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs, CalculatedGeometry } from '../types/motor';
import { calculateWindingFactors } from './windingFunction';

export interface TorqueWaveformPoint {
  electricalAngleDeg: number;
  mechanicalAngleDeg: number;
  instantaneousTorqueNm: number;
  coggingTorqueNm: number;
  harmonicTorqueNm: number;
  meanTorqueNm: number;
}

export interface TorqueHarmonicComponent {
  id: string;
  orderName: string;
  harmonicOrder: number;
  frequencyHz: number;
  amplitudeNm: number;
  relativePct: number;
  source: 'stator_mmf_5_7' | 'stator_mmf_11_13' | 'slot_permeance' | 'cogging';
  description: string;
}

export interface TorqueRippleAnalysisResult {
  avgTorqueNm: number;
  maxTorqueNm: number;
  minTorqueNm: number;
  peakToPeakRippleNm: number;
  ripplePercentagePct: number;
  coggingTorquePeakNm: number;
  coggingRatioPct: number;
  coggingOrderLcm: number;
  coggingCyclesPerElecPeriod: number;
  dominantHarmonicOrder: number;
  skewAngleSlots: number;
  skewFactorSlotHarmonic: number;
  qualityRating: 'excellent' | 'good' | 'moderate' | 'elevated';
  qualityLabel: string;
  harmonicComponents: TorqueHarmonicComponent[];
  waveformPoints: TorqueWaveformPoint[];
  mitigationDirectives: {
    title: string;
    description: string;
    effectiveness: 'high' | 'medium' | 'low';
    actionable: boolean;
  }[];
}

/**
 * Calculates Greatest Common Divisor (GCD) using Euclidean algorithm.
 */
export function calculateGcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/**
 * Calculates Least Common Multiple (LCM).
 */
export function calculateLcm(a: number, b: number): number {
  const x = Math.abs(Math.round(a));
  const y = Math.abs(Math.round(b));
  if (x === 0 || y === 0) return 0;
  const gcd = calculateGcd(x, y);
  return Math.round((x * y) / gcd);
}

/**
 * Analytically simulates the instantaneous torque ripple waveform, cogging torque,
 * and harmonic spectrum for the motor under current electromagnetic loading and slot/pole geometry.
 */
export function analyzeTorqueRipple(
  specs: MotorSpecs,
  geom: CalculatedGeometry,
  skewAngleSlots = 0
): TorqueRippleAnalysisResult {
  const p = Math.max(1, specs.poles / 2);
  const Qs = Math.max(3, specs.statorSlots);
  const poles = specs.poles;
  const f_elec = specs.frequencyHz;
  const T_avg = Math.max(0.1, geom.ratedTorqueNm);

  // 1. Fundamental Cogging Frequency & Periodicity
  // Ncog = LCM(Qs, 2p) mechanical cycles per revolution
  const coggingOrderLcm = calculateLcm(Qs, poles);
  const coggingCyclesPerElecPeriod = Math.max(1, Math.round(coggingOrderLcm / p));

  // 2. Skew Attenuation Calculation
  // gamma_slot_elec = p * pi / Qs
  const gammaElecRad = (p * Math.PI) / Qs;
  const thetaSkewRad = skewAngleSlots * gammaElecRad;

  const getSkewFactor = (order: number) => {
    if (skewAngleSlots <= 0.001) return 1.0;
    const arg = (order * thetaSkewRad) / 2;
    if (Math.abs(arg) < 1e-5) return 1.0;
    return Math.abs(Math.sin(arg) / arg);
  };

  // 3. Winding Factors for MMF Space Harmonics
  const { harmonics: wfList, kw1 } = calculateWindingFactors(
    specs.statorSlots,
    specs.poles,
    specs.coilPitchSlots,
    specs.phases
  );

  const getWf = (order: number, fallback: number) => {
    const found = wfList.find((h) => h.order === order);
    return found ? found.kw : fallback;
  };

  const kw5 = getWf(5, 0.05);
  const kw7 = getWf(7, 0.04);
  const kw11 = getWf(11, 0.02);
  const kw13 = getWf(13, 0.015);

  const k_skew_fund = getSkewFactor(1);
  const k_skew_6 = getSkewFactor(6);
  const k_skew_12 = getSkewFactor(12);

  // Slot harmonic order in electrical reference
  const slotOrderElec = Math.max(2, Math.round((2 * Qs) / poles));
  const k_skew_slot = getSkewFactor(slotOrderElec);

  // Cogging skew factor
  const skewCogArg = (Math.PI * skewAngleSlots * coggingOrderLcm) / Qs;
  const k_skew_cog =
    skewAngleSlots <= 0.001
      ? 1.0
      : Math.abs(skewCogArg < 1e-4 ? 1.0 : Math.sin(skewCogArg) / skewCogArg);

  // 4. Physical Cogging Peak Calculation
  // Hanselman & Zhu analytical formulation:
  // T_cog_pk ~ (pi/4) * (Bg^2 / 2*mu0) * Dsi * L * (bs0 / g)^2 * (1 / Ncog) * k_skew_cog
  const mu0 = 4 * Math.PI * 1e-7;
  const Bg = Math.max(0.1, geom.airgapFluxDensityTesla);
  const Dsi_m = geom.statorBoreDiameterMm * 1e-3;
  const L_m = geom.coreLengthMm * 1e-3;
  const g_m = Math.max(0.2, geom.airgapLengthMm) * 1e-3;
  const bs0_m = Math.max(0.5, geom.slotOpeningWidthMm) * 1e-3;
  const slotRatio = Math.min(6, bs0_m / g_m);

  // Base magnetic energy pulsation factor
  const magneticPressure = (Bg * Bg) / (2 * mu0); // J/m³ or N/m²
  const baseCoggingAmp =
    (0.08 * magneticPressure * Dsi_m * L_m * Math.pow(slotRatio, 1.4)) /
    Math.pow(coggingOrderLcm, 0.85);

  const coggingTorquePeakNm = Number(
    Math.max(0.001, baseCoggingAmp * k_skew_cog).toFixed(3)
  );
  const coggingRatioPct = Number(((coggingTorquePeakNm / T_avg) * 100).toFixed(2));

  // 5. Harmonic Interaction Torque Components (6th, 12th, and Slot Harmonics)
  // 6th harmonic: interaction of fundamental with 5th and 7th space MMF harmonics
  // T6/Tavg ~ ((kw5/5 + kw7/7) / kw1) * saturation_factor
  const satFactor = Math.min(1.4, Math.max(0.8, geom.toothFluxDensityTesla / 1.5));
  const t6_ratio =
    (((kw5 / 5 + kw7 / 7) / Math.max(0.6, kw1)) * 0.45 * satFactor * k_skew_6);
  const amp_T6 = Number(Math.max(0.002, T_avg * t6_ratio).toFixed(3));

  // 12th harmonic: interaction of fundamental with 11th and 13th MMF harmonics
  const t12_ratio =
    (((kw11 / 11 + kw13 / 13) / Math.max(0.6, kw1)) * 0.35 * satFactor * k_skew_12);
  const amp_T12 = Number(Math.max(0.001, T_avg * t12_ratio).toFixed(3));

  // Slot harmonic torque ripple: slot permeance fluctuation (Carter effect)
  const permeanceIndex = Math.min(0.25, (geom.slotOpeningWidthMm / Math.max(0.3, geom.airgapLengthMm)) * 0.035);
  const amp_Tslot = Number(
    Math.max(0.001, T_avg * permeanceIndex * k_skew_slot).toFixed(3)
  );

  // 6. Generate Discrete Waveform Points Across One Full Electrical Cycle (0 to 360 deg)
  const steps = 72; // Every 5 electrical degrees
  const waveformPoints: TorqueWaveformPoint[] = [];

  let maxT = -Infinity;
  let minT = Infinity;

  // Phase angles to create realistic physical waveform interaction
  const phi6 = Math.PI / 4;
  const phi12 = Math.PI / 6;
  const phiSlot = Math.PI / 3;

  for (let i = 0; i <= steps; i++) {
    const theta_e_deg = (i / steps) * 360;
    const theta_e_rad = (theta_e_deg * Math.PI) / 180;
    const theta_mech_deg = theta_e_deg / p;

    // Harmonic torque component
    const t_harm =
      amp_T6 * Math.cos(6 * theta_e_rad + phi6) +
      amp_T12 * Math.cos(12 * theta_e_rad + phi12) +
      amp_Tslot * Math.cos(slotOrderElec * theta_e_rad + phiSlot);

    // Cogging torque component
    const cog_angle_rad = coggingCyclesPerElecPeriod * theta_e_rad;
    const t_cog =
      coggingTorquePeakNm * Math.sin(cog_angle_rad) +
      0.28 * coggingTorquePeakNm * Math.sin(2 * cog_angle_rad);

    // Instantaneous torque
    const t_inst = T_avg + t_harm + t_cog;

    if (t_inst > maxT) maxT = t_inst;
    if (t_inst < minT) minT = t_inst;

    waveformPoints.push({
      electricalAngleDeg: Math.round(theta_e_deg),
      mechanicalAngleDeg: Number(theta_mech_deg.toFixed(2)),
      instantaneousTorqueNm: Number(t_inst.toFixed(3)),
      coggingTorqueNm: Number(t_cog.toFixed(3)),
      harmonicTorqueNm: Number(t_harm.toFixed(3)),
      meanTorqueNm: Number(T_avg.toFixed(3)),
    });
  }

  const peakToPeakRippleNm = Number((maxT - minT).toFixed(3));
  const ripplePercentagePct = Number(((peakToPeakRippleNm / T_avg) * 100).toFixed(2));

  // Determine dominant harmonic order
  let dominantOrder = 6;
  let maxAmp = amp_T6;
  if (amp_T12 > maxAmp) {
    dominantOrder = 12;
    maxAmp = amp_T12;
  }
  if (amp_Tslot > maxAmp) {
    dominantOrder = slotOrderElec;
    maxAmp = amp_Tslot;
  }
  if (coggingTorquePeakNm > maxAmp) {
    dominantOrder = coggingCyclesPerElecPeriod;
  }

  // Determine quality rating
  let qualityRating: 'excellent' | 'good' | 'moderate' | 'elevated' = 'good';
  let qualityLabel = 'Good (Standard Industrial Drive Grade)';

  if (ripplePercentagePct <= 3.2) {
    qualityRating = 'excellent';
    qualityLabel = 'Excellent (Precision Servo & EV Traction Grade)';
  } else if (ripplePercentagePct <= 6.5) {
    qualityRating = 'good';
    qualityLabel = 'Good (Standard Industrial Drive Grade)';
  } else if (ripplePercentagePct <= 11.5) {
    qualityRating = 'moderate';
    qualityLabel = 'Moderate (Noticeable Ripple / Acoustic Pulsation)';
  } else {
    qualityRating = 'elevated';
    qualityLabel = 'Elevated (Severe Torque Ripple - Skewing/Chording Required)';
  }

  // 7. Harmonic Components List
  const harmonicComponents: TorqueHarmonicComponent[] = [
    {
      id: 'harm_6',
      orderName: '6th Electrical (6·fe)',
      harmonicOrder: 6,
      frequencyHz: Math.round(6 * f_elec),
      amplitudeNm: amp_T6,
      relativePct: Number(((amp_T6 / T_avg) * 100).toFixed(2)),
      source: 'stator_mmf_5_7',
      description: 'Result of 5th and 7th spatial stator MMF harmonics interacting with rotor magnetic field.',
    },
    {
      id: 'harm_12',
      orderName: '12th Electrical (12·fe)',
      harmonicOrder: 12,
      frequencyHz: Math.round(12 * f_elec),
      amplitudeNm: amp_T12,
      relativePct: Number(((amp_T12 / T_avg) * 100).toFixed(2)),
      source: 'stator_mmf_11_13',
      description: 'Result of 11th and 13th spatial stator MMF harmonics interacting with fundamental flux.',
    },
    {
      id: 'harm_slot',
      orderName: `Slot Order (${slotOrderElec}·fe)`,
      harmonicOrder: slotOrderElec,
      frequencyHz: Math.round(slotOrderElec * f_elec),
      amplitudeNm: amp_Tslot,
      relativePct: Number(((amp_Tslot / T_avg) * 100).toFixed(2)),
      source: 'slot_permeance',
      description: 'Stator slotting permeance modulation (Carter airgap dipping effect).',
    },
    {
      id: 'harm_cog',
      orderName: `Cogging Fundamental (${coggingCyclesPerElecPeriod}·fe / ${coggingOrderLcm}·mech)`,
      harmonicOrder: coggingCyclesPerElecPeriod,
      frequencyHz: Math.round((coggingOrderLcm * geom.ratedSpeedRpm) / 60),
      amplitudeNm: coggingTorquePeakNm,
      relativePct: coggingRatioPct,
      source: 'cogging',
      description: `Rotor-slot magnetic reluctance interaction: LCM(${Qs}, ${poles}) = ${coggingOrderLcm} pulses/rev.`,
    },
  ];

  // 8. Actionable Engineering Directives for Torque Ripple & Cogging Mitigation
  const mitigationDirectives = [
    {
      title: 'Stator Helical Skewing (1.0 Slot Pitch)',
      description:
        skewAngleSlots >= 0.95
          ? 'Optimal 1.0 slot pitch skew is currently applied, filtering slot permeance ripple and attenuating cogging torque by >25 dB.'
          : 'Applying 1.0 slot pitch continuous helical skewing provides theoretical null for fundamental slot harmonic and heavily suppresses cogging torque.',
      effectiveness: 'high' as const,
      actionable: skewAngleSlots < 0.95,
    },
    {
      title: 'Fractional Pitch / Chording (5/6 Pitch)',
      description:
        specs.coilPitchSlots < specs.statorSlots / specs.poles
          ? 'Short-pitch (chorded) winding is active, attenuating the 5th and 7th space harmonics and suppressing the 6th electrical torque ripple.'
          : 'Coil pitch is currently full-pitch (1.0). Chording by 1 slot pitch (e.g. 5/6 coil span) drastically minimizes 5th and 7th harmonics.',
      effectiveness: 'high' as const,
      actionable: specs.coilPitchSlots >= specs.statorSlots / specs.poles,
    },
    {
      title: 'Stator Slot Opening Optimization (bs0 / g)',
      description: `Current slot opening is ${geom.slotOpeningWidthMm} mm with airgap ${geom.airgapLengthMm} mm (ratio = ${slotRatio.toFixed(1)}). Reducing bs0 or utilizing semi-magnetic slot wedges decreases airgap permeance ripple by ${(slotRatio > 3 ? 35 : 15)}%.`,
      effectiveness: 'medium' as const,
      actionable: slotRatio > 2.5,
    },
    {
      title: 'Slot-Pole Combination Reluctance Optimization',
      description: `Current slot-pole ratio Qs/2p = ${Qs}/${poles} yields LCM(${Qs}, ${poles}) = ${coggingOrderLcm}. High LCM combinations distribute reluctance torque pulses across finer angles, inherently lowering cogging torque.`,
      effectiveness: 'medium' as const,
      actionable: false,
    },
  ];

  return {
    avgTorqueNm: Number(T_avg.toFixed(2)),
    maxTorqueNm: Number(maxT.toFixed(2)),
    minTorqueNm: Number(minT.toFixed(2)),
    peakToPeakRippleNm,
    ripplePercentagePct,
    coggingTorquePeakNm,
    coggingRatioPct,
    coggingOrderLcm,
    coggingCyclesPerElecPeriod,
    dominantHarmonicOrder: dominantOrder,
    skewAngleSlots,
    skewFactorSlotHarmonic: Number(k_skew_slot.toFixed(3)),
    qualityRating,
    qualityLabel,
    harmonicComponents,
    waveformPoints,
    mitigationDirectives,
  };
}
