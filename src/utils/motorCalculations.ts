/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MotorSpecs,
  CalculatedGeometry,
  TorqueSpeedCurvePoint,
  MaterialLimitsConfig,
} from '../types/motor';
import { calculateWindingFactors } from './windingFunction';
import { STEEL_GRADE_OPTIONS } from './materialLimits';

// Physical constants
const DENSITY_STEEL = 7700;    // kg / m³
const DENSITY_COPPER = 8900;   // kg / m³

export function calculateMotorGeometry(
  specs: MotorSpecs,
  materialConfig?: MaterialLimitsConfig
): CalculatedGeometry {
  const {
    powerKw,
    voltageV,
    frequencyHz,
    poles,
    phases = 3,
    targetEfficiency,
    targetPowerFactor,
    connectionType,
    specificMagneticLoading: Bav,
    specificElectricLoading: ac,
    aspectRatio: lambda,
    statorSlots: Qs,
    currentDensityA_mm2: J_target,
    slotFillFactor: kfill_target,
    coilPitchSlots,
    statorYokeMaxFluxTesla: targetBys,
    statorToothMaxFluxTesla: targetBts,
    stackingFactor: kfe,
    topology,
  } = specs;

  // 1. Winding factors
  const { kw1, q } = calculateWindingFactors(Qs, poles, coilPitchSlots, phases);

  // 2. Synchronous & Rated Speeds
  const ns_arm = (120 * frequencyHz) / poles; // Synchronous speed of armature field in rpm
  const ns_rps = ns_arm / 60; // Revolutions per second (fundamental to classical D²L output equation)

  let nr: number;
  let ns: number;
  let vernierGearRatio: number | undefined;
  let rotorPolesPr: number | undefined;
  const fluxModulationFactor = specs.fluxModulationFactor ?? 0.55;

  if (topology === 'vernier_pm') {
    const ps = poles / 2;
    const pr = specs.rotorPolesPr ? specs.rotorPolesPr / 2 : Math.max(1, Qs - ps);
    rotorPolesPr = pr * 2;
    vernierGearRatio = Number((pr / ps).toFixed(2));
    ns = ns_arm;
    nr = ns_arm / vernierGearRatio;
  } else if (topology === 'induction') {
    ns = ns_arm;
    const slip = (specs.ratedSlipPercent ?? 2.8) / 100;
    nr = ns * (1 - slip);
  } else {
    // Standard PMSM / Wound Field
    ns = ns_arm;
    nr = ns_arm;
  }

  const omegaM = (2 * Math.PI * Math.max(1, nr)) / 60;
  const ratedTorqueNm = (powerKw * 1000) / Math.max(0.1, omegaM);

  // 3. Apparent Power & Output Coefficient
  const eta0 = targetEfficiency / 100;
  const cosPhi0 = targetPowerFactor;
  const S_kVA = powerKw / (eta0 * cosPhi0); // Output kVA

  // C0 = 11 * kw * Bav * ac * 10^-3 [kVA / (m³ * rps)] - classical Sawhney / Say formulation
  const C0 = 11 * kw1 * Bav * ac * 1e-3;

  // Machine active sizing volume:
  // In classical textbook formulation (A.K. Sawhney, Eq. 4.1, J. Pyrhönen Eq. 6.4):
  // Q = C0 * D² * L * n_rps
  // => D²L = Q / (C0 * n_rps) [m³]
  const effectiveSpeedRps = topology === 'vernier_pm' ? ns_rps * fluxModulationFactor : ns_rps;
  const D2L = S_kVA / (Math.max(0.01, C0) * effectiveSpeedRps);

  // Aspect ratio: lambda = L / tau, where tau = pi * D / poles
  // D²L = (lambda * pi / poles) * D³
  // => D = ( (D²L * poles) / (lambda * pi) )^(1/3)
  const D_m = Math.cbrt((D2L * poles) / (lambda * Math.PI));
  const D_mm = D_m * 1000;
  const tau_m = (Math.PI * D_m) / poles;
  const tau_mm = tau_m * 1000;
  const L_m = lambda * tau_m;
  const L_mm = L_m * 1000;

  // 4. Stator Currents
  let ratedCurrentA: number;
  let phaseCurrentA: number;

  if (connectionType === 'star') {
    ratedCurrentA = (powerKw * 1000) / (Math.sqrt(3) * voltageV * eta0 * cosPhi0);
    phaseCurrentA = ratedCurrentA;
  } else {
    // Delta
    ratedCurrentA = (powerKw * 1000) / (Math.sqrt(3) * voltageV * eta0 * cosPhi0);
    phaseCurrentA = ratedCurrentA / Math.sqrt(3);
  }

  // 5. Magnetic Flux per Pole
  const magneticFluxPerPoleWb = Bav * tau_m * L_m * (2 / Math.PI);

  // 6. Turns per phase and Conductor Sizing
  const Vph = connectionType === 'star' ? voltageV / Math.sqrt(3) : voltageV;
  const Eph = 0.96 * Vph;
  const rawNph = Eph / (4.44 * frequencyHz * magneticFluxPerPoleWb * kw1);
  const rawZs = (2 * phases * rawNph) / Qs;
  let conductorsPerSlot = Math.max(2, Math.round(rawZs));
  if (conductorsPerSlot % 2 !== 0 && conductorsPerSlot > 1) {
    conductorsPerSlot += 1;
  }
  const turnsPerPhase = Math.round((conductorsPerSlot * Qs) / (2 * phases));

  // Conductor cross-section
  const parallelPaths = 1;
  const condCurrentA = phaseCurrentA / parallelPaths;
  const bareConductorAreaMm2 = condCurrentA / J_target;

  // 7. Stator Slot & Tooth Dimensions (Realistic Industrial Geometry)
  const slotPitchMm = (Math.PI * D_mm) / Qs;
  const toothFluxPerM = Bav * (slotPitchMm * 1e-3) * L_m;
  const toothWidthMm = Math.max(
    4.0,
    (toothFluxPerM / (targetBts * L_m * kfe)) * 1000
  );
  const actualToothFlux = toothFluxPerM / ((toothWidthMm * 1e-3) * L_m * kfe);

  // Required copper area per slot
  const slotCuAreaMm2 = conductorsPerSlot * bareConductorAreaMm2;
  const requiredSlotAreaMm2 = slotCuAreaMm2 / kfill_target;

  // Trapezoidal semi-closed slot geometry
  const slotOpeningWidthMm = Math.min(3.5, Math.max(2.2, slotPitchMm * 0.22));
  const slotOpeningDepthMm = 1.2;
  const slotWidthTopMm = Math.max(3.0, slotPitchMm - toothWidthMm);
  // Sizing slot depth hs to accommodate conductors and wedge
  const estimatedHsMm = Math.max(14, requiredSlotAreaMm2 / (slotWidthTopMm * 1.15) + 3.0);
  const slotPitchBottomMm = (Math.PI * (D_mm + 2 * estimatedHsMm)) / Qs;
  const slotWidthBottomMm = Math.max(3.5, slotPitchBottomMm - toothWidthMm);
  const slotAreaMm2 = ((slotWidthTopMm + slotWidthBottomMm) / 2) * estimatedHsMm;
  const actualSlotFillFactor = slotCuAreaMm2 / Math.max(1, slotAreaMm2);
  const actualCurrentDensityA_mm2 = condCurrentA / Math.max(0.01, bareConductorAreaMm2);

  // 8. Stator Yoke (Back-Iron) Depth
  const yokeFluxWb = magneticFluxPerPoleWb / 2;
  const statorYokeDepthMm = Math.max(
    12,
    (yokeFluxWb / (targetBys * L_m * kfe)) * 1000
  );
  const actualYokeFlux = yokeFluxWb / ((statorYokeDepthMm * 1e-3) * L_m * kfe);

  // Stator Outer Diameter
  const statorOuterDiameterMm = D_mm + 2 * estimatedHsMm + 2 * statorYokeDepthMm;

  // 9. Airgap & Carter's Coefficient
  let airgapLengthMm = 0.5;
  if (topology === 'induction') {
    airgapLengthMm = Math.max(0.35, 0.2 + 2 * Math.sqrt(D_m * L_m));
  } else if (topology === 'pmsm_spm' || topology === 'pmsm_ipm') {
    airgapLengthMm = Math.max(0.65, 0.7 + 0.3 * Math.sqrt(D_m));
  } else if (topology === 'vernier_pm') {
    airgapLengthMm = Math.max(0.45, 0.5 + 0.25 * Math.sqrt(D_m));
  } else {
    // Wound field
    airgapLengthMm = Math.max(1.2, 1.2 + 1.5 * D_m);
  }
  airgapLengthMm = Number(airgapLengthMm.toFixed(2));

  // Carter's coefficient
  const bs0_g = slotOpeningWidthMm / airgapLengthMm;
  const gamma_c = (4 / Math.PI) * (
    (bs0_g / 2) * Math.atan(bs0_g / 2) - Math.log(Math.sqrt(1 + Math.pow(bs0_g / 2, 2)))
  );
  const carterCoefficient = Math.min(
    1.45,
    Math.max(1.05, slotPitchMm / (slotPitchMm - gamma_c * airgapLengthMm))
  );
  const effectiveAirgapMm = Number((carterCoefficient * airgapLengthMm).toFixed(3));

  // 10. Rotor Dimensions
  const rotorOuterDiameterMm = D_mm - 2 * airgapLengthMm;
  const shaftDiameterMm = Number((0.26 * D_mm).toFixed(1));

  // Topology specifics
  let magnetWidthMm: number | undefined;
  let magnetThicknessActualMm: number | undefined;
  let rotorSlotPitchMm: number | undefined;
  let rotorBarHeightMm: number | undefined;
  let rotorBarWidthMm: number | undefined;
  let poleBodyWidthMm: number | undefined;
  let poleBodyHeightMm: number | undefined;

  if (topology === 'pmsm_spm' || topology === 'pmsm_ipm') {
    const poleArcRatio = specs.magnetPoleArcRatio ?? 0.74;
    magnetWidthMm = Number((poleArcRatio * tau_mm).toFixed(1));
    magnetThicknessActualMm = specs.magnetThicknessMm ?? 4.0;
  } else if (topology === 'vernier_pm') {
    const poleArcRatio = specs.magnetPoleArcRatio ?? 0.80;
    const rotorPolePitchMm = (Math.PI * rotorOuterDiameterMm) / (rotorPolesPr ?? 60);
    magnetWidthMm = Number((poleArcRatio * rotorPolePitchMm).toFixed(1));
    magnetThicknessActualMm = specs.magnetThicknessMm ?? 3.8;
  } else if (topology === 'induction') {
    const Qr = specs.rotorSlots ?? Math.round(Qs * 0.8);
    rotorSlotPitchMm = (Math.PI * rotorOuterDiameterMm) / Qr;
    rotorBarHeightMm = Number((estimatedHsMm * 0.75).toFixed(1));
    rotorBarWidthMm = Number((rotorSlotPitchMm * 0.38).toFixed(1));
  } else if (topology === 'wound_field') {
    poleBodyWidthMm = Number((0.45 * tau_mm).toFixed(1));
    poleBodyHeightMm = Number((0.35 * tau_mm).toFixed(1));
  }

  // 11. Material-Dependent Copper Losses (Temperature & Frequency AC Resistance)
  const insulationClass = materialConfig?.insulation ?? 'class_f_155';
  let defaultCopperTemperatureC = 115;
  if (insulationClass === 'class_b_130') defaultCopperTemperatureC = 95;
  if (insulationClass === 'class_h_180') defaultCopperTemperatureC = 140;

  // Operating temperature can be simulated dynamically via customWindingTemperatureC
  const copperTemperatureC =
    materialConfig?.customWindingTemperatureC !== undefined
      ? materialConfig.customWindingTemperatureC
      : defaultCopperTemperatureC;

  // Reference copper properties: rho20 = 0.017241 Ohm*mm²/m, alpha_cu = 0.00393 / °C (IEC 60034-1)
  const rho20 = 0.017241;
  const alphaCu = 0.00393;

  // Temperature-dependent copper resistivity: rho(T) = rho20 * (1 + alpha * (T - 20))
  const copperResistivityOhm_mm2_m = Number(
    (rho20 * (1 + alphaCu * (copperTemperatureC - 20))).toFixed(5)
  );

  const endTurnLengthMm = 1.35 * tau_mm + 40;
  const halfTurnLengthMm = L_mm + endTurnLengthMm;
  const totalCoilLengthMm = 2 * halfTurnLengthMm * turnsPerPhase;
  const bareCuArea = Math.max(0.1, bareConductorAreaMm2);

  // Cold reference resistance at 20°C and standard test reference at 75°C (IEEE 112)
  const statorResistance20COhm = Number(
    ((rho20 * (totalCoilLengthMm * 1e-3)) / bareCuArea).toFixed(4)
  );
  const statorResistance75COhm = Number(
    ((rho20 * (1 + alphaCu * (75 - 20)) * (totalCoilLengthMm * 1e-3)) / bareCuArea).toFixed(4)
  );

  const statorResistancePerPhaseOhm = Number(
    ((copperResistivityOhm_mm2_m * (totalCoilLengthMm * 1e-3)) / bareCuArea).toFixed(4)
  );
  const resistanceIncreasePercent = Number(
    (((statorResistancePerPhaseOhm - statorResistance20COhm) / statorResistance20COhm) * 100).toFixed(1)
  );

  // AC skin & proximity effect multiplier: kac(f)
  // kac increases with frequency squared and slot depth
  const freqRatio50 = frequencyHz / 50;
  const acResistanceFactorKac = Number(
    (1.0 + 0.04 * Math.pow(freqRatio50, 1.4) * (estimatedHsMm / 25)).toFixed(3)
  );

  const statorCopperLossDcW = 3 * Math.pow(phaseCurrentA, 2) * statorResistancePerPhaseOhm;
  const statorCopperLossW = statorCopperLossDcW * acResistanceFactorKac;
  const statorCopperLossAcW = statorCopperLossW - statorCopperLossDcW;

  // 12. Rotor Losses
  let rotorLossW = 0;
  if (topology === 'induction') {
    const slip = (specs.ratedSlipPercent ?? 2.8) / 100;
    const Pag = powerKw * 1000 + (powerKw * 1000 * slip) / (1 - slip);
    rotorLossW = slip * Pag;
  } else if (topology === 'pmsm_spm' || topology === 'pmsm_ipm') {
    rotorLossW = powerKw * 1000 * 0.0075 * Math.pow(freqRatio50, 0.5);
  } else if (topology === 'vernier_pm') {
    rotorLossW = powerKw * 1000 * 0.012 * Math.pow(freqRatio50, 0.6);
  } else {
    // Wound field excitation loss
    const If = specs.fieldCurrentA ?? 12;
    const Rf = 8.5;
    rotorLossW = Math.pow(If, 2) * Rf;
  }

  // 13. Material-Dependent Core Iron Loss (Bertotti Segregation: Hysteresis + Eddy)
  const steelGradeId = materialConfig?.steelGrade ?? 'm400_50a';
  const steelOption =
    STEEL_GRADE_OPTIONS.find((s) => s.id === steelGradeId) ?? STEEL_GRADE_OPTIONS[0];
  const specificIronLossW_kg = steelOption.specificLossW_kg;

  // Bertotti decomposition coefficients at 50 Hz, 1.5 T:
  // Hysteresis loss kh is linear with f; Eddy loss ke is quadratic with f²
  let kh_w_kg = 2.1;
  let ke_w_kg = 1.7;

  if (steelGradeId === 'm270_35a') {
    kh_w_kg = 1.7;
    ke_w_kg = 0.9;
  } else if (steelGradeId === 'no20_thin') {
    kh_w_kg = 1.4;
    ke_w_kg = 0.4;
  } else if (steelGradeId === 'vacoflux_50') {
    kh_w_kg = 1.5;
    ke_w_kg = 0.7;
  }

  const statorToothVolumeM3 =
    Qs * (toothWidthMm * 1e-3) * (estimatedHsMm * 1e-3) * L_m * kfe;
  const statorToothMassKg = statorToothVolumeM3 * DENSITY_STEEL;

  const yokeMeanDiameterM = (statorOuterDiameterMm - statorYokeDepthMm) * 1e-3;
  const statorYokeVolumeM3 =
    Math.PI * yokeMeanDiameterM * (statorYokeDepthMm * 1e-3) * L_m * kfe;
  const statorYokeMassKg = statorYokeVolumeM3 * DENSITY_STEEL;

  const totalActiveSteelWeightKg = Number(
    ((statorToothMassKg + statorYokeMassKg) * 1.75).toFixed(1)
  );

  const totalCopperVolumeM3 =
    3 * (totalCoilLengthMm * 1e-3) * (bareConductorAreaMm2 * 1e-6);
  const totalCopperWeightKg = Number((totalCopperVolumeM3 * DENSITY_COPPER).toFixed(1));

  // Compute hysteresis and eddy current losses separately across teeth and yoke
  const toothBfactor = Math.pow(actualToothFlux / 1.5, 2.0);
  const yokeBfactor = Math.pow(actualYokeFlux / 1.5, 2.0);

  const toothHystW = kh_w_kg * freqRatio50 * toothBfactor * statorToothMassKg * 1.35;
  const toothEddyW = ke_w_kg * Math.pow(freqRatio50, 2.0) * toothBfactor * statorToothToothMassAdjust(statorToothMassKg);

  const yokeHystW = kh_w_kg * freqRatio50 * yokeBfactor * statorYokeMassKg * 1.25;
  const yokeEddyW = ke_w_kg * Math.pow(freqRatio50, 2.0) * yokeBfactor * statorYokeMassKg * 1.25;

  const ironCoreHysteresisLossW = Math.round(toothHystW + yokeHystW);
  const ironCoreEddyLossW = Math.round(toothEddyW + yokeEddyW);
  const teethIronLossW = Math.round(toothHystW + toothEddyW);
  const yokeIronLossW = Math.round(yokeHystW + yokeEddyW);
  const ironCoreLossW = teethIronLossW + yokeIronLossW;

  // Mechanical and Stray losses
  const mechanicalLossW = Math.round(0.012 * (powerKw * 1000) * Math.pow(Math.max(1, nr) / 1500, 1.5));
  const strayLoadLossW = Math.round(0.01 * (powerKw * 1000) * Math.pow(freqRatio50, 0.4));

  const totalLossW =
    Math.round(statorCopperLossW) +
    Math.round(rotorLossW) +
    ironCoreLossW +
    mechanicalLossW +
    strayLoadLossW;

  const calculatedEfficiency = Number(
    ((powerKw * 1000) / (powerKw * 1000 + totalLossW) * 100).toFixed(2)
  );

  // Torque and Power density
  const activeCoreVolumeM3 = Math.PI * Math.pow(statorOuterDiameterMm * 1e-3 / 2, 2) * L_m;
  const powerDensityKw_m3 = Number((powerKw / Math.max(1e-5, activeCoreVolumeM3)).toFixed(1));
  const torqueDensityNm_m3 = Number(
    (ratedTorqueNm / Math.max(1e-5, activeCoreVolumeM3)).toFixed(1)
  );

  // Breakdown & Starting Torque
  const breakdownTorqueNm = Number(
    (ratedTorqueNm * (topology === 'vernier_pm' ? 1.95 : 2.45)).toFixed(1)
  );
  const startingTorqueNm = Number(
    (topology === 'induction' ? ratedTorqueNm * 1.85 : ratedTorqueNm * 2.8).toFixed(1)
  );

  return {
    outputCoefficientC0: Number(C0.toFixed(3)),
    apparentPowerKva: Number(S_kVA.toFixed(2)),
    synchronousSpeedRpm: Math.round(ns),
    ratedSpeedRpm: Math.round(nr),
    ratedTorqueNm: Number(ratedTorqueNm.toFixed(1)),
    breakdownTorqueNm,
    startingTorqueNm,
    ratedCurrentA: Number(ratedCurrentA.toFixed(1)),
    phaseCurrentA: Number(phaseCurrentA.toFixed(1)),

    // Geometry
    polePitchMm: Number(tau_mm.toFixed(1)),
    statorBoreDiameterMm: Number(D_mm.toFixed(1)),
    coreLengthMm: Number(L_mm.toFixed(1)),
    statorOuterDiameterMm: Number(statorOuterDiameterMm.toFixed(1)),
    airgapLengthMm,
    effectiveAirgapMm,
    carterCoefficient: Number(carterCoefficient.toFixed(3)),
    rotorOuterDiameterMm: Number(rotorOuterDiameterMm.toFixed(1)),
    shaftDiameterMm,

    // Slot & Tooth
    slotPitchMm: Number(slotPitchMm.toFixed(2)),
    toothWidthMm: Number(toothWidthMm.toFixed(2)),
    slotWidthTopMm: Number(slotWidthTopMm.toFixed(2)),
    slotWidthBottomMm: Number(slotWidthBottomMm.toFixed(2)),
    slotDepthMm: Number(estimatedHsMm.toFixed(1)),
    slotAreaMm2: Number(slotAreaMm2.toFixed(1)),
    statorYokeDepthMm: Number(statorYokeDepthMm.toFixed(1)),
    slotOpeningWidthMm: Number(slotOpeningWidthMm.toFixed(2)),
    slotOpeningDepthMm,

    // Flux
    magneticFluxPerPoleWb: Number(magneticFluxPerPoleWb.toFixed(4)),
    airgapFluxDensityTesla: Number(Bav.toFixed(3)),
    toothFluxDensityTesla: Number(actualToothFlux.toFixed(3)),
    yokeFluxDensityTesla: Number(actualYokeFlux.toFixed(3)),

    // Winding
    slotsPerPolePerPhase: q,
    distributionFactorKd: Number(kw1.toFixed(4)),
    pitchFactorKp: 1.0,
    windingFactorKw: kw1,
    turnsPerPhase,
    conductorsPerSlot,
    parallelPaths,
    bareConductorAreaMm2: Number(bareConductorAreaMm2.toFixed(3)),
    actualCurrentDensityA_mm2: Number(actualCurrentDensityA_mm2.toFixed(2)),
    actualSlotFillFactor: Number(actualSlotFillFactor.toFixed(3)),
    endTurnLengthMm: Number(endTurnLengthMm.toFixed(1)),
    totalCoilLengthMm: Number(totalCoilLengthMm.toFixed(0)),
    statorResistancePerPhaseOhm: Number(statorResistancePerPhaseOhm.toFixed(4)),
    statorResistance20COhm,
    statorResistance75COhm,
    resistanceIncreasePercent,
    acResistanceFactorKac,

    // Topology Specifics
    rotorSlotPitchMm,
    rotorBarHeightMm,
    rotorBarWidthMm,
    magnetWidthMm,
    magnetThicknessActualMm,
    poleBodyWidthMm,
    poleBodyHeightMm,
    vernierGearRatio,
    rotorPolesPr,
    fluxModulationFactor,

    // Losses & Performance (Extended with Material & Frequency Segregation)
    statorCopperLossW: Math.round(statorCopperLossW),
    statorCopperLossDcW: Math.round(statorCopperLossDcW),
    statorCopperLossAcW: Math.round(statorCopperLossAcW),
    copperTemperatureC,
    copperResistivityOhm_mm2_m,

    rotorLossW: Math.round(rotorLossW),
    ironCoreLossW,
    ironCoreHysteresisLossW,
    ironCoreEddyLossW,
    teethIronLossW,
    yokeIronLossW,
    specificIronLossW_kg,

    mechanicalLossW,
    strayLoadLossW,
    totalLossW,
    calculatedEfficiency,
    powerDensityKw_m3,
    torqueDensityNm_m3,
    totalActiveSteelWeightKg,
    totalCopperWeightKg,
  };
}

