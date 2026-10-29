/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CoolingMethod,
  InsulationClass,
  ElectricalSteelGrade,
  MaterialLimitsConfig,
  MaterialValidationResult,
} from '../types/motor';

export interface CoolingOption {
  id: CoolingMethod;
  name: string;
  code: string;
  description: string;
  typicalJRange: string;
}

export const COOLING_OPTIONS: CoolingOption[] = [
  {
    id: 'ic411_tefc',
    name: 'TEFC Surface Air Cooling',
    code: 'IC411',
    description: 'Totally enclosed fan-cooled frame with external rib ventilation (Industrial baseline).',
    typicalJRange: '4.5 - 6.5 A/mm²',
  },
  {
    id: 'ic01_open',
    name: 'Open Drip-Proof / Through-Ventilated',
    code: 'IC01',
    description: 'Internal air circulation through end shields (lower thermal barrier, reduced enclosure protection).',
    typicalJRange: '3.5 - 5.2 A/mm²',
  },
  {
    id: 'ic71w_liquid',
    name: 'Liquid-Jacket / Water-Glycol Cooling',
    code: 'IC71W',
    description: 'High-heat-flux housing spiral coolant jacket for EV traction and high-density servos.',
    typicalJRange: '8.0 - 14.5 A/mm²',
  },
];

export interface InsulationOption {
  id: InsulationClass;
  name: string;
  temperatureLimit: number;
  description: string;
}

export const INSULATION_OPTIONS: InsulationOption[] = [
  {
    id: 'class_b_130',
    name: 'Class B (130°C)',
    temperatureLimit: 130,
    description: 'Traditional standard temperature rise limit (80K rise over 40°C ambient).',
  },
  {
    id: 'class_f_155',
    name: 'Class F (155°C)',
    temperatureLimit: 155,
    description: 'Modern standard industrial insulation (105K rise over 40°C ambient).',
  },
  {
    id: 'class_h_180',
    name: 'Class H (180°C)',
    temperatureLimit: 180,
    description: 'High-temperature Nomex/polyimide insulation for EV traction & aerospace.',
  },
];

export interface SteelGradeOption {
  id: ElectricalSteelGrade;
  name: string;
  nominalKneeTesla: number;
  maxRecommendedTesla: number;
  alloyType: string;
  specificLossW_kg: number; // at 1.5 T, 50 Hz
  description: string;
}

export const STEEL_GRADE_OPTIONS: SteelGradeOption[] = [
  {
    id: 'm400_50a',
    name: 'M400-50A (0.50 mm)',
    nominalKneeTesla: 1.68,
    maxRecommendedTesla: 1.78,
    alloyType: 'Non-Oriented Silicon Steel (Fe-Si ~2.8%)',
    specificLossW_kg: 3.8,
    description: 'Standard workhorse industrial lamination steel for mains induction motors.',
  },
  {
    id: 'm270_35a',
    name: 'M270-35A (0.35 mm)',
    nominalKneeTesla: 1.72,
    maxRecommendedTesla: 1.82,
    alloyType: 'Low-Loss Non-Oriented Silicon Steel (Fe-Si ~3.2%)',
    specificLossW_kg: 2.6,
    description: 'High-efficiency automotive & servo steel with reduced eddy current loss.',
  },
  {
    id: 'no20_thin',
    name: 'NO20 Thin Gauge (0.20 mm)',
    nominalKneeTesla: 1.76,
    maxRecommendedTesla: 1.85,
    alloyType: 'Ultra-Thin Micro-Alloyed Silicon Steel',
    specificLossW_kg: 1.8,
    description: 'Engineered for high-frequency EV traction (up to 1 kHz inverter fundamental).',
  },
  {
    id: 'vacoflux_50',
    name: 'Vacoflux 50 / Hiperco 50',
    nominalKneeTesla: 2.10,
    maxRecommendedTesla: 2.25,
    alloyType: 'Cobalt-Iron Alloy (49% Fe, 49% Co, 2% V)',
    specificLossW_kg: 2.2,
    description: 'Ultra-high saturation alloy delivering maximum torque density in aerospace & defense.',
  },
];

/**
 * Computes maximum allowable current density based on cooling and insulation.
 */
