/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MotorSpecs, CalculatedGeometry } from '../types/motor';

export interface EfficiencyMapGridPoint {
  speedRpm: number;
  torqueNm: number;
  powerKw: number;
  efficiencyPct: number;
  copperLossW: number;
  ironLossW: number;
  mechanicalLossW: number;
  totalLossW: number;
  isWithinContinuousLimit: boolean;
  isWithinPeakLimit: boolean;
}

export interface DriveCycleOperatingPoint {
  id: string;
  name: string;
  category: 'urban' | 'suburban' | 'highway' | 'overload' | 'rated';
  speedRpm: number;
  torqueNm: number;
  powerKw: number;
  efficiencyPct: number;
  timeWeightPct: number;
  description: string;
}

export interface EfficiencyContourBand {
  minEff: number;
  maxEff: number;
  label: string;
  color: string;
  fillOpacity: number;
}

export interface EfficiencyMapResult {
  baseSpeedRpm: number;
  maxSpeedRpm: number;
  ratedTorqueNm: number;
  peakTorqueNm: number;
  peakEfficiencyPct: number;
  sweetSpotSpeedRpm: number;
  sweetSpotTorqueNm: number;
  continuousEnvelope: { speedRpm: number; maxTorqueNm: number }[];
  peakEnvelope: { speedRpm: number; maxTorqueNm: number }[];
  gridPoints: EfficiencyMapGridPoint[];
  driveCyclePoints: DriveCycleOperatingPoint[];
  weightedCycleEfficiencyPct: number;
  contourBands: EfficiencyContourBand[];
}

export const EFFICIENCY_CONTOUR_BANDS: EfficiencyContourBand[] = [
  { minEff: 95.5, maxEff: 100, label: '≥ 95.5% (Sweet Spot)', color: '#10b981', fillOpacity: 0.85 },
  { minEff: 94.0, maxEff: 95.5, label: '94.0 - 95.5%', color: '#06b6d4', fillOpacity: 0.75 },
  { minEff: 92.0, maxEff: 94.0, label: '92.0 - 94.0%', color: '#0284c7', fillOpacity: 0.65 },
  { minEff: 89.0, maxEff: 92.0, label: '89.0 - 92.0%', color: '#3b82f6', fillOpacity: 0.55 },
  { minEff: 85.0, maxEff: 89.0, label: '85.0 - 89.0%', color: '#eab308', fillOpacity: 0.45 },
  { minEff: 80.0, maxEff: 85.0, label: '80.0 - 85.0%', color: '#f97316', fillOpacity: 0.40 },
  { minEff: 0.0, maxEff: 80.0, label: '< 80.0%', color: '#ef4444', fillOpacity: 0.35 },
];

/**
 * Generates an analytical Efficiency Map across the complete torque-speed operating envelope,
 * including constant torque (MTPA), field-weakening constant power, and high-speed overflux boundaries.
 */
