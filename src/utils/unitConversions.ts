/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ==========================================
// 1. LENGTH CONVERSIONS
// Base unit: Millimeter (mm)
// ==========================================
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'mil' | 'ft';

const LENGTH_TO_MM: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  mil: 0.0254, // thou (0.001 inch)
  ft: 304.8,
};

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (isNaN(value)) return 0;
  const inMm = value * LENGTH_TO_MM[from];
  return inMm / LENGTH_TO_MM[to];
}

// ==========================================
// 2. FORCE & TORQUE CONVERSIONS
// Base force: Newton (N)
// Base torque: Newton-meter (N·m)
// ==========================================
export type ForceUnit = 'N' | 'kN' | 'lbf' | 'ozf' | 'kgf';

const FORCE_TO_N: Record<ForceUnit, number> = {
  N: 1,
  kN: 1000,
  lbf: 4.4482216,
  ozf: 0.2780139,
  kgf: 9.80665,
};

export function convertForce(value: number, from: ForceUnit, to: ForceUnit): number {
  if (isNaN(value)) return 0;
  const inN = value * FORCE_TO_N[from];
  return inN / FORCE_TO_N[to];
}

export type TorqueUnit = 'Nm' | 'kNm' | 'lbf_ft' | 'lbf_in' | 'oz_in' | 'kgf_m';

const TORQUE_TO_NM: Record<TorqueUnit, number> = {
  Nm: 1,
  kNm: 1000,
  lbf_ft: 1.3558179,
  lbf_in: 0.1129848,
  oz_in: 0.00706155,
  kgf_m: 9.80665,
};

export function convertTorque(value: number, from: TorqueUnit, to: TorqueUnit): number {
  if (isNaN(value)) return 0;
  const inNm = value * TORQUE_TO_NM[from];
  return inNm / TORQUE_TO_NM[to];
}

// ==========================================
// 3. DENSITY CONVERSIONS
// Base unit: kg/m³
// ==========================================
export type DensityUnit = 'kg_m3' | 'g_cm3' | 'lb_in3' | 'lb_ft3';

const DENSITY_TO_KG_M3: Record<DensityUnit, number> = {
  kg_m3: 1,
  g_cm3: 1000,
  lb_in3: 27679.904,
  lb_ft3: 16.018463,
};

export function convertDensity(value: number, from: DensityUnit, to: DensityUnit): number {
  if (isNaN(value)) return 0;
  const inKgM3 = value * DENSITY_TO_KG_M3[from];
  return inKgM3 / DENSITY_TO_KG_M3[to];
}

export interface MaterialDensityPreset {
  id: string;
  name: string;
  category: 'conductor' | 'steel' | 'magnet' | 'structural';
  densityKgM3: number;
  densityLbIn3: number;
  description: string;
}

export const MATERIAL_DENSITY_PRESETS: MaterialDensityPreset[] = [
  {
    id: 'copper',
    name: 'Electrolytic Copper (ETP)',
    category: 'conductor',
    densityKgM3: 8960,
    densityLbIn3: 0.3237,
    description: 'Standard stator winding magnet wire, conductivity 100% IACS.',
  },
  {
    id: 'aluminum',
    name: 'Rotor Grade Aluminum (EC 1350)',
    category: 'conductor',
    densityKgM3: 2700,
    densityLbIn3: 0.0975,
    description: 'Die-cast squirrel cage rotor bars and end-rings (61% IACS).',
  },
  {
    id: 'silicon_steel',
    name: 'M400-50A Electrical Silicon Steel',
    category: 'steel',
    densityKgM3: 7650,
    densityLbIn3: 0.2764,
    description: 'Standard non-oriented lamination punchings (0.50 mm sheet).',
  },
  {
    id: 'thin_silicon_steel',
    name: 'NO20 High-Frequency Silicon Steel',
    category: 'steel',
    densityKgM3: 7600,
    densityLbIn3: 0.2746,
    description: 'Thin 0.20 mm gauge for high-speed EV traction and high inverter frequencies.',
  },
  {
    id: 'cobalt_iron',
    name: 'Vacoflux 50 (Cobalt-Iron)',
    category: 'steel',
    densityKgM3: 8120,
    densityLbIn3: 0.2934,
    description: '49% Co / 2% V alloy with extreme 2.35 T magnetic saturation knee.',
  },
  {
    id: 'ndfeb_magnet',
    name: 'NdFeB Rare Earth Sintered Magnet (N42SH)',
    category: 'magnet',
    densityKgM3: 7500,
    densityLbIn3: 0.2709,
    description: 'Neodymium-Iron-Boron permanent magnets with Br = 1.28 T.',
  },
  {
    id: 'rotor_shaft_steel',
    name: 'AISI 4140 Chromium-Moly Shaft Steel',
    category: 'structural',
    densityKgM3: 7850,
    densityLbIn3: 0.2836,
    description: 'High tensile shaft alloy for torque transmission and critical speed stiffness.',
  },
];

