/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs, CalculatedGeometry, MaterialLimitsConfig } from '../types/motor';

export interface ThermalNodeState {
  windingTempC: number;
  statorIronTempC: number;
  rotorCoreTempC: number;
  housingTempC: number;
}

export interface TransientThermalTimePoint {
  timeSeconds: number;
  timeMinutes: number;
  windingTempC: number;
  statorIronTempC: number;
  rotorCoreTempC: number;
  housingTempC: number;
  ambientTempC: number;
  instantLoadRatio: number;
  instantTotalLossW: number;
}

export interface DutyCyclePreset {
  id: string;
  code: string; // 'S1' | 'S2' | 'S3' | 'S6' | 'S9'
  name: string;
  durationMinutes: number;
  description: string;
  profile: (tMinutes: number) => { loadRatio: number; speedRatio: number };
}

export interface TransientThermalResult {
  preset: DutyCyclePreset;
  ambientTempC: number;
  insulationLimitTempC: number;
  insulationClass: string;
  initialTempC: number;
  maxWindingTempC: number;
  maxStatorIronTempC: number;
  maxRotorTempC: number;
  maxHousingTempC: number;
  steadyStateWindingTempC: number;
  windingThermalMarginDegC: number; // Limit - MaxTemp
  isInsulationExceeded: boolean;
  timeToExceedSeconds: number | null;
  thermalTimeConstantSeconds: number; // tau
  timePoints: TransientThermalTimePoint[];
}

export const DUTY_CYCLE_PRESETS: DutyCyclePreset[] = [
  {
    id: 'iec_s1',
    code: 'S1',
    name: 'IEC S1 - Continuous Running Duty',
    durationMinutes: 90,
    description: 'Operation at constant 100% rated load until steady-state thermal equilibrium is attained.',
    profile: () => ({ loadRatio: 1.0, speedRatio: 1.0 }),
  },
  {
    id: 'iec_s2',
    code: 'S2',
    name: 'IEC S2 - Short-Time 150% Overload',
    durationMinutes: 30,
    description: 'Operation at 150% heavy overload for 15 minutes from cold start, followed by machine de-energization.',
    profile: (t) => ({ loadRatio: t <= 15 ? 1.5 : 0.0, speedRatio: t <= 15 ? 1.0 : 0.0 }),
  },
  {
    id: 'iec_s3',
    code: 'S3',
    name: 'IEC S3 - Intermittent Periodic Duty (40% Factor)',
    durationMinutes: 60,
    description: 'Sequence of identical 10-minute duty cycles consisting of 4 min at 120% load and 6 min at standstill rest.',
    profile: (t) => {
      const cycleTime = 10;
      const mod = t % cycleTime;
      return { loadRatio: mod < 4 ? 1.2 : 0.0, speedRatio: mod < 4 ? 1.0 : 0.0 };
    },
  },
  {
    id: 'iec_s6',
    code: 'S6',
    name: 'IEC S6 - Continuous Operation with Intermittent Load',
    durationMinutes: 60,
    description: 'Sequence of 10-minute cycles: 6 min at 125% rated peak load followed by 4 min at no-load idling.',
    profile: (t) => {
      const cycleTime = 10;
      const mod = t % cycleTime;
      return { loadRatio: mod < 6 ? 1.25 : 0.1, speedRatio: 1.0 };
    },
  },
  {
    id: 'iec_s9',
    code: 'S9',
    name: 'IEC S9 - Non-Periodic Traction & Inverter Drive',
    durationMinutes: 45,
    description: 'Variable load and variable speed duty simulating urban EV driving with rapid acceleration bursts and regenerative braking periods.',
    profile: (t) => {
      const phase = (t % 15);
      if (phase < 2) return { loadRatio: 1.6, speedRatio: 0.8 };  // Heavy launch
      if (phase < 5) return { loadRatio: 1.0, speedRatio: 1.2 };  // Cruise
      if (phase < 7) return { loadRatio: 0.3, speedRatio: 1.4 };  // Light high speed
      if (phase < 9) return { loadRatio: 0.0, speedRatio: 0.5 };  // Coasting
      if (phase < 11) return { loadRatio: 1.3, speedRatio: 0.9 }; // Grade climb
      return { loadRatio: 0.6, speedRatio: 1.0 };                 // Urban return
    },
  },
];

/**
 * Solves the 4-Node Lumped-Parameter Thermal Network (LPTN) using finite-difference dynamic integration.
 * Node 1: Copper Winding
 * Node 2: Stator Teeth & Yoke
 * Node 3: Rotor Active Core
 * Node 4: Housing / Frame
 */