export function calculateEfficiencyMap(
  specs: MotorSpecs,
  geom: CalculatedGeometry,
  cycleStandard: 'iec_industrial' | 'wltp_traction' = 'iec_industrial'
): EfficiencyMapResult {
  const n_base = Math.max(100, geom.ratedSpeedRpm);
  const n_max = Math.round(n_base * (specs.topology?.includes('pmsm') ? 2.5 : 2.2));
  const T_rated = Math.max(0.5, geom.ratedTorqueNm);
  const T_peak = Math.max(T_rated * 1.5, geom.breakdownTorqueNm);

  // Rated loss references
  const Pcu_rated = Math.max(1, geom.statorCopperLossW + geom.rotorLossW);
  const Pfe_rated = Math.max(1, geom.ironCoreLossW);
  const Pmw_rated = Math.max(1, geom.mechanicalLossW);
  const Pstray_rated = Math.max(1, geom.strayLoadLossW);

  // 1. Generate Continuous & Peak Operating Envelopes
  const envSteps = 30;
  const continuousEnvelope = [];
  const peakEnvelope = [];

  for (let i = 0; i <= envSteps; i++) {
    const n = Math.round((i / envSteps) * n_max);
    if (n === 0) continue;

    // Continuous Envelope: Constant torque up to n_base, then constant power (T ~ 1/n)
    let t_cont = T_rated;
    if (n > n_base) {
      t_cont = T_rated * (n_base / n);
      // Field weakening voltage limit rolloff (T ~ 1/n^1.4 at high speeds)
      if (n > n_base * 1.6) {
        t_cont = t_cont * Math.pow(n_base * 1.6 / n, 0.4);
      }
    }
    continuousEnvelope.push({ speedRpm: n, maxTorqueNm: Number(t_cont.toFixed(2)) });

    // Peak (30-second overload) Envelope:
    let t_pk = T_peak;
    if (n > n_base) {
      t_pk = T_peak * (n_base / n);
      if (n > n_base * 1.6) {
        t_pk = t_pk * Math.pow(n_base * 1.6 / n, 0.4);
      }
    }
    peakEnvelope.push({ speedRpm: n, maxTorqueNm: Number(t_pk.toFixed(2)) });
  }

  // 2. Generate Grid of Points across (n, T)
  const numSpeedCols = 24;
  const numTorqueRows = 18;
  const gridPoints: EfficiencyMapGridPoint[] = [];

  let highestEff = 0;
  let sweetN = n_base;
  let sweetT = T_rated * 0.75;

  for (let s = 1; s <= numSpeedCols; s++) {
    const n = Math.round((s / numSpeedCols) * n_max);
    const speedRatio = n / n_base;

    // Find envelope limit at this speed
    const contLimit = continuousEnvelope.reduce((p, c) =>
      Math.abs(c.speedRpm - n) < Math.abs(p.speedRpm - n) ? c : p
    ).maxTorqueNm;

    const peakLimit = peakEnvelope.reduce((p, c) =>
      Math.abs(c.speedRpm - n) < Math.abs(p.speedRpm - n) ? c : p
    ).maxTorqueNm;

    for (let r = 1; r <= numTorqueRows; r++) {
      const t = Number(((r / numTorqueRows) * T_peak).toFixed(2));
      const torqueRatio = t / T_rated;

      const pShaftW = (t * n * 2 * Math.PI) / 60;
      if (pShaftW <= 0) continue;

      // Analytical Loss Model:
      // Copper loss scales with torque squared: Pcu ~ (T/Tn)^2
      // Field weakening at high speed requires extra Id demagnetizing current:
      const fwCurrentFactor = n > n_base ? 1 + 0.35 * Math.pow((n - n_base) / n_base, 1.3) : 1.0;
      const pCu = Pcu_rated * Math.pow(torqueRatio, 2) * fwCurrentFactor;

      // Iron loss: scales with frequency and flux: Pfe ~ f^1.4 * B^2
      // Under field weakening (n > n_base), flux drops as 1/n, so iron loss levels off:
      const fluxWeakeningRatio = n > n_base ? Math.max(0.45, n_base / n) : 1.0;
      const pFe = Pfe_rated * Math.pow(speedRatio, 1.45) * Math.pow(fluxWeakeningRatio, 1.8);

      // Mechanical friction & windage loss scales with speed squared: Pmw ~ n^2
      const pMech = Pmw_rated * Math.pow(speedRatio, 2.1);

      // Stray loss scales with load and frequency:
      const pStray = Pstray_rated * Math.pow(torqueRatio, 1.8) * Math.pow(speedRatio, 1.2);

      const totalLoss = pCu + pFe + pMech + pStray;
      const eff = Math.min(98.8, Math.max(40, (pShaftW / (pShaftW + totalLoss)) * 100));
      const effRounded = Number(eff.toFixed(2));

      if (effRounded > highestEff && t <= contLimit) {
        highestEff = effRounded;
        sweetN = n;
        sweetT = t;
      }

      gridPoints.push({
        speedRpm: n,
        torqueNm: t,
        powerKw: Number((pShaftW / 1000).toFixed(2)),
        efficiencyPct: effRounded,
        copperLossW: Math.round(pCu),
        ironLossW: Math.round(pFe),
        mechanicalLossW: Math.round(pMech),
        totalLossW: Math.round(totalLoss),
        isWithinContinuousLimit: t <= contLimit * 1.02,
        isWithinPeakLimit: t <= peakLimit * 1.02,
      });
    }
  }

  // 3. Predefined Standard Drive Cycle Operating Points
  const driveCyclePoints: DriveCycleOperatingPoint[] = cycleStandard === 'iec_industrial'
    ? [
        {
          id: 'iec_s1_rated',
          name: 'IEC S1 - Continuous Rated Full-Load',
          category: 'rated',
          speedRpm: n_base,
          torqueNm: Number(T_rated.toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 40,
          description: 'S1 continuous steady-state operation at 100% nominal speed and torque.',
        },
        {
          id: 'iec_s3_intermittent',
          name: 'IEC S3 - 40% Intermittent Heavy Duty',
          category: 'overload',
          speedRpm: Math.round(n_base * 0.90),
          torqueNm: Number((T_rated * 1.25).toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 25,
          description: 'Periodic crane/hoist load pulses at 125% rated torque without thermal equilibrium.',
        },
        {
          id: 'iec_s6_continuous_intermittent',
          name: 'IEC S6 - Continuous with Intermittent Overload',
          category: 'suburban',
          speedRpm: Math.round(n_base * 1.05),
          torqueNm: Number((T_rated * 1.15).toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 15,
          description: 'Conveyor/pump duty alternating between 115% full load and no-load idling.',
        },
        {
          id: 'iec_s9_inverter_fw',
          name: 'IEC S9 - Field-Weakening High-Speed Inverter Drive',
          category: 'highway',
          speedRpm: Math.round(n_base * 1.65),
          torqueNm: Number((T_rated * 0.45).toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 15,
          description: 'High-speed field weakening operating point with elevated iron losses.',
        },
        {
          id: 'iec_s2_peak_burst',
          name: 'IEC S2 - 150% Short-Time Peak Burst',
          category: 'overload',
          speedRpm: Math.round(n_base * 0.80),
          torqueNm: Number((T_rated * 1.50).toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 5,
          description: 'Short-duration acceleration pulse up to 150% rated torque limit.',
        },
      ]
    : [
        {
          id: 'dc_urban',
          name: 'City Driving (Urban Stop-and-Go)',
          category: 'urban',
          speedRpm: Math.round(n_base * 0.35),
          torqueNm: Number((T_rated * 0.60).toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 35,
          description: 'Low-speed stop/start acceleration where copper losses dominate.',
        },
        {
          id: 'dc_suburban',
          name: 'Suburban Arterial Commute (40-60 km/h)',
          category: 'suburban',
          speedRpm: Math.round(n_base * 0.70),
          torqueNm: Number((T_rated * 0.45).toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 25,
          description: 'Balanced torque-speed point operating inside the high-efficiency sweet spot.',
        },
        {
          id: 'dc_highway',
          name: 'Highway Cruising (100-120 km/h)',
          category: 'highway',
          speedRpm: Math.round(n_base * 1.45),
          torqueNm: Number((T_rated * 0.38).toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 25,
          description: 'Field-weakened high-speed operating point where iron and windage losses rise.',
        },
        {
          id: 'dc_rated',
          name: 'Rated Continuous Full Load',
          category: 'rated',
          speedRpm: n_base,
          torqueNm: Number(T_rated.toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 10,
          description: 'Baseline catalog specification operating point at thermal equilibrium.',
        },
        {
          id: 'dc_overtake',
          name: 'Peak Hill-Climb / Highway Overtake',
          category: 'overload',
          speedRpm: Math.round(n_base * 0.85),
          torqueNm: Number((T_rated * 1.45).toFixed(2)),
          powerKw: 0,
          efficiencyPct: 0,
          timeWeightPct: 5,
          description: '30-second transient overload accelerating near peak breakdown torque.',
        },
      ];

  // Evaluate exact efficiency for each drive cycle point
  let weightedEffSum = 0;
  let totalWeight = 0;

  driveCyclePoints.forEach((pt) => {
    const pShaftW = (pt.torqueNm * pt.speedRpm * 2 * Math.PI) / 60;
    pt.powerKw = Number((pShaftW / 1000).toFixed(2));

    const sRatio = pt.speedRpm / n_base;
    const tRatio = pt.torqueNm / T_rated;
    const fwFactor = pt.speedRpm > n_base ? 1 + 0.35 * Math.pow((pt.speedRpm - n_base) / n_base, 1.3) : 1.0;
    const pCu = Pcu_rated * Math.pow(tRatio, 2) * fwFactor;
    const fluxWeak = pt.speedRpm > n_base ? Math.max(0.45, n_base / pt.speedRpm) : 1.0;
    const pFe = Pfe_rated * Math.pow(sRatio, 1.45) * Math.pow(fluxWeak, 1.8);
    const pMech = Pmw_rated * Math.pow(sRatio, 2.1);
    const pStray = Pstray_rated * Math.pow(tRatio, 1.8) * Math.pow(sRatio, 1.2);

    const totLoss = pCu + pFe + pMech + pStray;
    const eff = Math.min(98.8, Math.max(40, (pShaftW / (pShaftW + totLoss)) * 100));
    pt.efficiencyPct = Number(eff.toFixed(2));

    weightedEffSum += pt.efficiencyPct * pt.timeWeightPct;
    totalWeight += pt.timeWeightPct;
  });

  const weightedCycleEfficiencyPct = Number((weightedEffSum / totalWeight).toFixed(2));

  return {
    baseSpeedRpm: n_base,
    maxSpeedRpm: n_max,
    ratedTorqueNm: T_rated,
    peakTorqueNm: T_peak,
    peakEfficiencyPct: highestEff,
    sweetSpotSpeedRpm: sweetN,
    sweetSpotTorqueNm: sweetT,
    continuousEnvelope,
    peakEnvelope,
    gridPoints,
    driveCyclePoints,
    weightedCycleEfficiencyPct,
    contourBands: EFFICIENCY_CONTOUR_BANDS,
  };
}
