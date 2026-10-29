/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs, CalculatedGeometry } from '../types/motor';
import { EfficiencyMapResult } from './efficiencyMapAnalysis';
import { ActiveMaterialAnalysisResult } from './materialCostAnalysis';

/**
 * Generates an AutoCAD DXF (Release 12 ASCII format) file string
 * containing the 2D cross-sectional geometry of the electric motor.
 * Layers:
 * - STATOR_OUTER (Cyan)
 * - STATOR_BORE (Yellow)
 * - STATOR_SLOTS (Green)
 * - AIRGAP (Red)
 * - ROTOR_OUTER (Magenta)
 * - ROTOR_MAGNETS / BARS (Blue)
 * - SHAFT (White)
 */
export function generateMotorCadDxf(specs: MotorSpecs, geom: CalculatedGeometry): string {
  const lines: string[] = [];

  const add = (groupCode: number, value: string | number) => {
    lines.push(groupCode.toString());
    lines.push(value.toString());
  };

  const addCircle = (cx: number, cy: number, radius: number, layer: string) => {
    add(0, 'CIRCLE');
    add(8, layer);
    add(10, cx.toFixed(3)); // center X
    add(20, cy.toFixed(3)); // center Y
    add(30, '0.0');         // center Z
    add(40, radius.toFixed(3)); // radius
  };

  const addLine = (x1: number, y1: number, x2: number, y2: number, layer: string) => {
    add(0, 'LINE');
    add(8, layer);
    add(10, x1.toFixed(3));
    add(20, y1.toFixed(3));
    add(30, '0.0');
    add(11, x2.toFixed(3));
    add(21, y2.toFixed(3));
    add(31, '0.0');
  };

  // DXF Header
  add(0, 'SECTION');
  add(2, 'HEADER');
  add(9, '$ACADVER');
  add(1, 'AC1009'); // AutoCAD Release 11/12
  add(9, '$INSUNITS');
  add(70, 4); // Millimeters
  add(0, 'ENDSEC');

  // DXF Tables (Layers)
  add(0, 'SECTION');
  add(2, 'TABLES');
  add(0, 'TABLE');
  add(2, 'LAYER');
  add(70, 7);

  const layers = [
    { name: 'STATOR_OUTER', color: 4 },    // Cyan
    { name: 'STATOR_BORE', color: 2 },     // Yellow
    { name: 'STATOR_SLOTS', color: 3 },    // Green
    { name: 'AIRGAP', color: 1 },          // Red
    { name: 'ROTOR_OUTER', color: 6 },     // Magenta
    { name: 'ROTOR_MAGNETS', color: 5 },   // Blue
    { name: 'SHAFT', color: 7 },           // White
  ];

  layers.forEach((l) => {
    add(0, 'LAYER');
    add(2, l.name);
    add(70, 64);
    add(62, l.color);
    add(6, 'CONTINUOUS');
  });

  add(0, 'ENDTAB');
  add(0, 'ENDSEC');

  // DXF Entities
  add(0, 'SECTION');
  add(2, 'ENTITIES');

  const rStatorOuter = geom.statorOuterDiameterMm / 2;
  const rStatorBore = geom.statorBoreDiameterMm / 2;
  const rRotorOuter = geom.rotorOuterDiameterMm / 2;
  const rShaft = (geom.shaftDiameterMm ?? geom.statorBoreDiameterMm * 0.35) / 2;

  // Stator Circles
  addCircle(0, 0, rStatorOuter, 'STATOR_OUTER');
  addCircle(0, 0, rStatorBore, 'STATOR_BORE');

  // Airgap Center Line
  const rAirgapMid = (rStatorBore + rRotorOuter) / 2;
  addCircle(0, 0, rAirgapMid, 'AIRGAP');

  // Rotor Outer Circle
  addCircle(0, 0, rRotorOuter, 'ROTOR_OUTER');

  // Shaft Circle
  addCircle(0, 0, rShaft, 'SHAFT');

  // Stator Slots & Teeth outlines
  const numSlots = specs.statorSlots;
  const slotDepth = geom.slotDepthMm;
  const slotWidth = geom.slotWidthTopMm;
  const rSlotBottom = rStatorBore + slotDepth;

  for (let i = 0; i < numSlots; i++) {
    const angleCenter = (2 * Math.PI * i) / numSlots;
    const halfSlotAngle = Math.asin(slotWidth / (2 * rStatorBore));

    const angle1 = angleCenter - halfSlotAngle;
    const angle2 = angleCenter + halfSlotAngle;

    // Slot entrance points
    const x1 = rStatorBore * Math.cos(angle1);
    const y1 = rStatorBore * Math.sin(angle1);
    const x2 = rStatorBore * Math.cos(angle2);
    const y2 = rStatorBore * Math.sin(angle2);

    // Slot bottom points
    const x1_bot = rSlotBottom * Math.cos(angle1);
    const y1_bot = rSlotBottom * Math.sin(angle1);
    const x2_bot = rSlotBottom * Math.cos(angle2);
    const y2_bot = rSlotBottom * Math.sin(angle2);

    addLine(x1, y1, x1_bot, y1_bot, 'STATOR_SLOTS');
    addLine(x1_bot, y1_bot, x2_bot, y2_bot, 'STATOR_SLOTS');
    addLine(x2_bot, y2_bot, x2, y2, 'STATOR_SLOTS');
  }

  // Rotor Magnets or Bars
  const numPoles = specs.poles;
  if (specs.topology === 'pmsm_spm') {
    const magThick = geom.magnetThicknessActualMm ?? specs.magnetThicknessMm ?? 3.5;
    const rMagIn = rRotorOuter - magThick;
    for (let p = 0; p < numPoles; p++) {
      const poleCenter = (2 * Math.PI * p) / numPoles;
      const poleArcHalf = ((Math.PI / numPoles) * 0.75); // 0.75 pole embrace

      const a1 = poleCenter - poleArcHalf;
      const a2 = poleCenter + poleArcHalf;

      const xm1 = rMagIn * Math.cos(a1);
      const ym1 = rMagIn * Math.sin(a1);
      const xm2 = rMagIn * Math.cos(a2);
      const ym2 = rMagIn * Math.sin(a2);

      const xmo1 = rRotorOuter * Math.cos(a1);
      const ymo1 = rRotorOuter * Math.sin(a1);
      const xmo2 = rRotorOuter * Math.cos(a2);
      const ymo2 = rRotorOuter * Math.sin(a2);

      addLine(xm1, ym1, xmo1, ymo1, 'ROTOR_MAGNETS');
      addLine(xm1, ym1, xm2, ym2, 'ROTOR_MAGNETS');
      addLine(xm2, ym2, xmo2, ymo2, 'ROTOR_MAGNETS');
    }
  } else {
    // Rotor Bars for Induction or IPM Cavities
    const rotorSlots = specs.rotorSlots ?? numPoles * 4;
    const rBarMid = (rRotorOuter + rShaft) * 0.55;
    for (let b = 0; b < rotorSlots; b++) {
      const ang = (2 * Math.PI * b) / rotorSlots;
      const bx = rBarMid * Math.cos(ang);
      const by = rBarMid * Math.sin(ang);
      addCircle(bx, by, 2.5, 'ROTOR_MAGNETS');
    }
  }

  // Close Entities & File
  add(0, 'ENDSEC');
  add(0, 'EOF');

  return lines.join('\n');
}

