/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs, CalculatedGeometry, ElectricalSteelGrade } from '../types/motor';

export interface MaterialUnitPriceConfig {
  copperPricePerKg: number;
  steelPricePerKg: number;
  magnetPricePerKg: number;
  aluminumPricePerKg: number;
  insulationStructuralPct: number; // additional percentage for varnish, slot liners, and frame structural overhead
}

export interface MaterialCostItem {
  id: string;
  name: string;
  category: 'copper' | 'steel' | 'magnet' | 'aluminum' | 'insulation';
  massKg: number;
  volumeLiters: number;
  unitPricePerKg: number;
  costUsd: number;
  costSharePct: number;
  massSharePct: number;
}

export interface ActiveMaterialAnalysisResult {
  statorLaminationMassKg: number;
  rotorLaminationMassKg: number;
  totalSteelMassKg: number;
  copperWindingMassKg: number;
  rotorMagnetOrBarMassKg: number;
  insulationHardwareMassKg: number;
  totalActiveMassKg: number;
  activeCoreVolumeLiters: number;
  statorOuterVolumeLiters: number;
  specificTorqueNm_kg: number;      // Tn / Mass [Nm/kg]
  specificPowerKw_kg: number;       // Pn / Mass [kW/kg]
  volumetricPowerDensityKw_L: number; // Pn / Volume [kW/L]
  totalBomCostUsd: number;
  specificCostUsdPerKw: number;     // Cost / kW
  specificCostUsdPerNm: number;     // Cost / Nm
  costBreakdown: MaterialCostItem[];
}

export const DEFAULT_UNIT_PRICES: Record<string, MaterialUnitPriceConfig> = {
  default: {
    copperPricePerKg: 12.5,
    steelPricePerKg: 3.2,
    magnetPricePerKg: 68.0,
    aluminumPricePerKg: 3.6,
    insulationStructuralPct: 12,
  },
};

/**
 * Calculates mass, volume, and BOM active material cost breakdown from motor geometry.
 */
