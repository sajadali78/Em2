/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs } from '../types/motor';

export const MOTOR_PRESETS: MotorSpecs[] = [
  {
    id: 'im-15kw-ie4',
    name: '15 kW Industrial Induction Motor (IE4)',
    topology: 'induction',
    description: '4-Pole 400V high-efficiency squirrel-cage induction machine for standard industrial fan, pump, and compressor drives.',
    powerKw: 15,
    voltageV: 400,
    frequencyHz: 50,
    poles: 4,
    phases: 3,
    targetEfficiency: 93.9,
    targetPowerFactor: 0.85,
    connectionType: 'star',

    // Specific Loadings
    specificMagneticLoading: 0.52, // Bav in Tesla
    specificElectricLoading: 28000, // ac in A/m
    aspectRatio: 1.15, // L/tau

    // Stator Core & Slot
    statorSlots: 36,
    currentDensityA_mm2: 5.0,
    slotFillFactor: 0.40,
    coilPitchSlots: 8, // 8/9 chording
    statorYokeMaxFluxTesla: 1.45,
    statorToothMaxFluxTesla: 1.65,
    stackingFactor: 0.95,

    // Rotor parameters
    rotorSlots: 28,
    rotorBarMaterial: 'aluminum',
    ratedSlipPercent: 2.8,
  },
  {
    id: 'pmsm-ipm-80kw',
    name: '80 kW EV Traction IPM Motor',
    topology: 'pmsm_ipm',
    description: '8-Pole Interior Permanent Magnet (IPM) traction motor with V-shape magnet cavities and high reluctance torque capability for automotive drive.',
    powerKw: 80,
    voltageV: 380,
    frequencyHz: 200,
    poles: 8,
    phases: 3,
    targetEfficiency: 96.5,
    targetPowerFactor: 0.94,
    connectionType: 'star',

    // Specific Loadings
    specificMagneticLoading: 0.68,
    specificElectricLoading: 42000,
    aspectRatio: 1.65,

    // Stator Core & Slot
    statorSlots: 48,
    currentDensityA_mm2: 7.2,
    slotFillFactor: 0.42,
    coilPitchSlots: 5, // 5/6 chording
    statorYokeMaxFluxTesla: 1.55,
    statorToothMaxFluxTesla: 1.75,
    stackingFactor: 0.96,

    // Magnet & Saliency
    magnetRemanenceBr: 1.22,
    magnetCoercivityHc: 920,
    magnetThicknessMm: 4.8,
    magnetPoleArcRatio: 0.76,
    saliencyRatio: 2.3,
  },
  {
    id: 'pmsm-spm-5kw',
    name: '5.5 kW Surface PMSM Servo Motor',
    topology: 'pmsm_spm',
    description: '4-Pole Surface Permanent Magnet synchronous servo motor for precision CNC positioning, robotics, and low-torque-ripple automation.',
    powerKw: 5.5,
    voltageV: 230,
    frequencyHz: 100,
    poles: 4,
    phases: 3,
    targetEfficiency: 94.2,
    targetPowerFactor: 0.96,
    connectionType: 'star',

    // Specific Loadings
    specificMagneticLoading: 0.58,
    specificElectricLoading: 24000,
    aspectRatio: 1.25,

    // Stator Core & Slot
    statorSlots: 24,
    currentDensityA_mm2: 5.8,
    slotFillFactor: 0.38,
    coilPitchSlots: 5,
    statorYokeMaxFluxTesla: 1.40,
    statorToothMaxFluxTesla: 1.60,
    stackingFactor: 0.95,

    // Magnet
    magnetRemanenceBr: 1.18,
    magnetCoercivityHc: 880,
    magnetThicknessMm: 3.2,
    magnetPoleArcRatio: 0.72,
    saliencyRatio: 1.05,
  },
  {
    id: 'vernier-pm-10kw',
    name: '10 kW Direct-Drive Vernier PM Machine',
    topology: 'vernier_pm',
    description: 'Magnetic gearing flux-modulation Vernier motor (Gr=11, 66 rotor poles) providing ultra-high torque density at low speed for direct-drive robotics and wind generators.',
    powerKw: 10,
    voltageV: 400,
    frequencyHz: 50,
    poles: 6, // 2*p_s = 6 armature poles
    phases: 3,
    targetEfficiency: 93.5,
    targetPowerFactor: 0.78, // typical Vernier power factor
    connectionType: 'star',

    // Specific Loadings
    specificMagneticLoading: 0.62,
    specificElectricLoading: 38000,
    aspectRatio: 1.45,

    // Stator Core & Slot
    statorSlots: 36, // Modulation teeth Zs = 36
    currentDensityA_mm2: 5.4,
    slotFillFactor: 0.40,
    coilPitchSlots: 5,
    statorYokeMaxFluxTesla: 1.50,
    statorToothMaxFluxTesla: 1.70,
    stackingFactor: 0.96,

    // Vernier Gearing Parameters
    rotorPolesPr: 66, // 2*p_r = 2*(36 - 3) = 66
    vernierGearRatio: 11, // Gr = 33 / 3 = 11
    fluxModulationFactor: 0.55,
    magnetRemanenceBr: 1.24,
    magnetThicknessMm: 3.8,
    magnetPoleArcRatio: 0.80,
  },
  {
    id: 'wound-field-45kw',
    name: '45 kW Wound Field Synchronous Machine',
    topology: 'wound_field',
    description: '4-Pole Salient-Pole Wound Field synchronous motor/generator with controllable DC excitation for variable power factor and genset operation.',
    powerKw: 45,
    voltageV: 400,
    frequencyHz: 50,
    poles: 4,
    phases: 3,
    targetEfficiency: 94.8,
    targetPowerFactor: 0.90,
    connectionType: 'star',

    // Specific Loadings
    specificMagneticLoading: 0.55,
    specificElectricLoading: 32000,
    aspectRatio: 1.35,

    // Stator Core & Slot
    statorSlots: 36,
    currentDensityA_mm2: 4.8,
    slotFillFactor: 0.40,
    coilPitchSlots: 8,
    statorYokeMaxFluxTesla: 1.45,
    statorToothMaxFluxTesla: 1.68,
    stackingFactor: 0.95,

    // Field Winding
    poleShoeArcRatio: 0.70,
    fieldWindingTurnsPerPole: 180,
    fieldCurrentA: 14.5,
  },
  {
    id: 'im-75kw-pump',
    name: '75 kW Heavy-Duty Induction Motor',
    topology: 'induction',
    description: '6-Pole 400V high-torque induction machine engineered for heavy industrial pumps, mixers, and rock crushers.',
    powerKw: 75,
    voltageV: 400,
    frequencyHz: 50,
    poles: 6,
    phases: 3,
    targetEfficiency: 95.2,
    targetPowerFactor: 0.86,
    connectionType: 'delta',

    // Specific Loadings
    specificMagneticLoading: 0.54,
    specificElectricLoading: 34000,
    aspectRatio: 1.40,

    // Stator Core & Slot
    statorSlots: 54,
    currentDensityA_mm2: 5.2,
    slotFillFactor: 0.41,
    coilPitchSlots: 8,
    statorYokeMaxFluxTesla: 1.50,
    statorToothMaxFluxTesla: 1.70,
    stackingFactor: 0.95,

    // Rotor
    rotorSlots: 44,
    rotorBarMaterial: 'copper',
    ratedSlipPercent: 2.1,
  }
];
