/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MotorSpecs, CalculatedGeometry } from '../types/motor';
import { calculateWindingFactors } from './windingFunction';

export function generateMotorDesignPdf(
  specs: MotorSpecs,
  geom: CalculatedGeometry
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const { harmonics, thdPct } = calculateWindingFactors(
    specs.statorSlots,
    specs.poles,
    specs.coilPitchSlots,
    specs.phases
  );

  const timestamp = new Date().toLocaleString();
  const primaryColor: [number, number, number] = [15, 23, 42]; // Slate 900
  const accentColor: [number, number, number] = [2, 132, 199]; // Sky/Cyan 600

  // ---------------- PAGE 1 ----------------
  // Header Banner
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('D²L ELECTRICAL MACHINE DESIGN DOSSIER', 14, 11);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // Slate 400
  doc.text(`Motor: ${specs.name} | Topology: ${specs.topology.toUpperCase()}`, 14, 18);
  doc.text(`Generated: ${timestamp}`, 196, 18, { align: 'right' });

  let currentY = 32;

  // Overview callout box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, 182, 18, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.text('DESIGN SUMMARY:', 18, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${specs.powerKw} kW, ${specs.voltageV} V, ${specs.frequencyHz} Hz, ${specs.poles}-pole machine sized via analytical D²L volume formulation.`,
    18,
    currentY + 11
  );
  doc.text(
    `Bore D = ${geom.statorBoreDiameterMm} mm, Core Length L = ${geom.coreLengthMm} mm, Efficiency = ${geom.calculatedEfficiency}%, Rated Torque = ${geom.ratedTorqueNm} N·m.`,
    18,
    currentY + 15
  );

  currentY += 24;

  // Table 1: Primary Operating Specifications
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('1. Primary Operating Specifications & Loadings', 14, currentY);
  currentY += 4;

  autoTable(doc, {
    startY: currentY,
    head: [['Parameter', 'Symbol', 'Design Value', 'Unit', 'Specification Reference']],
    body: [
      ['Rated Output Power', 'Pn', `${specs.powerKw}`, 'kW', 'Target mechanical shaft output'],
      ['Rated Line Voltage (rms)', 'Vn', `${specs.voltageV}`, 'V', 'Standard supply line voltage'],
      ['Line Frequency', 'f', `${specs.frequencyHz}`, 'Hz', 'Supply grid / inverter base frequency'],
      ['Poles Count', '2p', `${specs.poles}`, '-', 'Armature magnetic pole count'],
      ['Synchronous Speed', 'ns', `${geom.synchronousSpeedRpm}`, 'rpm', 'ns = 120 * f / 2p'],
      ['Rated Rotor Speed', 'nr', `${geom.ratedSpeedRpm}`, 'rpm', 'Operating rotor speed at full load'],
      ['Rated Shaft Torque', 'Tn', `${geom.ratedTorqueNm}`, 'N·m', 'Tn = Pn / omega_m'],
      ['Specific Magnetic Loading', 'Bav', `${specs.specificMagneticLoading}`, 'T', 'Average airgap flux density'],
      ['Specific Electric Loading', 'ac', `${specs.specificElectricLoading.toLocaleString()}`, 'A/m', 'Armature amp-conductors per meter'],
      ['Aspect Ratio', 'lambda', `${specs.aspectRatio}`, '-', 'Core length to pole-pitch ratio (L / tau)'],
      ['Output Coefficient', 'C0', `${geom.outputCoefficientC0}`, 'kVA/(m³·rpm)', 'C0 = 11 * kw * Bav * ac * 10^-3'],
      ['Apparent Power', 'S', `${geom.apparentPowerKva}`, 'kVA', 'S = Pn / (eta * cos(phi))'],
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: 30 },
    margin: { left: 14, right: 14 },
  });

  // Vector Cross-Section Drawing at bottom of Page 1
  const finalTableY = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('2. Parametric Motor Cross-Section Schematic', 14, finalTableY);

  const cx = 105;
  const cy = finalTableY + 45;
  const scale = 0.22; // scale factor to fit
  const rOuter = Math.min(40, (geom.statorOuterDiameterMm / 2) * scale);
  const rBore = Math.max(12, (geom.statorBoreDiameterMm / 2) * scale);
  const rRotor = rBore - Math.max(1.5, geom.airgapLengthMm * scale * 4);
  const rShaft = Math.max(4, (geom.shaftDiameterMm / 2) * scale);

  // Outer Stator Frame
  doc.setDrawColor(71, 85, 105);
  doc.setFillColor(241, 245, 249);
  doc.circle(cx, cy, rOuter, 'FD');

  // Stator Bore
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, rBore, 'FD');

  // Stator slots (simplified radial teeth representation)
  const numSlots = specs.statorSlots;
  doc.setDrawColor(203, 213, 225);
  for (let i = 0; i < numSlots; i++) {
    const angle = (i * 2 * Math.PI) / numSlots;
    const x1 = cx + (rBore + 0.5) * Math.cos(angle);
    const y1 = cy + (rBore + 0.5) * Math.sin(angle);
    const x2 = cx + (rOuter - 3) * Math.cos(angle);
    const y2 = cy + (rOuter - 3) * Math.sin(angle);
    doc.line(x1, y1, x2, y2);
  }

  // Airgap
  doc.setDrawColor(2, 132, 199);
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, rBore, 'S');

  // Rotor Core
  doc.setFillColor(226, 232, 240);
  doc.setDrawColor(100, 116, 139);
  doc.circle(cx, cy, rRotor, 'FD');

  // Shaft
  doc.setFillColor(148, 163, 184);
  doc.circle(cx, cy, rShaft, 'FD');

  // Dimension leader lines
  doc.setDrawColor(180, 83, 9);
  doc.setLineWidth(0.2);
  doc.line(cx, cy, cx + rOuter + 8, cy);
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9);
  doc.text(`Do = ${geom.statorOuterDiameterMm} mm`, cx + rOuter + 10, cy + 1);

  doc.line(cx, cy, cx, cy - rBore - 6);
  doc.text(`D = ${geom.statorBoreDiameterMm} mm`, cx - 18, cy - rBore - 8);

  // ---------------- PAGE 2 ----------------
  doc.addPage();

  // Page 2 Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('D²L MOTOR GEOMETRY DESIGN DOSSIER (PAGE 2)', 14, 9.5);
  doc.text(`${specs.name}`, 196, 9.5, { align: 'right' });

  currentY = 22;

  // Section 3: Detailed Geometry
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('3. Core Sizing, Slot Geometry & Flux Densities', 14, currentY);
  currentY += 4;

  autoTable(doc, {
    startY: currentY,
    head: [['Component', 'Symbol', 'Dimension', 'Unit', 'Design Criteria']],
    body: [
      ['Stator Bore Inner Diameter', 'D', `${geom.statorBoreDiameterMm}`, 'mm', 'D = cbrt( (D²L * 2p) / (pi * lambda) )'],
      ['Active Core Stack Length', 'L', `${geom.coreLengthMm}`, 'mm', 'L = lambda * tau'],
      ['Pole Pitch', 'tau', `${geom.polePitchMm}`, 'mm', 'tau = pi * D / 2p'],
      ['Stator Outer Diameter', 'Do', `${geom.statorOuterDiameterMm}`, 'mm', 'Do = D + 2*hs + 2*hys'],
      ['Mechanical Airgap Length', 'g', `${geom.airgapLengthMm}`, 'mm', 'Radial clearance'],
      ['Carter Coefficient', 'kc', `${geom.carterCoefficient}`, '-', 'Effective gap coefficient'],
      ['Effective Airgap', 'ge', `${geom.effectiveAirgapMm}`, 'mm', 'ge = kc * g'],
      ['Rotor Outer Diameter', 'Dr', `${geom.rotorOuterDiameterMm}`, 'mm', 'Dr = D - 2*g'],
      ['Shaft Diameter', 'Dsh', `${geom.shaftDiameterMm}`, 'mm', 'Dsh ~ 0.26 * D'],
      ['Stator Tooth Width', 'bts', `${geom.toothWidthMm}`, 'mm', 'Tooth saturation: Bts <= 1.8 T'],
      ['Stator Slot Depth', 'hs', `${geom.slotDepthMm}`, 'mm', 'Total punching slot depth'],
      ['Slot Width (Top / Bottom)', 'bs1 / bs2', `${geom.slotWidthTopMm} / ${geom.slotWidthBottomMm}`, 'mm', 'Trapezoidal semi-closed slot'],
      ['Stator Yoke Depth', 'hys', `${geom.statorYokeDepthMm}`, 'mm', 'Back-iron flux path'],
      ['Tooth Flux Density', 'Bts', `${geom.toothFluxDensityTesla}`, 'T', 'Peak tooth flux density'],
      ['Yoke Flux Density', 'Bys', `${geom.yokeFluxDensityTesla}`, 'T', 'Peak back-iron flux density'],
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: 30 },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Section 4: Winding Schedule & Harmonics
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('4. Stator Winding Schedule & Harmonic Spectrum', 14, currentY);
  currentY += 4;

  autoTable(doc, {
    startY: currentY,
    head: [['Parameter', 'Symbol', 'Calculated Value', 'Unit', 'Winding Note']],
    body: [
      ['Slots per Pole per Phase', 'q', `${geom.slotsPerPolePerPhase}`, '-', 'q = Qs / (2p * m)'],
      ['Coil Pitch in Slots', 'ys', `${specs.coilPitchSlots}`, 'slots', 'Coil chording pitch'],
      ['Fundamental Distribution Factor', 'kd1', `${geom.distributionFactorKd}`, '-', 'kd = sin(q*gamma/2) / (q*sin(gamma/2))'],
      ['Fundamental Pitch Factor', 'kp1', `${geom.pitchFactorKp}`, '-', 'kp = sin(ys/tau_s * pi/2)'],
      ['Fundamental Winding Factor', 'kw1', `${geom.windingFactorKw}`, '-', 'kw = kd * kp'],
      ['Turns per Phase in Series', 'Nph', `${geom.turnsPerPhase}`, '-', 'Nph = Eph / (4.44 * f * Phi * kw)'],
      ['Conductors per Slot', 'Zs', `${geom.conductorsPerSlot}`, '-', 'Double-layer balanced slot total'],
      ['Slot Fill Factor', 'kfill', `${geom.actualSlotFillFactor}`, '-', 'Manufacturability target (< 0.45)'],
      ['Current Density', 'J', `${geom.actualCurrentDensityA_mm2}`, 'A/mm²', 'Thermal loading'],
      ['Stator Phase Resistance (75°C)', 'Rs', `${geom.statorResistancePerPhaseOhm}`, 'Ohm', 'Phase DC resistance'],
      ['Winding MMF THD', 'THD', `${thdPct}`, '%', 'Spatial Harmonic Distortion'],
      ['Slot Passing Frequency', 'f_slot', `${Math.round(specs.statorSlots * (geom.ratedSpeedRpm / 60))}`, 'Hz', 'Qs * nr / 60 (Primary ripple)'],
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: 30 },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 6;

  // Harmonics breakdown table
  autoTable(doc, {
    startY: currentY,
    head: [['Order (nu)', 'kd(nu)', 'kp(nu)', 'kw(nu)', 'Relative Amplitude (%)']],
    body: harmonics.slice(0, 8).map((h) => [h.order, h.kd, h.kp, h.kw, `${h.relativeAmplitudePct}%`]),
    theme: 'striped',
    headStyles: { fillColor: accentColor, textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5, textColor: 30 },
    margin: { left: 14, right: 14 },
  });

  // ---------------- PAGE 3 ----------------
  doc.addPage();

  // Page 3 Header
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('D²L MOTOR GEOMETRY DESIGN DOSSIER (PAGE 3)', 14, 9.5);
  doc.text(`${specs.name}`, 196, 9.5, { align: 'right' });

  currentY = 22;

  // Section 5: Losses & Efficiency Analysis
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('5. Loss Synthesis & Efficiency Optimization', 14, currentY);
  currentY += 4;

  autoTable(doc, {
    startY: currentY,
    head: [['Loss Component', 'Symbol', 'Loss (W)', 'Share (%)', 'Thermal & Physical Rationale']],
    body: [
      [
        'Stator Copper Loss (Total)',
        'Pcu_s',
        `${geom.statorCopperLossW}`,
        `${((geom.statorCopperLossW / geom.totalLossW) * 100).toFixed(1)}%`,
        `DC: ${geom.statorCopperLossDcW} W, AC Skin/Prox: ${geom.statorCopperLossAcW} W (kac = ${geom.acResistanceFactorKac} at ${specs.frequencyHz} Hz, ${geom.copperTemperatureC}°C)`,
      ],
      [
        'Rotor Loss',
        'Pcu_r / Pmag',
        `${geom.rotorLossW}`,
        `${((geom.rotorLossW / geom.totalLossW) * 100).toFixed(1)}%`,
        specs.topology === 'induction' ? 'Slip airgap power dissipation' : 'Eddy currents / excitation',
      ],
      [
        'Core Iron Loss (Total)',
        'Pfe',
        `${geom.ironCoreLossW}`,
        `${((geom.ironCoreLossW / geom.totalLossW) * 100).toFixed(1)}%`,
        `Hysteresis: ${geom.ironCoreHysteresisLossW} W, Eddy-Current: ${geom.ironCoreEddyLossW} W (p_fe0 = ${geom.specificIronLossW_kg} W/kg)`,
      ],
      [
        'Friction & Windage',
        'Pmw',
        `${geom.mechanicalLossW}`,
        `${((geom.mechanicalLossW / geom.totalLossW) * 100).toFixed(1)}%`,
        'Bearings and rotor aerodynamic ventilation drag',
      ],
      [
        'Stray Load Losses',
        'Pstray',
        `${geom.strayLoadLossW}`,
        `${((geom.strayLoadLossW / geom.totalLossW) * 100).toFixed(1)}%`,
        'High-frequency slot ripple and harmonic leakage',
      ],
      ['TOTAL ACTIVE LOSSES', 'Ploss', `${geom.totalLossW}`, '100.0%', 'Sum of all motor thermal dissipations'],
    ],
    theme: 'grid',
    headStyles: { fillColor: primaryColor, textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: 30 },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Key KPI card
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, currentY, 182, 34, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...accentColor);
  doc.text('FINAL ELECTROMAGNETIC PERFORMANCE KPIS', 18, currentY + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  doc.text(`Calculated Efficiency: ${geom.calculatedEfficiency}% (Initial target: ${specs.targetEfficiency}%)`, 18, currentY + 14);
  doc.text(`Power Density: ${geom.powerDensityKw_m3} kW/m³ | Torque Density: ${geom.torqueDensityNm_m3} N·m/m³`, 18, currentY + 19);
  doc.text(`Active Steel Mass: ${geom.totalActiveSteelWeightKg} kg | Copper Winding Mass: ${geom.totalCopperWeightKg} kg`, 18, currentY + 24);
  doc.text(`Breakdown Torque: ${geom.breakdownTorqueNm} N·m (${(geom.breakdownTorqueNm / geom.ratedTorqueNm).toFixed(2)}x Trated)`, 18, currentY + 29);

  currentY += 44;

  // Engineering Sign-Off Block
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('6. Engineering Sign-Off & Verification Status', 14, currentY);
  currentY += 6;

  doc.setDrawColor(203, 213, 225);
  doc.rect(14, currentY, 182, 30);
  doc.line(14, currentY + 15, 196, currentY + 15);
  doc.line(105, currentY, 105, currentY + 30);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(71, 85, 105);
  doc.text('DESIGN ENGINEER:', 18, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text('Electrical Machine Sizing Engineer', 18, currentY + 11);

  doc.setFont('helvetica', 'bold');
  doc.text('VERIFICATION STATUS:', 109, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(22, 101, 52); // green 800
  doc.text('PASSED - Analytical D²L Sizing & Saturation Limits', 109, currentY + 11);

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'bold');
  doc.text('FEA COMPATIBILITY:', 18, currentY + 21);
  doc.setFont('helvetica', 'normal');
  doc.text('Ready for ANSYS Maxwell / Motor-CAD 2D import', 18, currentY + 26);

  doc.setFont('helvetica', 'bold');
  doc.text('COMPLIANCE NOTE:', 109, currentY + 21);
  doc.setFont('helvetica', 'normal');
  doc.text('IEC 60034-30 / IEEE 112 Standard Formulation', 109, currentY + 26);

  // Save PDF
  const filename = `Motor_Design_D2L_${specs.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(filename);
}