export function calculateActiveMaterialBOM(
  specs: MotorSpecs,
  geom: CalculatedGeometry,
  pricing: MaterialUnitPriceConfig = DEFAULT_UNIT_PRICES.default
): ActiveMaterialAnalysisResult {
  const steelDensityKg_m3 = 7650;
  const copperDensityKg_m3 = 8960;
  const magnetDensityKg_m3 = 7500;
  const aluminumDensityKg_m3 = 2700;

  // Stator & Rotor steel mass from geometry
  const totalSteelMass = Math.max(1.0, geom.totalActiveSteelWeightKg);
  // Stator approx 65% of steel, rotor 35%
  const statorSteelMass = Number((totalSteelMass * 0.65).toFixed(2));
  const rotorSteelMass = Number((totalSteelMass * 0.35).toFixed(2));

  // Copper winding mass
  const copperMass = Math.max(0.2, Number((geom.totalCopperWeightKg).toFixed(2)));

  // Rotor topology mass: Magnets (PMSM) or Aluminum/Copper bars (Induction)
  let rotorSecondaryMass = 0;
  let secondaryCategory: 'magnet' | 'aluminum' | 'copper' | 'steel' = 'magnet';
  let secondaryPrice = pricing.magnetPricePerKg;
  let secondaryName = 'NdFeB Permanent Magnets (N42SH)';

  if (specs.topology === 'pmsm_spm' || specs.topology === 'pmsm_ipm') {
    rotorSecondaryMass = Math.max(0.1, Number((geom.totalMagnetWeightKg ?? totalSteelMass * 0.08).toFixed(2)));
    secondaryCategory = 'magnet';
    secondaryPrice = pricing.magnetPricePerKg;
    secondaryName = 'NdFeB Rare-Earth Magnets (Grade N42SH)';
  } else if (specs.topology === 'induction') {
    const isCuRotor = specs.rotorBarMaterial === 'copper';
    const barVol_m3 =
      ((specs.rotorSlots ?? 28) *
        (geom.rotorBarWidthMm ?? 6) *
        (geom.rotorBarHeightMm ?? 22) *
        geom.coreLengthMm *
        1.2) *
      1e-9;
    rotorSecondaryMass = Number(
      Math.max(0.3, barVol_m3 * (isCuRotor ? copperDensityKg_m3 : aluminumDensityKg_m3)).toFixed(2)
    );
    secondaryCategory = isCuRotor ? 'copper' : 'aluminum';
    secondaryPrice = isCuRotor ? pricing.copperPricePerKg : pricing.aluminumPricePerKg;
    secondaryName = isCuRotor ? 'Fabricated Copper Rotor Bars & End Rings' : 'Die-Cast Aluminum Rotor Cage (A380)';
  } else {
    // Synchronous / Reluctance
    rotorSecondaryMass = Number((totalSteelMass * 0.04).toFixed(2));
    secondaryCategory = 'steel';
    secondaryPrice = pricing.steelPricePerKg;
    secondaryName = 'Field Winding / Barrier Insulation';
  }

  // Insulation, slot liners, and tie cords
  const insulationMass = Number((copperMass * 0.08).toFixed(2));

  const totalActiveMass = Number(
    (statorSteelMass + rotorSteelMass + copperMass + rotorSecondaryMass + insulationMass).toFixed(2)
  );

  // Volumetric calculations
  const rOuter_m = (geom.statorOuterDiameterMm / 2) * 1e-3;
  const L_m = geom.coreLengthMm * 1e-3;
  const activeCoreVol_L = Number((Math.PI * rOuter_m * rOuter_m * L_m * 1000).toFixed(2));

  // Costs
  const costSteel = totalSteelMass * pricing.steelPricePerKg;
  const costCopper = copperMass * pricing.copperPricePerKg;
  const costSecondary = rotorSecondaryMass * secondaryPrice;
  const costInsulation = insulationMass * (pricing.copperPricePerKg * 1.5);

  const baseCost = costSteel + costCopper + costSecondary + costInsulation;
  const structuralAllowanceCost = baseCost * (pricing.insulationStructuralPct / 100);
  const totalCost = Number((baseCost + structuralAllowanceCost).toFixed(2));

  const specificTorque = Number((geom.ratedTorqueNm / totalActiveMass).toFixed(2));
  const specificPower = Number(((specs.powerKw) / totalActiveMass).toFixed(2));
  const volumetricPower = Number(((specs.powerKw) / activeCoreVol_L).toFixed(2));

  const costPerKw = Number((totalCost / Math.max(0.1, specs.powerKw)).toFixed(2));
  const costPerNm = Number((totalCost / Math.max(0.1, geom.ratedTorqueNm)).toFixed(2));

  const costItems: MaterialCostItem[] = [
    {
      id: 'cost_copper',
      name: 'Stator Copper Magnet Wire (Class H Grade 2)',
      category: 'copper',
      massKg: copperMass,
      volumeLiters: Number(((copperMass / (copperDensityKg_m3 * 1e-3))).toFixed(2)),
      unitPricePerKg: pricing.copperPricePerKg,
      costUsd: Number(costCopper.toFixed(2)),
      costSharePct: Number(((costCopper / totalCost) * 100).toFixed(1)),
      massSharePct: Number(((copperMass / totalActiveMass) * 100).toFixed(1)),
    },
    {
      id: 'cost_steel',
      name: 'Non-Oriented Electrical Steel Laminations',
      category: 'steel',
      massKg: totalSteelMass,
      volumeLiters: Number(((totalSteelMass / (steelDensityKg_m3 * 1e-3))).toFixed(2)),
      unitPricePerKg: pricing.steelPricePerKg,
      costUsd: Number(costSteel.toFixed(2)),
      costSharePct: Number(((costSteel / totalCost) * 100).toFixed(1)),
      massSharePct: Number(((totalSteelMass / totalActiveMass) * 100).toFixed(1)),
    },
    {
      id: 'cost_secondary',
      name: secondaryName,
      category: secondaryCategory,
      massKg: rotorSecondaryMass,
      volumeLiters: Number(((rotorSecondaryMass / 7.5)).toFixed(2)),
      unitPricePerKg: secondaryPrice,
      costUsd: Number(costSecondary.toFixed(2)),
      costSharePct: Number(((costSecondary / totalCost) * 100).toFixed(1)),
      massSharePct: Number(((rotorSecondaryMass / totalActiveMass) * 100).toFixed(1)),
    },
    {
      id: 'cost_insulation',
      name: 'Slot Liners, Nomex Phase Insulation & Varnish',
      category: 'insulation',
      massKg: insulationMass,
      volumeLiters: Number(((insulationMass / 1.3)).toFixed(2)),
      unitPricePerKg: Number((pricing.copperPricePerKg * 1.5).toFixed(2)),
      costUsd: Number((costInsulation + structuralAllowanceCost).toFixed(2)),
      costSharePct: Number((((costInsulation + structuralAllowanceCost) / totalCost) * 100).toFixed(1)),
      massSharePct: Number(((insulationMass / totalActiveMass) * 100).toFixed(1)),
    },
  ];

  return {
    statorLaminationMassKg: statorSteelMass,
    rotorLaminationMassKg: rotorSteelMass,
    totalSteelMassKg: totalSteelMass,
    copperWindingMassKg: copperMass,
    rotorMagnetOrBarMassKg: rotorSecondaryMass,
    insulationHardwareMassKg: insulationMass,
    totalActiveMassKg: totalActiveMass,
    activeCoreVolumeLiters: activeCoreVol_L,
    statorOuterVolumeLiters: activeCoreVol_L,
    specificTorqueNm_kg: specificTorque,
    specificPowerKw_kg: specificPower,
    volumetricPowerDensityKw_L: volumetricPower,
    totalBomCostUsd: totalCost,
    specificCostUsdPerKw: costPerKw,
    specificCostUsdPerNm: costPerNm,
    costBreakdown: costItems,
  };
}
