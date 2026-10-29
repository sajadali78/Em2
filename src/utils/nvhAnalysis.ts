/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs, CalculatedGeometry } from '../types/motor';

export interface RadialForceHarmonic {
  modeOrder: number; // Spatial mode r (0 = breathing, 2 = ovalization, 3 = triangular, 4 = quad)
  modeName: string;
  excitationFreqHz: number;
  naturalFreqHz: number;
  radialPressureKPa: number;
  statorDeformationMicrons: number;
  amplificationFactor: number;
  resonanceRisk: 'low' | 'moderate' | 'high';
}

export interface NvhAnalysisResult {
  peakRadialPressureKPa: number;
  peakRadialPressurePsi: number;
  averageRadialPressureKPa: number;
  lowestSpatialMode: number;
  poleSlotCombinationQuality: 'optimal' | 'moderate' | 'sensitive';
  statorNaturalFrequenciesHz: {
    mode0_breathing: number;
    mode2_oval: number;
    mode3_triangular: number;
    mode4_quad: number;
  };
  dominantExcitationFreqHz: number;
  estimatedSoundPressureLevelDba: number;
  noiseRating: 'quiet' | 'nominal' | 'elevated' | 'critical';
  yokeStiffnessRatio: number;
  radialHarmonics: RadialForceHarmonic[];
  mitigationAdvisories: string[];
}

/**
 * Analytical estimation of Maxwell radial force density, stator structural modal resonance,
 * and radiated acoustic noise (NVH) based on Jordan, Den Hartog, and Pyrhönen formulations.
 */