/**
 * Downloads a text file (DXF, CSV, JSON) to the client browser.
 */
export function triggerBrowserDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Exports detailed efficiency map points and envelope to CSV.
 */
export function generateEfficiencyMapCsv(specs: MotorSpecs, effMap: EfficiencyMapResult): string {
  const rows: string[] = [];
  rows.push('--- MOTOR EFFICIENCY MAP & OPERATING ENVELOPE ---');
  rows.push(`Motor Name,"${specs.name}"`);
  rows.push(`Rated Power (kW),${specs.powerKw}`);
  rows.push(`Rated Speed (rpm),${effMap.baseSpeedRpm}`);
  rows.push(`Peak Torque (Nm),${effMap.peakTorqueNm}`);
  rows.push(`Peak Efficiency (%),${effMap.peakEfficiencyPct}`);
  rows.push(`Weighted Drive Cycle Efficiency (%),${effMap.weightedCycleEfficiencyPct}`);
  rows.push('');

  rows.push('--- DRIVE CYCLE OPERATING POINTS ---');
  rows.push('Category,Name,Speed [rpm],Torque [Nm],Shaft Power [kW],Efficiency [%],Time Weight [%]');
  effMap.driveCyclePoints.forEach((pt) => {
    rows.push(
      `"${pt.category}","${pt.name}",${pt.speedRpm},${pt.torqueNm},${pt.powerKw},${pt.efficiencyPct},${pt.timeWeightPct}`
    );
  });
  rows.push('');

  rows.push('--- FULL OPERATING ENVELOPE GRID ---');
  rows.push('Speed [rpm],Torque [Nm],Power [kW],Efficiency [%],Copper Loss [W],Iron Loss [W],Mech Loss [W],Total Loss [W],Continuous Limit,Peak Limit');
  effMap.gridPoints.forEach((g) => {
    rows.push(
      `${g.speedRpm},${g.torqueNm},${g.powerKw},${g.efficiencyPct},${g.copperLossW},${g.ironLossW},${g.mechanicalLossW},${g.totalLossW},${g.isWithinContinuousLimit},${g.isWithinPeakLimit}`
    );
  });

  return rows.join('\n');
}

/**
 * Exports complete machine parameters and BOM to JSON.
 */
export function generateMachineJson(
  specs: MotorSpecs,
  geom: CalculatedGeometry,
  bom: ActiveMaterialAnalysisResult
): string {
  const data = {
    exportDate: new Date().toISOString(),
    motorSpecifications: specs,
    calculatedGeometry: geom,
    activeMaterialBOM: bom,
  };
  return JSON.stringify(data, null, 2);
}