// ==========================================
// 4. POWER CONVERSIONS
// Base unit: Kilowatt (kW)
// ==========================================
export type PowerUnit = 'kW' | 'HP' | 'W' | 'MW' | 'BTU_hr';

const POWER_TO_KW: Record<PowerUnit, number> = {
  kW: 1,
  HP: 0.74569987, // 1 Mechanical Horsepower = 745.7 W
  W: 0.001,
  MW: 1000,
  BTU_hr: 0.000293071,
};

export function convertPower(value: number, from: PowerUnit, to: PowerUnit): number {
  if (isNaN(value)) return 0;
  const inKw = value * POWER_TO_KW[from];
  return inKw / POWER_TO_KW[to];
}

// ==========================================
// 5. ELECTRIC LOADING & CURRENT DENSITY CONVERSIONS
// ==========================================
// ac: Ampere-conductors per meter (A/m)
export type ElectricLoadingUnit = 'A_m' | 'A_in' | 'kA_m';

export function convertElectricLoading(value: number, from: ElectricLoadingUnit, to: ElectricLoadingUnit): number {
  if (isNaN(value)) return 0;
  let inAm = value;
  if (from === 'kA_m') inAm = value * 1000;
  if (from === 'A_in') inAm = value / 0.0254;

  if (to === 'A_m') return inAm;
  if (to === 'kA_m') return inAm / 1000;
  if (to === 'A_in') return inAm * 0.0254;
  return inAm;
}

// J: Current density (A/mm²)
export type CurrentDensityUnit = 'A_mm2' | 'A_in2' | 'kcmil_A';

export function convertCurrentDensity(value: number, from: CurrentDensityUnit, to: CurrentDensityUnit): number {
  if (isNaN(value)) return 0;
  let inA_mm2 = value;
  if (from === 'A_in2') inA_mm2 = value / (25.4 * 25.4);
  if (from === 'kcmil_A') inA_mm2 = value > 0 ? (1000 / value) * 1.9735e-3 : 0;

  if (to === 'A_mm2') return inA_mm2;
  if (to === 'A_in2') return inA_mm2 * (25.4 * 25.4);
  if (to === 'kcmil_A') return inA_mm2 > 0 ? (1000 / inA_mm2) * 1.9735e-3 : 0;
  return inA_mm2;
}

// Magnetic flux density B: Tesla (T) vs Gauss (G) vs kLines/in²
export type FluxDensityUnit = 'T' | 'Gauss' | 'kLines_in2';

export function convertFluxDensity(value: number, from: FluxDensityUnit, to: FluxDensityUnit): number {
  if (isNaN(value)) return 0;
  let inTesla = value;
  if (from === 'Gauss') inTesla = value / 10000;
  if (from === 'kLines_in2') inTesla = value * 0.0155; // 1 Tesla ~ 64.5 kLines/in²

  if (to === 'T') return inTesla;
  if (to === 'Gauss') return inTesla * 10000;
  if (to === 'kLines_in2') return inTesla / 0.0155;
  return inTesla;
}