export function simulateTransientThermalDutyCycle(
  specs: MotorSpecs,
  geom: CalculatedGeometry,
  materialConfig: MaterialLimitsConfig,
  presetId: string = 'iec_s1',
  ambientTempC: number = 40
): TransientThermalResult {
  const preset = DUTY_CYCLE_PRESETS.find((p) => p.id === presetId) ?? DUTY_CYCLE_PRESETS[0];

  // Insulation limit lookup
  let insulationLimit = 155; // Class F default
  let insulationClass = 'Class F (155°C)';
  if (materialConfig.insulation === 'class_b_130') {
    insulationLimit = 130;
    insulationClass = 'Class B (130°C)';
  } else if (materialConfig.insulation === 'class_h_180') {
    insulationLimit = 180;
    insulationClass = 'Class H (180°C)';
  }

  // Cooling method multiplier for heat dissipation conductance
  let coolingConductanceFactor = 1.0;
  if (materialConfig.cooling === 'ic411_tefc') coolingConductanceFactor = 1.35;
  else if (materialConfig.cooling === 'ic71w_liquid') coolingConductanceFactor = 3.2;
  else if (materialConfig.cooling === 'ic01_open') coolingConductanceFactor = 1.0;

  // Active Masses [kg]
  const mCopper = Math.max(0.5, geom.totalCopperWeightKg);
  const mStatorFe = Math.max(1.0, geom.totalActiveSteelWeightKg * 0.65);
  const mRotorFe = Math.max(0.5, geom.totalActiveSteelWeightKg * 0.35);
  const mHousing = Math.max(1.5, (mCopper + mStatorFe + mRotorFe) * 0.45);

  // Specific Heat Capacities [J / (kg * K)]
  const cpCopper = 385;
  const cpSteel = 490;
  const cpHousingAl = 900;

  // Thermal Capacitances [J / K]
  const C1 = mCopper * cpCopper;         // Winding
  const C2 = mStatorFe * cpSteel;        // Stator core
  const C3 = mRotorFe * cpSteel;         // Rotor core
  const C4 = mHousing * cpHousingAl;     // Housing

  // Thermal Conductances [W / K] = 1 / R_th
  // G12: Winding to Stator Core (through slot liner and varnish)
  const slotWidth = geom.slotWidthTopMm;
  const slotPerimeterM = ((slotWidth + geom.slotDepthMm) * 2 * specs.statorSlots) * 1e-3;
  const coreLengthM = geom.coreLengthMm * 1e-3;
  const slotAreaM2 = slotPerimeterM * coreLengthM;
  const G12 = Math.max(5.0, (0.25 / 0.00035) * slotAreaM2 * 0.6); // ~0.25 W/mK insulation

  // G24: Stator Core to Housing (shrink fit contact)
  const boreAreaM2 = Math.PI * (geom.statorOuterDiameterMm * 1e-3) * coreLengthM;
  const G24 = Math.max(8.0, 1500 * boreAreaM2); // contact conductance

  // G14: End-winding convection to internal housing air
  const G14 = Math.max(2.0, 35 * (mCopper * 0.0002));

  // G32: Air-gap heat transfer from rotor to stator
  const airgapAreaM2 = Math.PI * (geom.statorBoreDiameterMm * 1e-3) * coreLengthM;
  const G32 = Math.max(1.5, 50 * airgapAreaM2);

  // G4_amb: Housing to ambient (convection + radiation * cooling method)
  const housingOuterAreaM2 = Math.PI * (geom.statorOuterDiameterMm * 1.2 * 1e-3) * (coreLengthM * 1.5);
  const G4_amb = Math.max(4.0, 30 * housingOuterAreaM2 * coolingConductanceFactor);

  // Baseline rated losses at 20°C [W]
  const Pcu_rated = Math.max(5, geom.statorCopperLossW);
  const Pfe_rated = Math.max(5, geom.ironCoreLossW);
  const Protor_rated = Math.max(1, geom.rotorLossW);
  const Pmech_rated = Math.max(1, geom.mechanicalLossW);

  // Time-domain dynamic simulation
  const durationSec = preset.durationMinutes * 60;
  const dt = 5; // step size in seconds
  const totalSteps = Math.floor(durationSec / dt);
  const sampleInterval = Math.max(1, Math.floor(totalSteps / 120)); // record ~120 graph points

  let T1 = ambientTempC; // Winding
  let T2 = ambientTempC; // Stator iron
  let T3 = ambientTempC; // Rotor
  let T4 = ambientTempC; // Housing

  let maxWinding = ambientTempC;
  let maxIron = ambientTempC;
  let maxRotor = ambientTempC;
  let maxHousing = ambientTempC;

  let timeToExceedSec: number | null = null;
  const timePoints: TransientThermalTimePoint[] = [];

  for (let step = 0; step <= totalSteps; step++) {
    const curTimeSec = step * dt;
    const curTimeMin = curTimeSec / 60;

    const { loadRatio, speedRatio } = preset.profile(curTimeMin);

    // Temperature-dependent resistance coefficient: R(T) = R_ref * (1 + 0.00393 * (T - 20))
    const cuTempFactor = Math.max(0.7, 1 + 0.00393 * (T1 - 20));

    // Dynamic loss injection
    const pCu = Pcu_rated * Math.pow(loadRatio, 2) * cuTempFactor;
    const pFe = Pfe_rated * Math.pow(Math.max(0.05, speedRatio), 1.45) * Math.min(1.3, 0.7 + 0.3 * loadRatio);
    const pRotor = Protor_rated * Math.pow(loadRatio, 2);
    const pMech = Pmech_rated * Math.pow(Math.max(0, speedRatio), 2.1);
    const totalLossW = pCu + pFe + pRotor + pMech;

    // Node Heat Balance Differential Equations:
    // C1 * dT1/dt = P_cu - G12*(T1 - T2) - G14*(T1 - T4)
    const dT1 = ((pCu - G12 * (T1 - T2) - G14 * (T1 - T4)) / C1) * dt;
    // C2 * dT2/dt = P_fe + G12*(T1 - T2) + G32*(T3 - T2) - G24*(T2 - T4)
    const dT2 = ((pFe + G12 * (T1 - T2) + G32 * (T3 - T2) - G24 * (T2 - T4)) / C2) * dt;
    // C3 * dT3/dt = P_rotor - G32*(T3 - T2)
    const dT3 = ((pRotor - G32 * (T3 - T2)) / C3) * dt;
    // C4 * dT4/dt = P_mech + G24*(T2 - T4) + G14*(T1 - T4) - G4_amb*(T4 - ambientTempC)
    const dT4 = ((pMech + G24 * (T2 - T4) + G14 * (T1 - T4) - G4_amb * (T4 - ambientTempC)) / C4) * dt;

    T1 += dT1;
    T2 += dT2;
    T3 += dT3;
    T4 += dT4;

    if (T1 > maxWinding) maxWinding = T1;
    if (T2 > maxIron) maxIron = T2;
    if (T3 > maxRotor) maxRotor = T3;
    if (T4 > maxHousing) maxHousing = T4;

    if (T1 > insulationLimit && timeToExceedSec === null) {
      timeToExceedSec = curTimeSec;
    }

    if (step % sampleInterval === 0 || step === totalSteps) {
      timePoints.push({
        timeSeconds: curTimeSec,
        timeMinutes: Number(curTimeMin.toFixed(1)),
        windingTempC: Number(T1.toFixed(1)),
        statorIronTempC: Number(T2.toFixed(1)),
        rotorCoreTempC: Number(T3.toFixed(1)),
        housingTempC: Number(T4.toFixed(1)),
        ambientTempC,
        instantLoadRatio: Number(loadRatio.toFixed(2)),
        instantTotalLossW: Math.round(totalLossW),
      });
    }
  }

  // Calculate equivalent thermal time constant (tau = (C1 + C2 + C4) / G4_amb)
  const tauSec = Math.round((C1 + C2 + C4) / G4_amb);

  // Steady-state estimate for 100% rated load
  const ratedTotLoss = Pcu_rated * (1 + 0.00393 * 95) + Pfe_rated + Protor_rated + Pmech_rated;
  const steadyStateWinding = ambientTempC + ratedTotLoss / G4_amb + (Pcu_rated / G12);

  return {
    preset,
    ambientTempC,
    insulationLimitTempC: insulationLimit,
    insulationClass,
    initialTempC: ambientTempC,
    maxWindingTempC: Number(maxWinding.toFixed(1)),
    maxStatorIronTempC: Number(maxIron.toFixed(1)),
    maxRotorTempC: Number(maxRotor.toFixed(1)),
    maxHousingTempC: Number(maxHousing.toFixed(1)),
    steadyStateWindingTempC: Number(steadyStateWinding.toFixed(1)),
    windingThermalMarginDegC: Number((insulationLimit - maxWinding).toFixed(1)),
    isInsulationExceeded: maxWinding > insulationLimit,
    timeToExceedSeconds: timeToExceedSec,
    thermalTimeConstantSeconds: tauSec,
    timePoints,
  };
}
