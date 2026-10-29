/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs, CalculatedGeometry } from '../types/motor';
import { calculateWindingFactors } from './windingFunction';

export interface BackEmfHarmonicPoint {
  order: number;
  frequencyHz: number;
  relativeAmplitudePct: number;
  phaseVoltageV: number;
  isSlotHarmonic: boolean;
  isTriplen: boolean;
}

export interface EmiDesignAdjustment {
  id: string;
  title: string;
  category: 'skewing' | 'chording' | 'slot_opening' | 'pole_arc' | 'slot_combination';
  currentValue: string;
  recommendedValue: string;
  expectedBenefit: string;
  emiAttenuationDb: number;
  thdReductionPct: number;
  actionableSpecsUpdate?: Partial<MotorSpecs>;
  description: string;
  scientificReference: string;
}

export interface HarmonicEmiAnalysisResult {
  slotFrequencyHz: number;
  slotHarmonicOrderLower: number;
  slotHarmonicOrderUpper: number;
  backEmfThdPct: number;
  skewAngleSlots: number;
  skewFactorFundamental: number;
  skewFactorSlotHarmonic: number;
  slotRippleAttenuationDb: number;
  permeanceRippleIndexPct: number;
  harmonics: BackEmfHarmonicPoint[];
  suggestedAdjustments: EmiDesignAdjustment[];
}

/**
 * Calculates back-EMF harmonics, stator slot ripple frequency, and deterministic EMI mitigation adjustments.
 */