function statorToothToothMassAdjust(mass: number): number {
  return mass * 1.35;
}

/**
 * Computes dynamic points along the Torque-Speed curve.
 */
export function generateTorqueSpeedCurve(
  specs: MotorSpecs,
  geom: CalculatedGeometry,
  numPoints = 50
): TorqueSpeedCurvePoint[] {
  const points: TorqueSpeedCurvePoint[] = [];
  const nr = geom.ratedSpeedRpm;
  const Tn = geom.ratedTorqueNm;
  const Tmax = geom.breakdownTorqueNm;
  const topology = specs.topology;

  const maxSpeed = topology === 'induction' ? nr * 1.15 : nr * 1.8;

  for (let i = 0; i <= numPoints; i++) {
    const speed = (i / numPoints) * maxSpeed;
    const speedRatio = speed / Math.max(1, nr);
    let torque: number;
    let current: number;
    let eff: number;

    if (topology === 'induction') {
      const s = 1 - speed / geom.synchronousSpeedRpm;
      const s_max = 0.12;
      if (Math.abs(s) < 0.0001) {
        torque = 0;
      } else {
        torque = (2 * Tmax) / (s / s_max + s_max / s);
      }
      current = geom.ratedCurrentA * (0.35 + 5.5 * Math.max(0, Math.min(1, s)));
      eff = speedRatio > 0.05 && speedRatio < 1.05
        ? Math.max(10, geom.calculatedEfficiency * (1 - Math.pow(Math.abs(speedRatio - 0.97) / 0.97, 2)))
        : 0;
    } else {
      // Synchronous / PMSM / Vernier
      if (speed <= nr) {
        torque = Tn * 1.05;
        current = geom.ratedCurrentA * 1.02;
        eff = Math.min(
          geom.calculatedEfficiency,
          geom.calculatedEfficiency * Math.min(1, speed / (0.25 * nr))
        );
      } else {
        const fwFactor = nr / speed;
        torque = Tn * fwFactor;
        current = geom.ratedCurrentA;
        eff = Math.max(75, geom.calculatedEfficiency * fwFactor * 1.02);
      }
    }

    points.push({
      speedRpm: Math.round(speed),
      speedRatio: Number(speedRatio.toFixed(3)),
      torqueNm: Number(Math.max(0, torque).toFixed(1)),
      currentA: Number(current.toFixed(1)),
      efficiencyPct: Number(eff.toFixed(1)),
      powerFactor: Number((specs.targetPowerFactor * Math.min(1, 0.4 + 0.6 * (speed / Math.max(1, nr)))).toFixed(2)),
    });
  }

  return points;
}