// ==========================================
// 6. STANDARD MAGNET WIRE TABLE (AWG & SWG)
// ==========================================
export interface WireGaugeEntry {
  awg: number;
  swgEquivalent?: number;
  bareDiameterMm: number;
  bareDiameterIn: number;
  copperAreaMm2: number;
  nominalResistanceOhmPerM: number; // At 20°C
  continuousCurrentA_5A_mm2: number; // At typical 5 A/mm²
}

export const AWG_WIRE_TABLE: WireGaugeEntry[] = [
  { awg: 10, swgEquivalent: 12, bareDiameterMm: 2.588, bareDiameterIn: 0.1019, copperAreaMm2: 5.261, nominalResistanceOhmPerM: 0.003277, continuousCurrentA_5A_mm2: 26.3 },
  { awg: 12, swgEquivalent: 14, bareDiameterMm: 2.053, bareDiameterIn: 0.0808, copperAreaMm2: 3.309, nominalResistanceOhmPerM: 0.005211, continuousCurrentA_5A_mm2: 16.5 },
  { awg: 14, swgEquivalent: 16, bareDiameterMm: 1.628, bareDiameterIn: 0.0641, copperAreaMm2: 2.081, nominalResistanceOhmPerM: 0.008285, continuousCurrentA_5A_mm2: 10.4 },
  { awg: 16, swgEquivalent: 18, bareDiameterMm: 1.291, bareDiameterIn: 0.0508, copperAreaMm2: 1.309, nominalResistanceOhmPerM: 0.01317, continuousCurrentA_5A_mm2: 6.55 },
  { awg: 17, swgEquivalent: 19, bareDiameterMm: 1.150, bareDiameterIn: 0.0453, copperAreaMm2: 1.039, nominalResistanceOhmPerM: 0.01661, continuousCurrentA_5A_mm2: 5.19 },
  { awg: 18, swgEquivalent: 20, bareDiameterMm: 1.024, bareDiameterIn: 0.0403, copperAreaMm2: 0.823, nominalResistanceOhmPerM: 0.02095, continuousCurrentA_5A_mm2: 4.12 },
  { awg: 19, swgEquivalent: 21, bareDiameterMm: 0.912, bareDiameterIn: 0.0359, copperAreaMm2: 0.653, nominalResistanceOhmPerM: 0.02641, continuousCurrentA_5A_mm2: 3.27 },
  { awg: 20, swgEquivalent: 22, bareDiameterMm: 0.812, bareDiameterIn: 0.0320, copperAreaMm2: 0.518, nominalResistanceOhmPerM: 0.03331, continuousCurrentA_5A_mm2: 2.59 },
  { awg: 21, swgEquivalent: 23, bareDiameterMm: 0.723, bareDiameterIn: 0.0285, copperAreaMm2: 0.410, nominalResistanceOhmPerM: 0.04200, continuousCurrentA_5A_mm2: 2.05 },
  { awg: 22, swgEquivalent: 24, bareDiameterMm: 0.644, bareDiameterIn: 0.0253, copperAreaMm2: 0.326, nominalResistanceOhmPerM: 0.05296, continuousCurrentA_5A_mm2: 1.63 },
  { awg: 24, swgEquivalent: 26, bareDiameterMm: 0.511, bareDiameterIn: 0.0201, copperAreaMm2: 0.205, nominalResistanceOhmPerM: 0.08422, continuousCurrentA_5A_mm2: 1.03 },
  { awg: 26, swgEquivalent: 28, bareDiameterMm: 0.405, bareDiameterIn: 0.0159, copperAreaMm2: 0.129, nominalResistanceOhmPerM: 0.1339, continuousCurrentA_5A_mm2: 0.64 },
  { awg: 28, swgEquivalent: 30, bareDiameterMm: 0.321, bareDiameterIn: 0.0126, copperAreaMm2: 0.081, nominalResistanceOhmPerM: 0.2129, continuousCurrentA_5A_mm2: 0.41 },
];