export function getThermalLimit(
  cooling: CoolingMethod,
  insulation: InsulationClass
): number {
  let baseJ = 5.2; // default TEFC Class B

  switch (cooling) {
    case 'ic01_open':
      baseJ = 4.2;
      break;
    case 'ic411_tefc':
      baseJ = 5.6;
      break;
    case 'ic71w_liquid':
      baseJ = 11.5;
      break;
  }

  // Multiplier for insulation temperature capability
  let insulationFactor = 1.0;
  switch (insulation) {
    case 'class_b_130':
      insulationFactor = 0.90;
      break;
    case 'class_f_155':
      insulationFactor = 1.05;
      break;
    case 'class_h_180':
      insulationFactor = 1.25;
      break;
  }

  return Number((baseJ * insulationFactor).toFixed(2));
}

/**
 * Evaluates current design values against material-specific thermal and magnetic saturation limits.
 */
export function evaluateMaterialLimits(
  actualJ: number,
  actualBts: number,
  actualBys: number,
  config: MaterialLimitsConfig
): MaterialValidationResult {
  const maxJ = getThermalLimit(config.cooling, config.insulation);
  const selectedSteel =
    STEEL_GRADE_OPTIONS.find((s) => s.id === config.steelGrade) ?? STEEL_GRADE_OPTIONS[0];
  const maxToothB = selectedSteel.maxRecommendedTesla;
  const maxYokeB = selectedSteel.nominalKneeTesla * 0.95;

  const jUtilPct = Number(((actualJ / maxJ) * 100).toFixed(1));
  const toothBUtilPct = Number(((actualBts / maxToothB) * 100).toFixed(1));
  const yokeBUtilPct = Number(((actualBys / maxYokeB) * 100).toFixed(1));

  // Determine status (Nominal: <85%, Caution: 85-100%, Exceeded: >100%)
  const getStatus = (util: number): 'nominal' | 'caution' | 'exceeded' => {
    if (util > 100) return 'exceeded';
    if (util >= 85) return 'caution';
    return 'nominal';
  };

  const thermalStatus = getStatus(jUtilPct);
  const toothMagneticStatus = getStatus(toothBUtilPct);
  const yokeMagneticStatus = getStatus(yokeBUtilPct);

  // Overall combined status
  let overallStatus: 'nominal' | 'caution' | 'exceeded' = 'nominal';
  if (thermalStatus === 'exceeded' || toothMagneticStatus === 'exceeded' || yokeMagneticStatus === 'exceeded') {
    overallStatus = 'exceeded';
  } else if (thermalStatus === 'caution' || toothMagneticStatus === 'caution' || yokeMagneticStatus === 'caution') {
    overallStatus = 'caution';
  }

  const mitigationNotes: string[] = [];

  if (thermalStatus === 'exceeded') {
    mitigationNotes.push(
      `Stator current density (${actualJ} A/mm²) exceeds ${config.cooling.toUpperCase()} limit (${maxJ} A/mm²). Increase slot area Aslot, lower electrical loading ac, or upgrade to liquid cooling.`
    );
  } else if (thermalStatus === 'caution') {
    mitigationNotes.push(
      `Stator current density (${actualJ} A/mm²) is within 15% of thermal threshold. Monitor winding hot-spot temperature rise.`
    );
  }

  if (toothMagneticStatus === 'exceeded') {
    mitigationNotes.push(
      `Tooth flux density (${actualBts} T) exceeds saturation knee of ${selectedSteel.name} (${maxToothB} T). Widen stator tooth bts or increase core stack length L.`
    );
  } else if (toothMagneticStatus === 'caution') {
    mitigationNotes.push(
      `Tooth flux density (${actualBts} T) is approaching saturation knee (${selectedSteel.nominalKneeTesla} T). Expect elevated excitation MMF and harmonic distortion.`
    );
  }

  if (yokeMagneticStatus === 'exceeded') {
    mitigationNotes.push(
      `Stator yoke flux density (${actualBys} T) is over-saturated. Deepen back-iron yoke hys.`
    );
  }

  return {
    currentDensityA_mm2: actualJ,
    maxCurrentDensityA_mm2: maxJ,
    currentDensityUtilizationPct: jUtilPct,
    thermalStatus,

    toothFluxTesla: actualBts,
    maxToothFluxTesla: maxToothB,
    toothFluxUtilizationPct: toothBUtilPct,
    toothMagneticStatus,

    yokeFluxTesla: actualBys,
    maxYokeFluxTesla: Number(maxYokeB.toFixed(2)),
    yokeFluxUtilizationPct: yokeBUtilPct,
    yokeMagneticStatus,

    overallStatus,
    mitigationNotes,
  };
}