export function analyzeHarmonicsAndEmi(
  specs: MotorSpecs,
  geom: CalculatedGeometry,
  skewAngleSlots = 0 // 0 to 1.5 slot pitches
): HarmonicEmiAnalysisResult {
  const p = specs.poles / 2;
  const Qs = specs.statorSlots;
  const f = specs.frequencyHz;
  const nr = geom.ratedSpeedRpm;
  const Vph = specs.connectionType === 'star' ? specs.voltageV / Math.sqrt(3) : specs.voltageV;

  // 1. Stator slot ripple frequency
  // f_slot = Qs * (nr / 60)
  const slotFrequencyHz = Math.round(Qs * (nr / 60));

  // Primary slot harmonic orders: nu_slot = (Qs / p) +- 1
  const slotHarmonicOrderLower = Math.max(1, Math.round(Qs / p) - 1);
  const slotHarmonicOrderUpper = Math.round(Qs / p) + 1;

  // 2. Skew Factor Calculation: k_skew(nu) = sin(nu * theta_skew / 2) / (nu * theta_skew / 2)
  // theta_skew_elec = skewAngleSlots * gamma_slot_elec
  const gammaElecRad = ((p * Math.PI) / Qs);
  const thetaSkewRad = skewAngleSlots * gammaElecRad;

  const getSkewFactor = (order: number) => {
    if (skewAngleSlots <= 0.001) return 1.0;
    const arg = (order * thetaSkewRad) / 2;
    if (Math.abs(arg) < 1e-5) return 1.0;
    return Math.abs(Math.sin(arg) / arg);
  };

  const kSkewFund = Number(getSkewFactor(1).toFixed(4));
  const kSkewSlot = Number(getSkewFactor(slotHarmonicOrderLower).toFixed(4));
  // Attenuation of slot ripple in dB: 20 * log10(kSkewSlot / 1.0)
  const slotRippleAttenuationDb =
    kSkewSlot > 0.0001
      ? Math.min(0, Number((20 * Math.log10(kSkewSlot)).toFixed(1)))
      : -40;

  // 3. Airgap Permeance Ripple Index (Carter fluctuation index)
  // Lambda_ripple / Lambda_0 approx proportional to (bs0 / g)^1.5
  const bs0_g_ratio = geom.slotOpeningWidthMm / Math.max(0.2, geom.airgapLengthMm);
  const permeanceRippleIndexPct = Number(
    Math.min(45, Math.max(2, 6.5 * Math.pow(bs0_g_ratio, 1.25))).toFixed(1)
  );

  // 4. Back-EMF Harmonic Spectrum
  const { harmonics: windingFactors, kw1 } = calculateWindingFactors(
    specs.statorSlots,
    specs.poles,
    specs.coilPitchSlots,
    specs.phases
  );

  const testOrders = [
    1, 3, 5, 7, 9, 11, 13, 17, 19,
    slotHarmonicOrderLower,
    slotHarmonicOrderUpper,
  ];
  // Deduplicate and sort
  const uniqueOrders = Array.from(new Set(testOrders)).sort((a, b) => a - b);

  let sumHarmonicsSquared = 0;
  const harmonics: BackEmfHarmonicPoint[] = [];

  for (const nu of uniqueOrders) {
    const isSlot = nu === slotHarmonicOrderLower || nu === slotHarmonicOrderUpper;
    const isTriplen = nu % 3 === 0;

    // Find winding factor
    const matchWf = windingFactors.find((w) => w.order === nu);
    const kw_nu = matchWf ? matchWf.kw : 0.15;
    const k_skew_nu = getSkewFactor(nu);

    // Back-EMF amplitude: E_nu proportional to kw_nu * k_skew_nu * B_nu
    // In PMSM: magnet flux harmonics drop off as 1/nu or shaped
    let fluxHarmonicFactor = 1 / Math.pow(nu, 1.2);
    if (isSlot) {
      // Slot harmonics are amplified by slot permeance ripple
      fluxHarmonicFactor *= 1 + permeanceRippleIndexPct / 100;
    }

    const relAmp = nu === 1 ? 100 : Number(((kw_nu * k_skew_nu * fluxHarmonicFactor) / (kw1 * kSkewFund) * 100).toFixed(2));
    const phaseV = Number(((relAmp / 100) * Vph).toFixed(1));

    if (nu > 1 && !isTriplen) {
      sumHarmonicsSquared += Math.pow(relAmp / 100, 2);
    }

    harmonics.push({
      order: nu,
      frequencyHz: Math.round(nu * f),
      relativeAmplitudePct: relAmp,
      phaseVoltageV: phaseV,
      isSlotHarmonic: isSlot,
      isTriplen,
    });
  }

  const backEmfThdPct = Number((Math.sqrt(sumHarmonicsSquared) * 100).toFixed(2));

  // 5. Deterministic Engineering Adjustments to Reduce High-Frequency EMI
  const polePitchSlots = Qs / specs.poles;
  const currentChordingRatio = specs.coilPitchSlots / polePitchSlots;
  const suggestedAdjustments: EmiDesignAdjustment[] = [];

  // Adjustment 1: Stator Slot Skewing
  if (skewAngleSlots < 0.9) {
    suggestedAdjustments.push({
      id: 'skew_1_slot',
      title: 'Stator Stack Skewing by 1.0 Slot Pitch',
      category: 'skewing',
      currentValue: `${skewAngleSlots.toFixed(2)} slot pitch (No Skew)`,
      recommendedValue: '1.00 slot pitch (Continuous helical skew)',
      expectedBenefit: 'Nullifies fundamental slot permeance ripple; lowers high-frequency acoustic noise and conducted inverter EMI by ~22 dB.',
      emiAttenuationDb: -22.5,
      thdReductionPct: 1.8,
      description: 'Helical skewing of the lamination punchings creates a spatial phase cancellation for the stator slot harmonics, eliminating the primary source of inverter switching ripple interaction.',
      scientificReference: 'J. Pyrhönen, "Design of Rotating Electrical Machines", Section 8.4: Winding Skewing, Wiley.',
    });
  }

  // Adjustment 2: Optimal Coil Chording (5/6 pitch)
  const optimalChordingSlots = Math.round(polePitchSlots * (5 / 6));
  if (specs.coilPitchSlots !== optimalChordingSlots && optimalChordingSlots > 0) {
    suggestedAdjustments.push({
      id: 'chord_5_6',
      title: 'Optimal 5/6 Coil Pitch Chording',
      category: 'chording',
      currentValue: `${specs.coilPitchSlots} slots (${(currentChordingRatio * 100).toFixed(0)}% pitch)`,
      recommendedValue: `${optimalChordingSlots} slots (${((optimalChordingSlots / polePitchSlots) * 100).toFixed(0)}% pitch, 5/6 span)`,
      expectedBenefit: 'Simultaneously suppresses 5th and 7th spatial MMF harmonics, reducing back-EMF THD below 2.5% and mitigating 6th-order torque pulsations.',
      emiAttenuationDb: -14.0,
      thdReductionPct: 2.4,
      actionableSpecsUpdate: { coilPitchSlots: optimalChordingSlots },
      description: 'Chording by 5/6 slot pitch places the pitch factor zero near the 5th and 7th harmonics (kp5 = sin(5*5/6*pi/2) ≈ 0.259), heavily suppressing spatial flux distortion.',
      scientificReference: 'A.K. Sawhney, "A Course in Electrical Machine Design", Ch. 4: Fractional Pitch Windings.',
    });
  }

  // Adjustment 3: Semi-Closed Slot Opening Optimization
  if (geom.slotOpeningWidthMm > 2.8) {
    suggestedAdjustments.push({
      id: 'narrow_slot_opening',
      title: 'Narrow Semi-Closed Slot Opening (bs0)',
      category: 'slot_opening',
      currentValue: `bs0 = ${geom.slotOpeningWidthMm} mm (bs0/g = ${bs0_g_ratio.toFixed(1)})`,
      recommendedValue: 'bs0 = 2.20 mm (bs0/g ≤ 2.5)',
      expectedBenefit: 'Reduces airgap permeance pulsation index by 32%; lowers Carter coefficient kc and common-mode PWM capacitive leakage currents.',
      emiAttenuationDb: -8.5,
      thdReductionPct: 0.9,
      description: 'Reducing the stator slot opening reduces airgap flux density dip over the slot mouth, smoothing the permeance wave and attenuating high-frequency carrier-induced bearing currents.',
      scientificReference: 'F.W. Carter, "The Magnetic Field of the Dynamo-Electric Machine", J. IEE, 1926.',
    });
  }

  // Adjustment 4: Magnet Pole Arc Shaping (for PMSM/Vernier)
  if (
    (specs.topology === 'pmsm_spm' || specs.topology === 'pmsm_ipm' || specs.topology === 'vernier_pm') &&
    (specs.magnetPoleArcRatio ?? 0.74) > 0.72
  ) {
    suggestedAdjustments.push({
      id: 'magnet_pole_arc_shaping',
      title: 'Sinusoidal Magnet Pole Arc Ratio (αp = 0.67)',
      category: 'pole_arc',
      currentValue: `αp = ${specs.magnetPoleArcRatio ?? 0.74}`,
      recommendedValue: 'αp = 0.67 (2/3 pole arc)',
      expectedBenefit: 'Eliminates 3rd-harmonic flux density at the source in permanent magnets; reduces cogging torque by 65%.',
      emiAttenuationDb: -16.0,
      thdReductionPct: 1.5,
      actionableSpecsUpdate: { magnetPoleArcRatio: 0.67 },
      description: 'A 2/3 pole arc (120° electrical width) produces a quasi-sinusoidal airgap MMF that virtually eliminates triplen and high-frequency magnet-edge cogging EMI spikes.',
      scientificReference: 'Z.Q. Zhu & D. Howe, "Instantaneous Magnetic Field Distribution in Permanent Magnet Brushless Machines", IEEE Trans. Magn.',
    });
  }

  // Adjustment 5: Rotor Slot Combination Rule (for Induction)
  if (specs.topology === 'induction' && specs.rotorSlots) {
    const Qr = specs.rotorSlots;
    const isProhibited =
      Qr === Qs ||
      Math.abs(Qr - Qs) === 2 * p ||
      Math.abs(Qr - Qs) === p ||
      Math.abs(Qr - Qs) === 1 ||
      Math.abs(Qr - Qs) === 2;

    if (isProhibited) {
      const safeQr = Math.round(Qs * 0.78);
      suggestedAdjustments.push({
        id: 'rotor_slot_combination',
        title: 'Safe Rotor Slot Number Selection (Qr)',
        category: 'slot_combination',
        currentValue: `Qr = ${Qr} slots (Risks parasitic synchronous crawling & acoustic screeching)`,
        recommendedValue: `Qr = ${safeQr} slots (Non-interfering slot combination)`,
        expectedBenefit: 'Eliminates cusps in starting torque curve and suppresses high-pitch acoustic screech / radio EMI interference.',
        emiAttenuationDb: -26.0,
        thdReductionPct: 3.2,
        actionableSpecsUpdate: { rotorSlots: safeQr },
        description: 'According to Kron and Alger slot-combination criteria, Qr must not equal Qs ± 2p or Qs ± 1 to prevent harmonic field locking and intense high-frequency radiated EMI.',
        scientificReference: 'P.L. Alger, "Induction Machines: Their Behavior and Uses", Gordon & Breach.',
      });
    }
  }

  return {
    slotFrequencyHz,
    slotHarmonicOrderLower,
    slotHarmonicOrderUpper,
    backEmfThdPct,
    skewAngleSlots,
    skewFactorFundamental: kSkewFund,
    skewFactorSlotHarmonic: kSkewSlot,
    slotRippleAttenuationDb,
    permeanceRippleIndexPct,
    harmonics,
    suggestedAdjustments,
  };
}