export function analyzeRadialForceAndNvh(
  specs: MotorSpecs,
  geom: CalculatedGeometry
): NvhAnalysisResult {
  const mu0 = 4 * Math.PI * 1e-7;

  // 1. Airgap Flux Density & Peak Maxwell Radial Stress
  // B(theta, t) peak
  const Bav = specs.specificMagneticLoading; // Average airgap flux density [T]
  const Bpeak = Math.min(2.1, Bav * 1.57); // Fundamental peak [T]
  // Peak radial electromagnetic pressure: p_r = B^2 / (2 * mu0)
  const peakRadialPressurePa = Math.pow(Bpeak, 2) / (2 * mu0);
  const peakRadialPressureKPa = Number((peakRadialPressurePa / 1000).toFixed(1));
  const peakRadialPressurePsi = Number((peakRadialPressureKPa * 0.145038).toFixed(1));
  const averageRadialPressureKPa = Number((peakRadialPressureKPa / 2).toFixed(1));

  // 2. Fundamental Frequencies
  const f_e = specs.frequencyHz; // Electrical fundamental frequency [Hz]
  const nr_rpm = geom.ratedSpeedRpm || 1450;
  const f_mech = nr_rpm / 60; // Mechanical rotation frequency [Hz]
  const f_2e = 2 * f_e; // Twice supply frequency (core 2*f_e electromagnetic vibration)
  const f_slot = specs.statorSlots * f_mech; // Stator slot passing frequency [Hz]

  // 3. Stator Structural Geometry & Natural Modal Frequencies (Jordan's Formulation)
  // Laminated electrical steel properties:
  const E_steel = 205e9; // Young's modulus [Pa]
  const rho_steel = 7650; // Steel density [kg/m³]
  const h_ys = (geom.statorYokeDepthMm || 25) / 1000; // Yoke depth [m]
  const D_bore = (geom.statorBoreDiameterMm || 150) / 1000; // Bore [m]
  const hs = (geom.slotDepthMm || 30) / 1000; // Slot depth [m]
  const Do = (geom.statorOuterDiameterMm || 250) / 1000; // Outer diameter [m]

  // Mean stator yoke radius: Rm = (Do + (D_bore + 2*hs)) / 4
  const Rm = (Do + (D_bore + 2 * hs)) / 4; // [m]
  const yokeStiffnessRatio = Number((h_ys / Rm).toFixed(3));

  // Moment of inertia of yoke section (per meter axial length): I = h_ys^3 / 12
  const I_yoke = Math.pow(h_ys, 3) / 12;
  const A_yoke = h_ys; // Area per meter length

  // Velocity of sound in steel ring: c_ring = sqrt(E / rho)
  const c_ring = Math.sqrt(E_steel / rho_steel); // ~5175 m/s

  // Ring modal natural frequencies:
  // Mode 0 (Breathing mode, uniform radial pulsation):
  // f_0 = (1 / (2*pi*Rm)) * sqrt(E / rho)
  const f_nat_0 = Math.round((1 / (2 * Math.PI * Rm)) * c_ring);

  // In-plane flexural bending natural frequencies (Mode r = 2, 3, 4):
  // f_r = (1 / (2*pi)) * sqrt(E * I_yoke / (rho * A_yoke * Rm^4)) * [r * (r^2 - 1) / sqrt(r^2 + 1)]
  const bendingBase = (1 / (2 * Math.PI)) * Math.sqrt((E_steel * I_yoke) / (rho_steel * A_yoke * Math.pow(Rm, 4)));

  const calcBendingFreq = (r: number) => {
    const factor = (r * (Math.pow(r, 2) - 1)) / Math.sqrt(Math.pow(r, 2) + 1);
    // Add damping and tooth mass loading correction (~0.85 reduction due to slot teeth added mass)
    return Math.round(bendingBase * factor * 0.85);
  };

  const f_nat_2 = calcBendingFreq(2); // Ovalizing mode
  const f_nat_3 = calcBendingFreq(3); // Triangular mode
  const f_nat_4 = calcBendingFreq(4); // Quad mode

  // 4. Pole-Slot Lowest Spatial Mode Order r_low
  // In balanced symmetrical machines, lowest non-zero spatial mode:
  // r_low = GCD(Qs, 2p) for integer slot, or GCD(Qs, p)
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const p = specs.poles / 2; // Pole pairs
  const r_low = Math.max(1, gcd(specs.statorSlots, specs.poles));

  let poleSlotCombinationQuality: 'optimal' | 'moderate' | 'sensitive' = 'optimal';
  if (r_low <= 2 && specs.poles > 2) {
    poleSlotCombinationQuality = 'sensitive'; // Vulnerable to low-order ovalization vibration
  } else if (r_low <= 4) {
    poleSlotCombinationQuality = 'moderate';
  }

  // 5. Dynamic Amplification & Stator Radial Deformation (Microns)
  // Dynamic amplification factor Q ~ 15 - 25 for laminated stator steel with structural damping
  const calcHarmonicResponse = (
    modeOrder: number,
    modeName: string,
    f_exc: number,
    f_nat: number,
    basePressureFrac: number
  ): RadialForceHarmonic => {
    const f_ratio = f_exc / Math.max(1, f_nat);
    const dampingZeta = 0.035; // 3.5% structural loss factor

    // Dynamic mechanical magnification factor: H = 1 / sqrt((1 - r^2)^2 + (2*zeta*r)^2)
    const H = 1 / Math.sqrt(Math.pow(1 - Math.pow(f_ratio, 2), 2) + Math.pow(2 * dampingZeta * f_ratio, 2));
    const effectiveH = Math.min(25, Number(H.toFixed(2)));

    // Static deformation: delta_r_static = p_r * Rm^2 / (E * h_ys) [m]
    const p_componentPa = peakRadialPressurePa * basePressureFrac;
    const staticDef_m = (p_componentPa * Math.pow(Rm, 2)) / (E_steel * h_ys * Math.pow(Math.max(1, modeOrder), 4));
    const dynamicDefMicrons = Number(((staticDef_m * effectiveH) * 1e6).toFixed(2));

    // Resonance risk assessment (within ±15% of natural frequency)
    const freqDiffPct = Math.abs(f_exc - f_nat) / f_nat;
    let resonanceRisk: 'low' | 'moderate' | 'high' = 'low';
    if (freqDiffPct < 0.08) resonanceRisk = 'high';
    else if (freqDiffPct < 0.20) resonanceRisk = 'moderate';

    return {
      modeOrder,
      modeName,
      excitationFreqHz: Math.round(f_exc),
      naturalFreqHz: f_nat,
      radialPressureKPa: Number((p_componentPa / 1000).toFixed(1)),
      statorDeformationMicrons: dynamicDefMicrons,
      amplificationFactor: effectiveH,
      resonanceRisk,
    };
  };

  const harmonics: RadialForceHarmonic[] = [
    calcHarmonicResponse(0, 'Mode 0 (Breathing Radial Pulse)', f_2e, f_nat_0, 0.45),
    calcHarmonicResponse(2, 'Mode 2 (Ovalizing 4-Node)', f_2e, f_nat_2, 0.35),
    calcHarmonicResponse(r_low, `Mode ${r_low} (Slot Ripple Beating)`, f_slot, calcBendingFreq(r_low), 0.25),
    calcHarmonicResponse(4, 'Mode 4 (Quadrilateral)', 4 * f_e, f_nat_4, 0.15),
  ];

  // 6. Sound Pressure Level (SPL at 1m in dBA) (Jordan & IEC 60034-9 formulation)
  // Max radial vibration velocity v_rms = 2 * pi * f * (delta_r / sqrt(2))
  const maxHarmonic = harmonics.reduce((prev, curr) =>
    curr.statorDeformationMicrons > prev.statorDeformationMicrons ? curr : prev
  );

  const v_rms = (2 * Math.PI * maxHarmonic.excitationFreqHz * (maxHarmonic.statorDeformationMicrons * 1e-6)) / Math.SQRT2;
  const frameSurfaceM2 = Math.PI * Do * (geom.coreLengthMm / 1000);
  const rho_air = 1.204; // kg/m³
  const c_air = 343; // m/s
  const acousticRadiationEfficiency = Math.min(1.0, Math.pow(maxHarmonic.excitationFreqHz / 1200, 2));

  // Radiated acoustic sound power: W_rad = rho * c * S * sigma * v_rms^2 [Watts]
  const soundPowerW = Math.max(1e-12, rho_air * c_air * frameSurfaceM2 * acousticRadiationEfficiency * Math.pow(v_rms, 2));
  // Sound Power Level SWL = 10 * log10(W / 1e-12)
  const swl = 10 * Math.log10(soundPowerW / 1e-12);
  // Free-field Sound Pressure Level at 1 meter: SPL ~ SWL - 10*log10(4*pi*r^2) ~ SWL - 11 dB
  // A-weighting correction at dominant frequency
  const aWeightingDb = maxHarmonic.excitationFreqHz >= 1000 && maxHarmonic.excitationFreqHz <= 3000 ? 1.2 : -2.5;
  const estimatedSoundPressureLevelDba = Number(Math.max(48, Math.min(98, swl - 11 + aWeightingDb)).toFixed(1));

  let noiseRating: 'quiet' | 'nominal' | 'elevated' | 'critical' = 'nominal';
  if (estimatedSoundPressureLevelDba < 65) noiseRating = 'quiet';
  else if (estimatedSoundPressureLevelDba < 76) noiseRating = 'nominal';
  else if (estimatedSoundPressureLevelDba < 84) noiseRating = 'elevated';
  else noiseRating = 'critical';

  // 7. Engineering Mitigation Advisories
  const advisories: string[] = [];
  const highRiskHarmonic = harmonics.find((h) => h.resonanceRisk === 'high');
  if (highRiskHarmonic) {
    advisories.push(
      `Resonance Critical: Excitation at ${highRiskHarmonic.excitationFreqHz} Hz matches stator natural ${highRiskHarmonic.modeName} (${highRiskHarmonic.naturalFreqHz} Hz) within 8%. Increase stator yoke depth hys to shift the natural frequency above the inverter operating range.`
    );
  }

  if (yokeStiffnessRatio < 0.18) {
    advisories.push(
      `Stator Yoke Stiffness Ratio (hys/Rm = ${yokeStiffnessRatio}) is below 0.20, increasing radial ovalization deflection. Thickening the stator yoke by 3-5 mm will attenuate Mode 2 vibration by ~35%.`
    );
  } else {
    advisories.push(
      `Stator Yoke Stiffness Ratio (hys/Rm = ${yokeStiffnessRatio}) satisfies Den Hartog stiffness guidelines (>0.18), providing strong resistance to radial ovalization deformation.`
    );
  }

  if (specs.coilPitchSlots === Math.round(specs.statorSlots / specs.poles)) {
    advisories.push(
      `Full-pitch coils generate strong 5th and 7th spatial flux waves, elevating radial Maxwell forces. Short-pitch chording to 5/6 coil pitch cancels 5th/7th radial stress waves.`
    );
  }

  advisories.push(
    `Slot ripple passing frequency at ${Math.round(f_slot)} Hz produces acoustic whining. Stator stack helical skewing (1.0 slot pitch) decouples the axial radial force phase and suppresses tooth-passing screech.`
  );

  return {
    peakRadialPressureKPa,
    peakRadialPressurePsi,
    averageRadialPressureKPa,
    lowestSpatialMode: r_low,
    poleSlotCombinationQuality,
    statorNaturalFrequenciesHz: {
      mode0_breathing: f_nat_0,
      mode2_oval: f_nat_2,
      mode3_triangular: f_nat_3,
      mode4_quad: f_nat_4,
    },
    dominantExcitationFreqHz: maxHarmonic.excitationFreqHz,
    estimatedSoundPressureLevelDba,
    noiseRating,
    yokeStiffnessRatio,
    radialHarmonics: harmonics,
    mitigationAdvisories: advisories,
  };
}
