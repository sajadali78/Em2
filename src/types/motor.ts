/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MotorTopology = 'induction' | 'pmsm_spm' | 'pmsm_ipm' | 'wound_field' | 'vernier_pm';

// Material specifications
export type CoolingMethod = 'ic01_open' | 'ic411_tefc' | 'ic71w_liquid';
export type InsulationClass = 'class_b_130' | 'class_f_155' | 'class_h_180';
export type ElectricalSteelGrade = 'm400_50a' | 'm270_35a' | 'no20_thin' | 'vacoflux_50';

export interface MaterialLimitsConfig {
  cooling: CoolingMethod;
  insulation: InsulationClass;
  steelGrade: ElectricalSteelGrade;
}

export interface MaterialValidationResult {
  currentDensityA_mm2: number;
  maxCurrentDensityA_mm2: number;
  currentDensityUtilizationPct: number;
  thermalStatus: 'nominal' | 'caution' | 'exceeded';
  
  toothFluxTesla: number;
  maxToothFluxTesla: number;
  toothFluxUtilizationPct: number;
  toothMagneticStatus: 'nominal' | 'caution' | 'exceeded';
  
  yokeFluxTesla: number;
  maxYokeFluxTesla: number;
  yokeFluxUtilizationPct: number;
  yokeMagneticStatus: 'nominal' | 'caution' | 'exceeded';

  overallStatus: 'nominal' | 'caution' | 'exceeded';
  mitigationNotes: string[];
}

export interface MotorSpecs {
  // Motor classification & topology
  id: string;
  name: string;
  topology: MotorTopology;
  description: string;

  // Primary Rated Requirements
  powerKw: number;              // Pn [kW]
  voltageV: number;              // Vn [V rms line-line]
  frequencyHz: number;           // f [Hz]
  poles: number;                 // Armature winding poles 2p_s (e.g., 2, 4, 6)
  phases: number;                // m (standard 3)
  targetEfficiency: number;      // Estimated initial efficiency [%]
  targetPowerFactor: number;     // Estimated cos(phi)
  connectionType: 'star' | 'delta';

  // Specific Loadings (Core of D²L method)
  specificMagneticLoading: number; // Bav [Tesla, 0.40 - 0.75 T]
  specificElectricLoading: number;  // ac [Ampere-conductors/m, 15,000 - 55,000 A/m]
  aspectRatio: number;              // lambda = L/tau (Length to pole-pitch ratio, 0.6 - 2.5)

  // Stator Core & Slot Constraints
  statorSlots: number;           // Qs (e.g., 24, 36, 48, 72)
  currentDensityA_mm2: number;   // J [A/mm², 3.5 - 7.5 A/mm²]
  slotFillFactor: number;        // kfill [0.35 - 0.45]
  coilPitchSlots: number;        // Coil span ys (in slot pitches)
  statorYokeMaxFluxTesla: number;// Target Bys [Tesla, 1.3 - 1.6 T]
  statorToothMaxFluxTesla: number;// Target Bts [Tesla, 1.4 - 1.8 T]
  stackingFactor: number;        // kfe [0.95 typ. laminated steel]

  // Topology-Specific Parameters
  // 1. Induction Motor
  rotorSlots?: number;           // Qr (for induction)
  rotorBarMaterial?: 'copper' | 'aluminum';
  ratedSlipPercent?: number;     // s [%]

  // 2. PMSM (SPM & IPM)
  magnetRemanenceBr?: number;    // Br [Tesla, NdFeB typ. 1.15 - 1.25 T]
  magnetCoercivityHc?: number;   // Hc [kA/m]
  magnetThicknessMm?: number;    // hm [mm]
  magnetPoleArcRatio?: number;   // alpha_p = bm/tau
  saliencyRatio?: number;        // Lq/Ld

  // 3. Wound Field Synchronous
  poleShoeArcRatio?: number;
  fieldWindingTurnsPerPole?: number;
  fieldCurrentA?: number;

  // 4. Vernier PM Motor (Flux Modulation Machine)
  rotorPolesPr?: number;         // Rotor magnet poles 2*p_r
  vernierGearRatio?: number;     // Gr = p_r / p_s
  fluxModulationFactor?: number; // k_mod
  splittingRatio?: number;       // D / Do
}

export interface CalculatedGeometry {
  // 1. Output Coefficient & Sizing Equation
  outputCoefficientC0: number;   // C0 [kVA/(m³·rpm) or kVA/(m³·rps)]
  apparentPowerKva: number;      // S [kVA]
  synchronousSpeedRpm: number;   // ns [rpm]
  ratedSpeedRpm: number;         // nr [rpm]
  ratedTorqueNm: number;         // Tn [N·m]
  breakdownTorqueNm: number;     // Tmax [N·m]
  startingTorqueNm: number;      // Tstart [N·m]
  ratedCurrentA: number;         // In [A]
  phaseCurrentA: number;         // Iph [A]

  // 2. Main Machine Geometry (D²L Results)
  polePitchMm: number;           // tau [mm]
  statorBoreDiameterMm: number;  // D [mm]
  coreLengthMm: number;          // L [mm]
  statorOuterDiameterMm: number; // Do [mm]
  airgapLengthMm: number;        // g [mm]
  effectiveAirgapMm: number;     // ge = kc * g [mm]
  carterCoefficient: number;     // kc
  rotorOuterDiameterMm: number;  // Dr = D - 2g [mm]
  shaftDiameterMm: number;       // Dsh [mm]

  // 3. Stator Slot & Tooth Dimensions
  slotPitchMm: number;           // tau_s [mm]
  toothWidthMm: number;          // bts [mm]
  slotWidthTopMm: number;        // bs1 [mm]
  slotWidthBottomMm: number;     // bs2 [mm]
  slotDepthMm: number;           // hs [mm]
  slotAreaMm2: number;           // Aslot [mm²]
  statorYokeDepthMm: number;     // hys [mm]
  slotOpeningWidthMm: number;    // bs0 [mm]
  slotOpeningDepthMm: number;    // hs0 [mm]

  // 4. Flux Densities & Magnetic Loading
  magneticFluxPerPoleWb: number; // Phi [Wb]
  airgapFluxDensityTesla: number;// Bg [T]
  toothFluxDensityTesla: number; // Bts [T]
  yokeFluxDensityTesla: number;  // Bys [T]

  // 5. Winding Sizing & Parameters
  slotsPerPolePerPhase: number;  // q = Qs / (2p * m)
  distributionFactorKd: number;  // kd
  pitchFactorKp: number;         // kp
  windingFactorKw: number;       // kw = kd * kp
  turnsPerPhase: number;         // Nph
  conductorsPerSlot: number;     // Zs
  parallelPaths: number;         // a
  bareConductorAreaMm2: number;  // acu [mm²]
  actualCurrentDensityA_mm2: number; // J_act [A/mm²]
  actualSlotFillFactor: number;  // kfill_act
  endTurnLengthMm: number;       // Lend [mm]
  totalCoilLengthMm: number;     // Lcoil [mm]
  statorResistancePerPhaseOhm: number; // Rs [Ohm at T_oper]
  acResistanceFactorKac: number; // kac(f) skin/proximity factor

  // 6. Rotor Topology Specific Geometry
  rotorSlotPitchMm?: number;
  rotorBarHeightMm?: number;
  rotorBarWidthMm?: number;
  magnetWidthMm?: number;
  magnetThicknessActualMm?: number;
  poleBodyWidthMm?: number;
  poleBodyHeightMm?: number;
  vernierGearRatio?: number;
  rotorPolesPr?: number;
  fluxModulationFactor?: number;

  // 7. Losses & Efficiency Synthesis (Extended with Material Grade & Frequency)
  statorCopperLossW: number;     // Total Pcu_s [W]
  statorCopperLossDcW: number;   // Pcu_dc [W]
  statorCopperLossAcW: number;   // Pcu_ac [W] (skin & proximity)
  copperTemperatureC: number;    // T_oper [°C]
  copperResistivityOhm_mm2_m: number; // rho(T) [Ohm*mm²/m]

  rotorLossW: number;            // Pcu_r or Pmag_loss [W]
  ironCoreLossW: number;         // Total Pfe [W]
  ironCoreHysteresisLossW: number;// Pfe,hysteresis [W]
  ironCoreEddyLossW: number;     // Pfe,eddy [W]
  teethIronLossW: number;        // Pfe_teeth [W]
  yokeIronLossW: number;         // Pfe_yoke [W]
  specificIronLossW_kg: number;  // Steel grade p_fe0 [W/kg at 1.5 T, 50 Hz]

  mechanicalLossW: number;       // Pmw [W]
  strayLoadLossW: number;        // Pstray [W]
  totalLossW: number;            // Ploss [W]
  calculatedEfficiency: number;  // eta [%]
  powerDensityKw_m3: number;     // Power per active core volume
  torqueDensityNm_m3: number;    // Torque per active core volume
  totalActiveSteelWeightKg: number;
  totalCopperWeightKg: number;
  totalMagnetWeightKg?: number;
}

export interface WindingHarmonic {
  order: number;
  kd: number;
  kp: number;
  kw: number;
  relativeAmplitudePct: number;
}

export interface WindingFunctionPoint {
  electricalDegree: number;
  mechanicalDegree: number;
  turnsDistributionA: number;
  windingFunctionA: number;
  fundamentalA: number;
}

export interface SlotCoilAllocation {
  slotNumber: number;
  slotMechanicalAngleDeg: number;
  topLayerPhase: 'A' | 'B' | 'C';
  topLayerPolarity: 1 | -1;
  bottomLayerPhase: 'A' | 'B' | 'C';
  bottomLayerPolarity: 1 | -1;
}

export interface TorqueSpeedCurvePoint {
  speedRpm: number;
  speedRatio: number;
  torqueNm: number;
  currentA: number;
  efficiencyPct: number;
  powerFactor: number;
}
