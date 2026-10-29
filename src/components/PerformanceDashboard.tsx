/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  MotorSpecs,
  CalculatedGeometry,
  MaterialLimitsConfig,
  MaterialValidationResult,
} from '../types/motor';
import { generateTorqueSpeedCurve, calculateMotorGeometry } from '../utils/motorCalculations';
import {
  COOLING_OPTIONS,
  INSULATION_OPTIONS,
  STEEL_GRADE_OPTIONS,
  evaluateMaterialLimits,
} from '../utils/materialLimits';
import {
  analyzeHarmonicsAndEmi,
  EmiDesignAdjustment,
  HarmonicEmiAnalysisResult,
  BackEmfHarmonicPoint,
} from '../utils/harmonicEmiAnalysis';
import {
  analyzeRadialForceAndNvh,
  NvhAnalysisResult,
  RadialForceHarmonic,
} from '../utils/nvhAnalysis';
import {
  analyzeTorqueRipple,
  TorqueRippleAnalysisResult,
  TorqueHarmonicComponent,
  TorqueWaveformPoint,
} from '../utils/torqueRippleAnalysis';
import {
  calculateMagneticFieldHeatmap,
  getMagneticColor,
  MagneticHeatmapResult,
  SaturationHotspot,
} from '../utils/magneticFieldHeatmap';
import {
  Activity,
  Zap,
  Sparkles,
  PieChart,
  CheckCircle2,
  BookOpen,
  Thermometer,
  Magnet,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
  Flame,
  Layers,
  ArrowRight,
  Radio,
  Sliders,
  Check,
  ShieldAlert,
  Cpu,
  Waves,
  Volume2,
  VolumeX,
  Gauge,
  Info,
  BarChart3,
  TrendingDown,
  Wind,
  RotateCcw,
  Crosshair,
} from 'lucide-react';

interface PerformanceDashboardProps {
  specs: MotorSpecs;
  geom: CalculatedGeometry;
  onApplyOptimizedSpecs: (updatedSpecs: MotorSpecs) => void;
  materialConfig: MaterialLimitsConfig;
  onChangeMaterialConfig: (config: MaterialLimitsConfig) => void;
}

export const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({
  specs,
  geom,
  onApplyOptimizedSpecs,
  materialConfig,
  onChangeMaterialConfig,
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [skewAngleSlots, setSkewAngleSlots] = useState<number>(0);
  const [selectedHarmonic, setSelectedHarmonic] = useState<BackEmfHarmonicPoint | null>(null);
  const [appliedAdjustmentIds, setAppliedAdjustmentIds] = useState<string[]>([]);
  const [selectedNvhMode, setSelectedNvhMode] = useState<number>(2);
  const [lossStackMode, setLossStackMode] = useState<'relative' | 'power_flow'>('relative');
  const [selectedLossCategory, setSelectedLossCategory] = useState<string | null>(null);
  const [showCoggingOverlay, setShowCoggingOverlay] = useState<boolean>(true);
  const [showHarmonicEnvelope, setShowHarmonicEnvelope] = useState<boolean>(true);
  const [showRippleBand, setShowRippleBand] = useState<boolean>(true);
  const [hoveredTorquePoint, setHoveredTorquePoint] = useState<TorqueWaveformPoint | null>(null);
  const [selectedTorqueHarmonic, setSelectedTorqueHarmonic] = useState<TorqueHarmonicComponent | null>(null);

  // Magnetic flux density heat map state hooks
  const [selectedHotspot, setSelectedHotspot] = useState<SaturationHotspot | null>(null);
  const [showIsoFluxLines, setShowIsoFluxLines] = useState<boolean>(true);
  const [showHotspotBeacons, setShowHotspotBeacons] = useState<boolean>(true);
  const [hoveredMagneticZone, setHoveredMagneticZone] = useState<string | null>(null);
  const [magneticZoomSector, setMagneticZoomSector] = useState<'full' | 'pole_sector'>('full');

  const [optimizedCandidate, setOptimizedCandidate] = useState<{
    specs: MotorSpecs;
    geom: CalculatedGeometry;
    efficiencyGainPct: number;
    lossReductionW: number;
  } | null>(null);

  const curvePoints = generateTorqueSpeedCurve(specs, geom, 60);

  // Evaluate current design against material limits
  const validation: MaterialValidationResult = evaluateMaterialLimits(
    geom.actualCurrentDensityA_mm2,
    geom.toothFluxDensityTesla,
    geom.yokeFluxDensityTesla,
    materialConfig
  );

  // Cross-sectional magnetic flux density FEA heatmap analysis & saturation hotspots
  const magneticHeatmap: MagneticHeatmapResult = calculateMagneticFieldHeatmap(
    specs,
    geom,
    materialConfig.steelGrade
  );

  // Harmonic and EMI analysis calculation
  const harmonicAnalysis: HarmonicEmiAnalysisResult = analyzeHarmonicsAndEmi(
    specs,
    geom,
    skewAngleSlots
  );

  // Analytical Maxwell radial force density & stator NVH acoustic analysis
  const nvhAnalysis: NvhAnalysisResult = analyzeRadialForceAndNvh(specs, geom);

  // Simulated torque ripple waveform and cogging torque analysis
  const torqueRippleAnalysis: TorqueRippleAnalysisResult = analyzeTorqueRipple(
    specs,
    geom,
    skewAngleSlots
  );

  const handleApplyAdjustment = (adj: EmiDesignAdjustment) => {
    if (adj.actionableSpecsUpdate) {
      onApplyOptimizedSpecs({ ...specs, ...adj.actionableSpecsUpdate });
      setAppliedAdjustmentIds((prev) => [...prev, adj.id]);
    } else if (adj.category === 'skewing') {
      setSkewAngleSlots(1.0);
      setAppliedAdjustmentIds((prev) => [...prev, adj.id]);
    }
  };

  // Selected steel grade details
  const selectedSteel =
    STEEL_GRADE_OPTIONS.find((s) => s.id === materialConfig.steelGrade) ??
    STEEL_GRADE_OPTIONS[0];

  // SVG dimensions for Torque-Speed Plot
  const plotW = 600;
  const plotH = 240;
  const padLeft = 55;
  const padBottom = 35;
  const padTop = 20;
  const padRight = 30;

  const maxSpeed = Math.max(...curvePoints.map((p) => p.speedRpm));
  const maxTorque = Math.max(...curvePoints.map((p) => p.torqueNm), geom.breakdownTorqueNm * 1.05);

  const getX = (speed: number) => padLeft + (speed / maxSpeed) * (plotW - padLeft - padRight);
  const getY = (torque: number) =>
    plotH - padBottom - (torque / maxTorque) * (plotH - padTop - padBottom);

  const handleRunOptimizer = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      let bestSpecs = { ...specs };
      let bestGeom = geom;
      let highestEff = geom.calculatedEfficiency;

      const baseAc = specs.specificElectricLoading;
      const baseJ = specs.currentDensityA_mm2;

      for (let l = 0.85; l <= 2.1; l += 0.05) {
        for (let acScale of [0.92, 0.96, 1.0, 1.04, 1.08]) {
          const testSpecs: MotorSpecs = {
            ...specs,
            aspectRatio: Number(l.toFixed(2)),
            specificElectricLoading: Math.round(baseAc * acScale),
            currentDensityA_mm2: Number((baseJ * (1 / Math.sqrt(acScale))).toFixed(2)),
          };
          const testGeom = calculateMotorGeometry(testSpecs, materialConfig);

          if (
            testGeom.toothFluxDensityTesla <= validation.maxToothFluxTesla &&
            testGeom.yokeFluxDensityTesla <= validation.maxYokeFluxTesla &&
            testGeom.actualSlotFillFactor <= 0.44
          ) {
            if (testGeom.calculatedEfficiency > highestEff) {
              highestEff = testGeom.calculatedEfficiency;
              bestSpecs = testSpecs;
              bestGeom = testGeom;
            }
          }
        }
      }

      const effGain = Number((bestGeom.calculatedEfficiency - geom.calculatedEfficiency).toFixed(2));
      const lossRed = geom.totalLossW - bestGeom.totalLossW;

      setOptimizedCandidate({
        specs: bestSpecs,
        geom: bestGeom,
        efficiencyGainPct: effGain,
        lossReductionW: lossRed,
      });
      setIsOptimizing(false);
    }, 250);
  };

  // Segregated loss items
  const lossItems = [
    {
      name: 'Stator Copper Loss (Total)',
      symbol: 'Pcu_s',
      val: geom.statorCopperLossW,
      color: '#ef4444',
      cite: `DC: ${geom.statorCopperLossDcW} W, AC Skin/Prox: ${geom.statorCopperLossAcW} W (kac = ${geom.acResistanceFactorKac} at ${specs.frequencyHz} Hz, ${geom.copperTemperatureC}°C)`,
    },
    {
      name: 'Core Iron Loss (Total)',
      symbol: 'Pfe',
      val: geom.ironCoreLossW,
      color: '#3b82f6',
      cite: `Hysteresis: ${geom.ironCoreHysteresisLossW} W, Eddy: ${geom.ironCoreEddyLossW} W (${selectedSteel.name}, p_fe0 = ${geom.specificIronLossW_kg} W/kg)`,
    },
    {
      name: 'Rotor Loss',
      symbol: 'Pcu_r / Pmag',
      val: geom.rotorLossW,
      color: '#f97316',
      cite: specs.topology === 'induction' ? 'Induction slip airgap power dissipation' : 'Magnet eddy current loss',
    },
    {
      name: 'Friction & Windage',
      symbol: 'Pmw',
      val: geom.mechanicalLossW,
      color: '#10b981',
      cite: 'Mechanical bearing friction & aero drag (IEEE Std 112)',
    },
    {
      name: 'Stray Load Loss',
      symbol: 'Pstray',
      val: geom.strayLoadLossW,
      color: '#8b5cf6',
      cite: 'Harmonic leakage flux losses (IEC 60034-2-1)',
    },
  ];

  // Aggregated loss categories for stacked bar chart
  const copperTotalW = geom.statorCopperLossW + geom.rotorLossW;
  const ironTotalW = geom.ironCoreLossW;
  const mechTotalW = geom.mechanicalLossW;
  const strayTotalW = geom.strayLoadLossW;
  const totalLossW = Math.max(1, geom.totalLossW);

  const pShaftW = specs.powerKw * 1000;
  const pInW = pShaftW + totalLossW;

  const pctCu = Number(((copperTotalW / totalLossW) * 100).toFixed(1));
  const pctFe = Number(((ironTotalW / totalLossW) * 100).toFixed(1));
  const pctMech = Number(((mechTotalW / totalLossW) * 100).toFixed(1));
  const pctStray = Number(((strayTotalW / totalLossW) * 100).toFixed(1));

  const pctShaftIn = Number(((pShaftW / pInW) * 100).toFixed(1));
  const pctCuIn = Number(((copperTotalW / pInW) * 100).toFixed(1));
  const pctFeIn = Number(((ironTotalW / pInW) * 100).toFixed(1));
  const pctMechIn = Number(((mechTotalW / pInW) * 100).toFixed(1));
  const pctStrayIn = Number(((strayTotalW / pInW) * 100).toFixed(1));

  // Thermal resistance and temperature sensitivity modeling
  const currentTemp = geom.copperTemperatureC;
  const insulationLimitC =
    materialConfig.insulation === 'class_b_130'
      ? 130
      : materialConfig.insulation === 'class_f_155'
      ? 155
      : 180;
  const isCustomTemp = materialConfig.customWindingTemperatureC !== undefined;

  const r20 = geom.statorResistance20COhm ?? 0.045;
  const r75 = geom.statorResistance75COhm ?? Number((r20 * (1 + 0.00393 * 55)).toFixed(4));
  const rOper = geom.statorResistancePerPhaseOhm;
  const rIncreasePct = geom.resistanceIncreasePercent ?? Number((((rOper - r20) / r20) * 100).toFixed(1));

  const pCu20W = Math.round(3 * Math.pow(geom.phaseCurrentA, 2) * r20 * geom.acResistanceFactorKac);
  const copperLossDeltaW = geom.statorCopperLossW - pCu20W;

  const eff20 = (() => {
    const pShaft = specs.powerKw * 1000;
    const totalLoss20 = pCu20W + geom.rotorLossW + geom.ironCoreLossW + geom.mechanicalLossW + geom.strayLoadLossW;
    return Number(((pShaft / (pShaft + totalLoss20)) * 100).toFixed(2));
  })();
  const effDeltaPct = Number((geom.calculatedEfficiency - eff20).toFixed(2));

  let thermalSafetyStatus: 'safe' | 'nominal' | 'caution' | 'exceeded' = 'nominal';
  if (currentTemp <= 75) {
    thermalSafetyStatus = 'safe';
  } else if (currentTemp <= insulationLimitC - 15) {
    thermalSafetyStatus = 'nominal';
  } else if (currentTemp <= insulationLimitC) {
    thermalSafetyStatus = 'caution';
  } else {
    thermalSafetyStatus = 'exceeded';
  }

  // Sensitivity curve (20°C to 200°C)
  const tempSensitivityCurve = [20, 40, 60, 75, 95, 115, 130, 155, 180, 200].map((t) => {
    const r_t = r20 * (1 + 0.00393 * (t - 20));
    const pCu_t = 3 * Math.pow(geom.phaseCurrentA, 2) * r_t * geom.acResistanceFactorKac;
    const totLoss_t = pCu_t + geom.rotorLossW + geom.ironCoreLossW + geom.mechanicalLossW + geom.strayLoadLossW;
    const eff_t = Number(((specs.powerKw * 1000) / (specs.powerKw * 1000 + totLoss_t) * 100).toFixed(2));
    return {
      t,
      r_t: Number(r_t.toFixed(4)),
      eff_t,
      pCu_t: Math.round(pCu_t),
    };
  });

  interface LossCategoryInfo {
    id: string;
    title: string;
    shortTitle: string;
    totalW: number;
    pctOfLoss: number;
    pctOfInput: number;
    color: string;
    lightColor: string;
    borderClass: string;
    governingFormula: string;
    rootCause: string;
    mitigationStrategy: string;
    subItems: { label: string; val: number; note: string }[];
  }

  const lossCategories: LossCategoryInfo[] = [
    {
      id: 'copper',
      title: 'Copper Losses (Stator & Rotor Winding)',
      shortTitle: 'Copper Loss',
      totalW: copperTotalW,
      pctOfLoss: pctCu,
      pctOfInput: pctCuIn,
      color: '#ef4444',
      lightColor: 'rgba(239, 68, 68, 0.15)',
      borderClass: 'border-rose-500/50',
      governingFormula: 'Pcu = m · I_ph² · Rs(T) + Pcu_rotor',
      rootCause: `Driven by slot current density J = ${geom.actualCurrentDensityA_mm2.toFixed(1)} A/mm² and phase winding resistance Rs = ${geom.statorResistancePerPhaseOhm.toFixed(3)} Ω at ${geom.copperTemperatureC}°C. AC skin & proximity factor kac = ${geom.acResistanceFactorKac.toFixed(2)} at ${specs.frequencyHz} Hz.`,
      mitigationStrategy: 'Enlarge slot cross-section, increase slot fill factor kfill, shorten end-turn overhang, or adopt multi-strand transposed/litz conductors to curb AC skin and proximity effect.',
      subItems: [
        { label: 'Stator DC Winding Loss', val: geom.statorCopperLossDcW, note: 'Ohmic resistance dissipation at operating temperature' },
        { label: 'Stator AC Skin / Proximity', val: geom.statorCopperLossAcW, note: `High-frequency eddy current crowding (kac = ${geom.acResistanceFactorKac.toFixed(2)})` },
        { label: 'Rotor Dissipation', val: geom.rotorLossW, note: specs.topology === 'induction' ? 'Rotor squirrel-cage slip power' : 'Permanent magnet eddy dissipation' },
      ],
    },
    {
      id: 'iron',
      title: 'Iron Core Losses (Teeth & Yoke)',
      shortTitle: 'Iron Core',
      totalW: ironTotalW,
      pctOfLoss: pctFe,
      pctOfInput: pctFeIn,
      color: '#0284c7',
      lightColor: 'rgba(2, 132, 199, 0.15)',
      borderClass: 'border-sky-500/50',
      governingFormula: 'Pfe = Ch · f · B^n + Ce · f² · d_lam² · B² (Jordan/Steinmetz)',
      rootCause: `High magnetic flux density peaks at Bts = ${geom.toothFluxDensityTesla.toFixed(2)} T in teeth and Bys = ${geom.yokeFluxDensityTesla.toFixed(2)} T in yoke at ${specs.frequencyHz} Hz (${selectedSteel.name}).`,
      mitigationStrategy: `Select thinner electrical steel sheets (e.g. 0.35 mm M250-35A or cobalt-iron Vacoflux) to choke classical eddy currents, or widen teeth by 0.5-1.0 mm to back away from magnetic knee saturation.`,
      subItems: [
        { label: 'Core Hysteresis Loss', val: geom.ironCoreHysteresisLossW, note: 'Magnetic domain wall friction per magnetization cycle' },
        { label: 'Classical Eddy Currents', val: geom.ironCoreEddyLossW, note: 'Micro-current loops proportional to lamination thickness d²' },
        { label: 'Tooth Core Share', val: geom.teethIronLossW, note: `High-flux tooth region (B = ${geom.toothFluxDensityTesla.toFixed(2)} T)` },
        { label: 'Yoke Return Share', val: geom.yokeIronLossW, note: `Circumferential yoke return (B = ${geom.yokeFluxDensityTesla.toFixed(2)} T)` },
      ],
    },
    {
      id: 'mechanical',
      title: 'Windage & Mechanical Friction',
      shortTitle: 'Friction / Windage',
      totalW: mechTotalW,
      pctOfLoss: pctMech,
      pctOfInput: pctMechIn,
      color: '#10b981',
      lightColor: 'rgba(16, 185, 129, 0.15)',
      borderClass: 'border-emerald-500/50',
      governingFormula: 'Pmw = k_fb · m_rotor · n + 2π · ρ_air · Cd · Rr⁴ · L · ω³',
      rootCause: `Aerodynamic drag on rotor cylinder and mechanical bearing friction at rated operating speed ${geom.ratedSpeedRpm} RPM (IEEE Std 112).`,
      mitigationStrategy: 'Adopt low-friction sealed hybrid ceramic ball bearings, refine rotor surface finishing to lower Taylor-Couette aerodynamic shear, and streamline internal air circulation fan blades.',
      subItems: [
        { label: 'Bearing Friction', val: Math.round(mechTotalW * 0.45), note: 'Mechanical contact friction on drive and non-drive bearings' },
        { label: 'Aerodynamic Drag & Windage', val: Math.round(mechTotalW * 0.55), note: 'Airgap rotational shear and cooling fan dissipation' },
      ],
    },
    {
      id: 'stray',
      title: 'Stray Load & Harmonic Losses',
      shortTitle: 'Stray Load',
      totalW: strayTotalW,
      pctOfLoss: pctStray,
      pctOfInput: pctStrayIn,
      color: '#8b5cf6',
      lightColor: 'rgba(139, 92, 246, 0.15)',
      borderClass: 'border-purple-500/50',
      governingFormula: 'Pstray = 0.005 … 0.015 · P_rated (IEC 60034-2-1 Standard)',
      rootCause: 'Spatial airgap harmonic permeance waves, slot leakage fringe fluxes, and end-plate eddy currents under rated stator current.',
      mitigationStrategy: 'Apply helical slot skewing (1.0 slot pitch) to decouple slot harmonics, fine-tune stator slot opening width bs0, or slightly increase mechanical airgap length.',
      subItems: [
        { label: 'Slot Harmonic Surface Loss', val: Math.round(strayTotalW * 0.65), note: 'Rotor pole surface eddy currents from stator tooth ripple' },
        { label: 'End-Region Leakage Flux', val: Math.round(strayTotalW * 0.35), note: 'Fringe field heating in structural clamp rings & housing' },
      ],
    },
  ];

  // Identify dominant loss mechanism
  const dominantLoss = [...lossCategories].sort((a, b) => b.totalW - a.totalW)[0];
  const activeLossCategory = lossCategories.find((c) => c.id === selectedLossCategory) || dominantLoss;

  const getStatusBadge = (status: 'nominal' | 'caution' | 'exceeded') => {
    switch (status) {
      case 'nominal':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-700/60">
            <ShieldCheck className="w-3 h-3" /> Nominal
          </span>
        );
      case 'caution':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-700/60">
            <AlertTriangle className="w-3 h-3" /> Caution (&gt;85%)
          </span>
        );
      case 'exceeded':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950/90 text-rose-300 border border-rose-600 animate-pulse">
            <AlertOctagon className="w-3 h-3 text-rose-400" /> Exceeded Limit
          </span>
        );
    }
  };

  const getMeterColor = (status: 'nominal' | 'caution' | 'exceeded') => {
    switch (status) {
      case 'nominal':
        return 'bg-gradient-to-r from-emerald-500 to-teal-400';
      case 'caution':
        return 'bg-gradient-to-r from-amber-500 to-yellow-400';
      case 'exceeded':
        return 'bg-gradient-to-r from-rose-600 to-red-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Academic Reference Citation Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start gap-3">
        <BookOpen className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300">
          <span className="font-semibold text-white">Authoritative Formulation Grounding:</span> Calculations strictly follow equations from{' '}
          <strong className="text-cyan-300">A.K. Sawhney</strong> (<em>A Course in Electrical Machine Design</em>),{' '}
          <strong className="text-cyan-300">J. Pyrhönen et al.</strong> (<em>Design of Rotating Electrical Machines</em>, Wiley), and{' '}
          <strong className="text-cyan-300">I. Boldea</strong> (<em>Induction & Synchronous Machine Design</em>, CRC Press).
        </div>
      </div>

      {/* Material-Specific Thermal & Magnetic Saturation Envelope Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-cyan-400" />
              Material-Specific Thermal & Magnetic Saturation Validator
            </h3>
            <p className="text-xs text-slate-400">
              Evaluates current stator current density (J) and tooth/yoke flux densities (B) against physical cooling, insulation, and electrical steel saturation limits.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Material Design Status:</span>
            {getStatusBadge(validation.overallStatus)}
          </div>
        </div>

        {/* Material Selection Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
          {/* Cooling Method Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-cyan-400" />
              Cooling Method (IEC 60034-6)
            </label>
            <select
              value={materialConfig.cooling}
              onChange={(e) =>
                onChangeMaterialConfig({
                  ...materialConfig,
                  cooling: e.target.value as any,
                })
              }
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500"
            >
              {COOLING_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500 font-mono block">
              {COOLING_OPTIONS.find((c) => c.id === materialConfig.cooling)?.typicalJRange} typical
            </span>
          </div>

          {/* Insulation Class Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Thermal Insulation Class
            </label>
            <select
              value={materialConfig.insulation}
              onChange={(e) =>
                onChangeMaterialConfig({
                  ...materialConfig,
                  insulation: e.target.value as any,
                })
              }
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500"
            >
              {INSULATION_OPTIONS.map((ins) => (
                <option key={ins.id} value={ins.id}>
                  {ins.name} (Max {ins.temperatureLimit}°C)
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500 font-mono block">
              Operating Temperature: {geom.copperTemperatureC}°C (ρ = {geom.copperResistivityOhm_mm2_m} Ω·mm²/m)
            </span>
          </div>

          {/* Electrical Steel Grade Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Magnet className="w-3.5 h-3.5 text-blue-400" />
              Electrical Steel Lamination
            </label>
            <select
              value={materialConfig.steelGrade}
              onChange={(e) =>
                onChangeMaterialConfig({
                  ...materialConfig,
                  steelGrade: e.target.value as any,
                })
              }
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500"
            >
              {STEEL_GRADE_OPTIONS.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} (Knee: {st.nominalKneeTesla} T)
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500 font-mono block">
              Specific Loss: {geom.specificIronLossW_kg} W/kg at 1.5 T, 50 Hz
            </span>
          </div>
        </div>

        {/* Real-Time Margin Meters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Thermal Current Density (J) Margin Meter */}
          <div
            className={`bg-slate-950 p-4 rounded-xl border transition-all ${
              validation.thermalStatus === 'exceeded'
                ? 'border-rose-600 bg-rose-950/20 shadow-lg shadow-rose-950/40'
                : validation.thermalStatus === 'caution'
                ? 'border-amber-600/70 bg-amber-950/10'
                : 'border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Thermometer
                  className={`w-4 h-4 ${
                    validation.thermalStatus === 'exceeded'
                      ? 'text-rose-400 animate-pulse'
                      : validation.thermalStatus === 'caution'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                />
                Thermal Current Density (J)
              </span>
              {getStatusBadge(validation.thermalStatus)}
            </div>

            <div className="flex items-baseline justify-between mb-2 font-mono">
              <div>
                <span className="text-2xl font-bold text-white">
                  {validation.currentDensityA_mm2}
                </span>
                <span className="text-xs text-slate-400 ml-1">A/mm²</span>
              </div>
              <div className="text-right text-xs text-slate-400">
                Limit: <strong className="text-white">{validation.maxCurrentDensityA_mm2}</strong> A/mm²
              </div>
            </div>

            <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800 mb-2">
              <div
                className={`h-full rounded-full transition-all duration-300 ${getMeterColor(
                  validation.thermalStatus
                )}`}
                style={{
                  width: `${Math.min(100, validation.currentDensityUtilizationPct)}%`,
                }}
              />
            </div>

            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>
                Utilization: <strong>{validation.currentDensityUtilizationPct}%</strong>
              </span>
              <span>
                Margin:{' '}
                <strong
                  className={
                    validation.maxCurrentDensityA_mm2 - validation.currentDensityA_mm2 < 0
                      ? 'text-rose-400 font-bold'
                      : 'text-emerald-400'
                  }
                >
                  {(validation.maxCurrentDensityA_mm2 - validation.currentDensityA_mm2).toFixed(2)} A/mm²
                </strong>
              </span>
            </div>
          </div>

          {/* Stator Tooth Flux Density (Bts) Saturation Meter */}
          <div
            className={`bg-slate-950 p-4 rounded-xl border transition-all ${
              validation.toothMagneticStatus === 'exceeded'
                ? 'border-rose-600 bg-rose-950/20 shadow-lg shadow-rose-950/40'
                : validation.toothMagneticStatus === 'caution'
                ? 'border-amber-600/70 bg-amber-950/10'
                : 'border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Magnet
                  className={`w-4 h-4 ${
                    validation.toothMagneticStatus === 'exceeded'
                      ? 'text-rose-400 animate-pulse'
                      : validation.toothMagneticStatus === 'caution'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                />
                Tooth Saturation Flux (Bts)
              </span>
              {getStatusBadge(validation.toothMagneticStatus)}
            </div>

            <div className="flex items-baseline justify-between mb-2 font-mono">
              <div>
                <span className="text-2xl font-bold text-white">{validation.toothFluxTesla}</span>
                <span className="text-xs text-slate-400 ml-1">Tesla</span>
              </div>
              <div className="text-right text-xs text-slate-400">
                Max Saturation: <strong className="text-white">{validation.maxToothFluxTesla}</strong> T
              </div>
            </div>

            <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800 mb-2">
              <div
                className={`h-full rounded-full transition-all duration-300 ${getMeterColor(
                  validation.toothMagneticStatus
                )}`}
                style={{
                  width: `${Math.min(100, validation.toothFluxUtilizationPct)}%`,
                }}
              />
            </div>

            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>
                Utilization: <strong>{validation.toothFluxUtilizationPct}%</strong>
              </span>
              <span>
                Margin:{' '}
                <strong
                  className={
                    validation.maxToothFluxTesla - validation.toothFluxTesla < 0
                      ? 'text-rose-400 font-bold'
                      : 'text-emerald-400'
                  }
                >
                  {(validation.maxToothFluxTesla - validation.toothFluxTesla).toFixed(3)} T
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Actionable Mitigation Advisories */}
        {validation.mitigationNotes.length > 0 && (
          <div className="bg-slate-950 border border-amber-800/60 rounded-xl p-3.5 space-y-2 text-xs">
            <span className="font-semibold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              Engineering Recommendations & Mitigation Steps:
            </span>
            <ul className="space-y-1 pl-5 list-disc text-slate-300 font-sans">
              {validation.mitigationNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* EXTENDED: Cross-Sectional Magnetic Flux Density Heat Map & Saturation Hot Spot Visualizer Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Magnet className="w-4 h-4 text-cyan-400" />
              Cross-Sectional Magnetic Flux Density Heat Map (FEA Saturation Hot Spot Visualizer)
            </h3>
            <p className="text-xs text-slate-400">
              Evaluates 2D magnetic flux density distribution across stator teeth, back-iron yoke, and air-gap to pinpoint iron core magnetic saturation, flux turning bottlenecks, and hot spots.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                magneticHeatmap.overallMagneticStatus === 'linear'
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                  : magneticHeatmap.overallMagneticStatus === 'moderate_saturation'
                  ? 'bg-amber-950/80 text-amber-400 border-amber-700/60'
                  : 'bg-rose-950/90 text-rose-300 border-rose-600'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              {magneticHeatmap.overallMagneticStatus === 'linear'
                ? 'Linear Permeance (Safe)'
                : magneticHeatmap.overallMagneticStatus === 'moderate_saturation'
                ? 'Approaching Knee Saturation'
                : 'Core Saturation Alert'}
            </span>

            <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-950 text-cyan-300 border border-slate-800">
              Peak Core B: {magneticHeatmap.maxFluxInMachineTesla} T ({magneticHeatmap.maxSaturationRatioPct}% of Knee)
            </span>
          </div>
        </div>

        {/* 5-Metric Engineering KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
          {/* Stator Tooth Body Flux */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Tooth Body (Bts)
            </span>
            <div className="text-lg font-bold text-white">
              {geom.toothFluxDensityTesla}{' '}
              <span className="text-xs font-normal text-slate-400">T</span>
            </div>
            <span className="text-[10px] text-emerald-400 block font-sans">
              Steel Knee: {magneticHeatmap.steelKneeTesla} T ({selectedSteel.name})
            </span>
          </div>

          {/* Tooth Root Bottleneck Hotspot */}
          <div
            className={`p-3 rounded-lg border space-y-1 ${
              magneticHeatmap.toothRootHotspotTesla >= magneticHeatmap.maxSteelRecommendedTesla
                ? 'bg-rose-950/20 border-rose-700/60'
                : magneticHeatmap.toothRootHotspotTesla >= magneticHeatmap.steelKneeTesla
                ? 'bg-amber-950/20 border-amber-700/60'
                : 'bg-slate-950 border-slate-800'
            }`}
          >
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Tooth Root Hotspot
            </span>
            <div
              className={`text-lg font-bold ${
                magneticHeatmap.toothRootHotspotTesla >= magneticHeatmap.maxSteelRecommendedTesla
                  ? 'text-rose-400'
                  : magneticHeatmap.toothRootHotspotTesla >= magneticHeatmap.steelKneeTesla
                  ? 'text-amber-400'
                  : 'text-cyan-300'
              }`}
            >
              {magneticHeatmap.toothRootHotspotTesla}{' '}
              <span className="text-xs font-normal text-slate-400">T</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              Fillet flux convergence hotspot
            </span>
          </div>

          {/* Stator Yoke Peak Flux */}
          <div
            className={`p-3 rounded-lg border space-y-1 ${
              magneticHeatmap.yokePeakFluxTesla >= magneticHeatmap.maxSteelRecommendedTesla
                ? 'bg-rose-950/20 border-rose-700/60'
                : magneticHeatmap.yokePeakFluxTesla >= magneticHeatmap.steelKneeTesla
                ? 'bg-amber-950/20 border-amber-700/60'
                : 'bg-slate-950 border-slate-800'
            }`}
          >
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Yoke Peak (Bys)
            </span>
            <div
              className={`text-lg font-bold ${
                magneticHeatmap.yokePeakFluxTesla >= magneticHeatmap.maxSteelRecommendedTesla
                  ? 'text-rose-400'
                  : magneticHeatmap.yokePeakFluxTesla >= magneticHeatmap.steelKneeTesla
                  ? 'text-amber-400'
                  : 'text-white'
              }`}
            >
              {magneticHeatmap.yokePeakFluxTesla}{' '}
              <span className="text-xs font-normal text-slate-400">T</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              Inter-polar return bottleneck
            </span>
          </div>

          {/* Tooth Tip Fringing */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Tooth Tip Shoe Lip
            </span>
            <div className="text-lg font-bold text-amber-400">
              {magneticHeatmap.toothTipHotspotTesla}{' '}
              <span className="text-xs font-normal text-slate-400">T</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              Near slot opening bs0 = {geom.slotOpeningWidthMm} mm
            </span>
          </div>

          {/* Saturated Volume Percentage */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Saturated Core Volume
            </span>
            <div
              className={`text-lg font-bold ${
                magneticHeatmap.saturatedVolumePct > 20
                  ? 'text-rose-400'
                  : magneticHeatmap.saturatedVolumePct > 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {magneticHeatmap.saturatedVolumePct}%
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              Iron volume operating &gt; B_knee
            </span>
          </div>
        </div>

        {/* Interactive Viewport Controls & Calibration Legend Bar */}
        <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white flex items-center gap-1.5 font-mono">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Cross-Section FEA Visualizer
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                ({specs.statorSlots} Stator Teeth | {specs.poles} Rotor Poles)
              </span>
            </div>

            {/* View Mode & Overlay Checkboxes */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                <button
                  onClick={() => setMagneticZoomSector('full')}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    magneticZoomSector === 'full'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  360° Full Stator
                </button>
                <button
                  onClick={() => setMagneticZoomSector('pole_sector')}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    magneticZoomSector === 'pole_sector'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  2-Pole Sector Zoom
                </button>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                <input
                  type="checkbox"
                  checked={showHotspotBeacons}
                  onChange={(e) => setShowHotspotBeacons(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-ping" />
                <span>Hotspot Warning Beacons</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                <input
                  type="checkbox"
                  checked={showIsoFluxLines}
                  onChange={(e) => setShowIsoFluxLines(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="w-2 h-2 rounded-sm bg-cyan-400/40 inline-block" />
                <span>Flux Equipotential Contours</span>
              </label>
            </div>
          </div>

          {/* FEA Color Calibration Scale */}
          <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="text-[10px] uppercase font-sans tracking-wider text-slate-400">
                Magnetic Flux Density Calibration (Tesla):
              </span>
              <span className="text-cyan-300">
                Steel Knee Point: <strong>{magneticHeatmap.steelKneeTesla} T</strong> ({selectedSteel.name})
              </span>
            </div>

            <div className="relative">
              {/* Color Ramp Gradient Bar */}
              <div
                className="w-full h-3.5 rounded-md border border-slate-700/80 overflow-hidden shadow-inner"
                style={{
                  background:
                    'linear-gradient(to right, #0f2942 0%, #0284c7 35%, #10b981 60%, #eab308 78%, #f97316 88%, #ef4444 94%, #d946ef 100%)',
                }}
              />

              {/* Knee needle marker */}
              {(() => {
                const kneePct = Math.min(98, Math.max(2, (magneticHeatmap.steelKneeTesla / 2.2) * 100));
                const toothPct = Math.min(98, Math.max(2, (geom.toothFluxDensityTesla / 2.2) * 100));
                const rootPct = Math.min(98, Math.max(2, (magneticHeatmap.toothRootHotspotTesla / 2.2) * 100));

                return (
                  <>
                    <div
                      className="absolute -top-1 w-0.5 h-5.5 bg-white shadow-md shadow-white/80 z-10 pointer-events-none"
                      style={{ left: `${kneePct}%` }}
                      title={`Knee: ${magneticHeatmap.steelKneeTesla} T`}
                    />
                    <div
                      className="absolute -top-1 w-0.5 h-5.5 bg-cyan-400 shadow-md shadow-cyan-400/80 z-10 pointer-events-none"
                      style={{ left: `${toothPct}%` }}
                      title={`Tooth Body: ${geom.toothFluxDensityTesla} T`}
                    />
                    <div
                      className="absolute -top-1 w-0.5 h-5.5 bg-rose-400 shadow-md shadow-rose-400/80 z-10 pointer-events-none"
                      style={{ left: `${rootPct}%` }}
                      title={`Tooth Root Peak: ${magneticHeatmap.toothRootHotspotTesla} T`}
                    />
                  </>
                );
              })()}
            </div>

            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>0.0 T (Air)</span>
              <span>0.8 T</span>
              <span>1.3 T (Linear)</span>
              <span className="text-yellow-400 font-bold">1.7 T (Knee)</span>
              <span className="text-rose-400 font-bold">1.9 T (Sat)</span>
              <span className="text-fuchsia-400 font-bold">2.2+ T (Hotspot)</span>
            </div>
          </div>
        </div>

        {/* 2-Column Main Section: SVG Cross-Section Heatmap (7 cols) + Saturation Diagnostic Inspector (5 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Interactive Cross-Sectional SVG Heatmap (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5 font-mono">
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                Cross-Section Magnetic B-Field FEA Mesh
              </span>
              <span className="text-[10px] font-mono text-cyan-400">
                {hoveredMagneticZone ?? 'Hover over teeth, yoke, slots, or airgap to probe localized B-field'}
              </span>
            </div>

            {/* SVG Visualizer Container */}
            <div className="relative flex justify-center items-center bg-slate-900/70 rounded-xl p-3 border border-slate-800/80 overflow-hidden">
              {(() => {
                const svgDim = 520;
                const cx = svgDim / 2;
                const cy = svgDim / 2;

                const isZoomed = magneticZoomSector === 'pole_sector';
                const baseScale = (220 / (geom.statorOuterDiameterMm / 2)) * (isZoomed ? 1.7 : 1.0);

                const rOuter = (geom.statorOuterDiameterMm / 2) * baseScale;
                const rYoke = (geom.statorOuterDiameterMm / 2 - geom.statorYokeDepthMm) * baseScale;
                const rBore = (geom.statorBoreDiameterMm / 2) * baseScale;
                const rRotor = (geom.rotorOuterDiameterMm / 2) * baseScale;
                const rShaft = (geom.shaftDiameterMm / 2) * baseScale;

                const Qs = specs.statorSlots;
                const slotPitchRad = (2 * Math.PI) / Qs;
                const bts_mm = geom.toothWidthMm;
                const toothHalfWidthRad = (bts_mm / geom.statorBoreDiameterMm);

                const bKnee = magneticHeatmap.steelKneeTesla;

                // Stator teeth profiles
                const teeth = magneticHeatmap.teethProfiles;
                const yokeSectors = magneticHeatmap.yokeSectors;

                return (
                  <svg
                    viewBox={`0 0 ${svgDim} ${svgDim}`}
                    className="w-full max-w-[500px] h-[380px] select-none"
                  >
                    <defs>
                      <radialGradient id="airgapBGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#0f2942" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
                      </radialGradient>

                      <radialGradient id="rotorSteelBGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#1e293b" />
                        <stop offset="85%" stopColor={getMagneticColor(geom.yokeFluxDensityTesla * 0.85, bKnee)} />
                      </radialGradient>

                      <filter id="hotspotGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#f43f5e" floodOpacity="0.8" />
                      </filter>
                    </defs>

                    {/* Stator Outer Frame Outline */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rOuter}
                      fill="none"
                      stroke="#475569"
                      strokeWidth="1.5"
                    />

                    {/* Stator Back-Iron Yoke Ring Segments (Circumferential Saturation Modulation) */}
                    <g>
                      {yokeSectors.map((sec, idx) => {
                        const stepRad = (2 * Math.PI) / yokeSectors.length;
                        const aStart = idx * stepRad - 0.01;
                        const aEnd = (idx + 1) * stepRad + 0.01;

                        const x1 = cx + rOuter * Math.cos(aStart);
                        const y1 = cy + rOuter * Math.sin(aStart);
                        const x2 = cx + rOuter * Math.cos(aEnd);
                        const y2 = cy + rOuter * Math.sin(aEnd);
                        const x3 = cx + rYoke * Math.cos(aEnd);
                        const y3 = cy + rYoke * Math.sin(aEnd);
                        const x4 = cx + rYoke * Math.cos(aStart);
                        const y4 = cy + rYoke * Math.sin(aStart);

                        const d = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rYoke} ${rYoke} 0 0 0 ${x4} ${y4} Z`;
                        const color = getMagneticColor(sec.fluxTesla, bKnee);

                        return (
                          <path
                            key={idx}
                            d={d}
                            fill={color}
                            stroke={color}
                            strokeWidth="0.5"
                            className="cursor-pointer transition-opacity hover:opacity-80"
                            onMouseEnter={() =>
                              setHoveredMagneticZone(
                                `Stator Yoke Sector #${sec.sectorIndex} (θ = ${sec.angleDeg}°): B = ${sec.fluxTesla} T (${(
                                  (sec.fluxTesla / bKnee) *
                                  100
                                ).toFixed(0)}% Knee)`
                              )
                            }
                            onMouseLeave={() => setHoveredMagneticZone(null)}
                          />
                        );
                      })}
                    </g>

                    {/* Stator Teeth Segments (Divided into Root Fillet, Main Body, Shoe Tip) */}
                    <g>
                      {teeth.map((tooth, idx) => {
                        const midAngle = idx * slotPitchRad;
                        const a1 = midAngle - toothHalfWidthRad;
                        const a2 = midAngle + toothHalfWidthRad;

                        // 1. Tooth Root Zone (near yoke boundary: rYoke down to rYoke - 0.3*slotDepth)
                        const rRootIn = rYoke - (rYoke - rBore) * 0.32;
                        const rx1 = cx + rYoke * Math.cos(a1 * 1.08);
                        const ry1 = cy + rYoke * Math.sin(a1 * 1.08);
                        const rx2 = cx + rYoke * Math.cos(a2 * 1.08);
                        const ry2 = cy + rYoke * Math.sin(a2 * 1.08);
                        const rx3 = cx + rRootIn * Math.cos(a2);
                        const ry3 = cy + rRootIn * Math.sin(a2);
                        const rx4 = cx + rRootIn * Math.cos(a1);
                        const ry4 = cy + rRootIn * Math.sin(a1);
                        const dRoot = `M ${rx1} ${ry1} L ${rx2} ${ry2} L ${rx3} ${ry3} L ${rx4} ${ry4} Z`;
                        const rootColor = getMagneticColor(tooth.rootFluxTesla, bKnee);

                        // 2. Tooth Body Zone (central main span)
                        const rTipOut = rBore + (rYoke - rBore) * 0.22;
                        const bx1 = rx4;
                        const by1 = ry4;
                        const bx2 = rx3;
                        const by2 = ry3;
                        const bx3 = cx + rTipOut * Math.cos(a2);
                        const by3 = cy + rTipOut * Math.sin(a2);
                        const bx4 = cx + rTipOut * Math.cos(a1);
                        const by4 = cy + rTipOut * Math.sin(a1);
                        const dBody = `M ${bx1} ${by1} L ${bx2} ${by2} L ${bx3} ${by3} L ${bx4} ${by4} Z`;
                        const bodyColor = getMagneticColor(tooth.bodyFluxTesla, bKnee);

                        // 3. Tooth Tip Shoe Zone (near airgap bore)
                        const tx1 = bx4;
                        const ty1 = by4;
                        const tx2 = bx3;
                        const ty2 = by3;
                        const tx3 = cx + rBore * Math.cos(a2 * 1.15);
                        const ty3 = cy + rBore * Math.sin(a2 * 1.15);
                        const tx4 = cx + rBore * Math.cos(a1 * 1.15);
                        const ty4 = cy + rBore * Math.sin(a1 * 1.15);
                        const dTip = `M ${tx1} ${ty1} L ${tx2} ${ty2} L ${tx3} ${ty3} L ${tx4} ${ty4} Z`;
                        const tipColor = getMagneticColor(tooth.tipFluxTesla, bKnee);

                        return (
                          <g
                            key={idx}
                            className="cursor-pointer"
                            onMouseEnter={() =>
                              setHoveredMagneticZone(
                                `Tooth #${tooth.toothIndex} (θ = ${tooth.angleDeg}°): Root = ${tooth.rootFluxTesla} T | Body = ${tooth.bodyFluxTesla} T | Tip = ${tooth.tipFluxTesla} T`
                              )
                            }
                            onMouseLeave={() => setHoveredMagneticZone(null)}
                          >
                            {/* Root Fillet */}
                            <path d={dRoot} fill={rootColor} stroke="#020617" strokeWidth="0.5" />
                            {/* Main Body */}
                            <path d={dBody} fill={bodyColor} stroke="#020617" strokeWidth="0.5" />
                            {/* Tip Shoe */}
                            <path d={dTip} fill={tipColor} stroke="#020617" strokeWidth="0.5" />
                          </g>
                        );
                      })}
                    </g>

                    {/* Stator Slots (Non-Magnetic Copper Conductors - Dark with coil phase outlines) */}
                    <g>
                      {Array.from({ length: Qs }).map((_, sIdx) => {
                        const midAngle = (sIdx + 0.5) * slotPitchRad;
                        const a1 = midAngle - (slotPitchRad / 2 - toothHalfWidthRad) * 0.95;
                        const a2 = midAngle + (slotPitchRad / 2 - toothHalfWidthRad) * 0.95;

                        const x1 = cx + (rYoke - 1) * Math.cos(a1);
                        const y1 = cy + (rYoke - 1) * Math.sin(a1);
                        const x2 = cx + (rYoke - 1) * Math.cos(a2);
                        const y2 = cy + (rYoke - 1) * Math.sin(a2);
                        const x3 = cx + (rBore + 2) * Math.cos(a2);
                        const y3 = cy + (rBore + 2) * Math.sin(a2);
                        const x4 = cx + (rBore + 2) * Math.cos(a1);
                        const y4 = cy + (rBore + 2) * Math.sin(a1);

                        const dSlot = `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} Z`;

                        return (
                          <path
                            key={sIdx}
                            d={dSlot}
                            fill="#090d16"
                            stroke="#1e293b"
                            strokeWidth="0.6"
                            opacity={0.95}
                            onMouseEnter={() =>
                              setHoveredMagneticZone(
                                `Stator Slot #${sIdx + 1} (Winding Conductor Area): Aslot = ${geom.slotAreaMm2} mm² | Fill = ${(geom.actualSlotFillFactor * 100).toFixed(0)}%`
                              )
                            }
                            onMouseLeave={() => setHoveredMagneticZone(null)}
                          />
                        );
                      })}
                    </g>

                    {/* Mechanical Airgap Ring */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={(rBore + rRotor) / 2}
                      fill="none"
                      stroke={getMagneticColor(geom.airgapFluxDensityTesla, bKnee)}
                      strokeWidth={Math.max(1.5, (rBore - rRotor))}
                      strokeOpacity="0.7"
                      onMouseEnter={() =>
                        setHoveredMagneticZone(
                          `Airgap Clearance: g = ${geom.airgapLengthMm} mm | Radial Flux Bg = ${geom.airgapFluxDensityTesla} T`
                        )
                      }
                      onMouseLeave={() => setHoveredMagneticZone(null)}
                      className="cursor-pointer"
                    />

                    {/* Rotor Core Lamination & Shaft */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rRotor}
                      fill="url(#rotorSteelBGrad)"
                      stroke="#475569"
                      strokeWidth="1"
                      onMouseEnter={() =>
                        setHoveredMagneticZone(
                          `Rotor Core: Dr = ${geom.rotorOuterDiameterMm} mm | Rotor Yoke Flux = ${(geom.yokeFluxDensityTesla * 0.9).toFixed(2)} T`
                        )
                      }
                      onMouseLeave={() => setHoveredMagneticZone(null)}
                      className="cursor-pointer"
                    />

                    {/* Rotor Shaft */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rShaft}
                      fill="#020617"
                      stroke="#334155"
                      strokeWidth="1"
                      onMouseEnter={() =>
                        setHoveredMagneticZone(`Motor Shaft: Dsh = ${geom.shaftDiameterMm} mm`)
                      }
                      onMouseLeave={() => setHoveredMagneticZone(null)}
                    />

                    {/* Iso-Flux Concentric & Radial Magnetic Streamlines */}
                    {showIsoFluxLines && (
                      <g className="pointer-events-none select-none">
                        {/* Yoke Equipotential Loop */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={rYoke + (rOuter - rYoke) * 0.5}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="0.8"
                          strokeDasharray="4 3"
                          strokeOpacity="0.4"
                        />
                        {/* Tooth Root Loop */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={rYoke}
                          fill="none"
                          stroke="#ffffff"
                          strokeWidth="0.8"
                          strokeDasharray="2 3"
                          strokeOpacity="0.3"
                        />
                      </g>
                    )}

                    {/* Prominent Saturation Hotspot Warning Beacons */}
                    {showHotspotBeacons &&
                      magneticHeatmap.hotspots.map((hs) => {
                        const aRad = (hs.angleDeg * Math.PI) / 180;
                        const rPos =
                          hs.zone === 'tooth_root'
                            ? rYoke
                            : hs.zone === 'tooth_tip'
                            ? rBore + 2
                            : rYoke + (rOuter - rYoke) * 0.5;

                        const px = cx + rPos * Math.cos(aRad);
                        const py = cy + rPos * Math.sin(aRad);
                        const isSevere = hs.status === 'saturated';

                        return (
                          <g
                            key={hs.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedHotspot(hs)}
                          >
                            {/* Pulsing beacon ring */}
                            <circle
                              cx={px}
                              cy={py}
                              r={isSevere ? 10 : 7}
                              fill="none"
                              stroke={isSevere ? '#f43f5e' : '#f59e0b'}
                              strokeWidth="2"
                              strokeDasharray="2 2"
                              className="animate-pulse"
                            />
                            {/* Inner dot */}
                            <circle
                              cx={px}
                              cy={py}
                              r={isSevere ? 4.5 : 3.5}
                              fill={isSevere ? '#f43f5e' : '#f59e0b'}
                              filter="url(#hotspotGlow)"
                            />
                            {/* Micro hotspot badge */}
                            <g
                              transform={`translate(${px + (Math.cos(aRad) >= 0 ? 8 : -85)}, ${
                                py + (Math.sin(aRad) >= 0 ? 8 : -14)
                              })`}
                            >
                              <rect
                                width="78"
                                height="16"
                                rx="3"
                                fill="#0f172a"
                                stroke={isSevere ? '#f43f5e' : '#f59e0b'}
                                strokeWidth="0.8"
                                opacity={0.92}
                              />
                              <text
                                x="4"
                                y="11"
                                fill={isSevere ? '#fecdd3' : '#fde68a'}
                                fontSize="8"
                                fontFamily="monospace"
                                fontWeight="bold"
                              >
                                {hs.localFluxTesla} T ({hs.saturationRatioPct}%)
                              </text>
                            </g>
                          </g>
                        );
                      })}
                  </svg>
                );
              })()}
            </div>
          </div>

          {/* Right Column: Saturation Hotspot Diagnostic Ranking & Actionable Remedies (5 cols) */}
          <div className="lg:col-span-5 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Identified Saturation Hotspots & Remedies
                </span>
                <span className="text-[10px] font-mono text-cyan-400">
                  {magneticHeatmap.hotspots.length} Zones Tracked
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                Localized iron saturation increases magnetizing current, elevates core losses, and distorts the air-gap field waveform.
              </p>

              {/* Hotspot Cards List */}
              <div className="space-y-2.5">
                {magneticHeatmap.hotspots.map((hs) => {
                  const isSelected = selectedHotspot?.id === hs.id;
                  return (
                    <div
                      key={hs.id}
                      onClick={() => setSelectedHotspot(isSelected ? null : hs)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-900 border-cyan-500 ring-1 ring-cyan-500/50 shadow-md'
                          : hs.status === 'saturated'
                          ? 'bg-rose-950/20 border-rose-800/60 hover:border-rose-700'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              hs.status === 'saturated'
                                ? 'bg-rose-500 animate-ping'
                                : hs.status === 'caution'
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                            }`}
                          />
                          {hs.locationName}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            hs.status === 'saturated'
                              ? 'bg-rose-950 text-rose-300 border border-rose-700'
                              : hs.status === 'caution'
                              ? 'bg-amber-950 text-amber-300 border border-amber-700'
                              : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {hs.localFluxTesla} T ({hs.saturationRatioPct}%)
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-300 leading-relaxed font-sans mt-1">
                        {hs.description}
                      </p>

                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-start gap-1.5 text-[10px] font-sans">
                        <span className="text-cyan-400 font-semibold shrink-0">Remedy:</span>
                        <span className="text-slate-400 leading-normal">{hs.remedy}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Electrical Steel Grade Sensitivity Tester */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>Evaluate Steel Grade Saturation Resilience:</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
                {STEEL_GRADE_OPTIONS.map((st) => (
                  <button
                    key={st.id}
                    onClick={() =>
                      onChangeMaterialConfig({
                        ...materialConfig,
                        steelGrade: st.id,
                      })
                    }
                    className={`p-1.5 rounded-lg border text-[10px] text-left transition-colors ${
                      materialConfig.steelGrade === st.id
                        ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-sm'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="truncate font-semibold">{st.name.split(' ')[0]}</div>
                    <div className={materialConfig.steelGrade === st.id ? 'text-slate-900' : 'text-slate-500'}>
                      Knee: {st.nominalKneeTesla} T
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EXTENDED: Material & Frequency Segregated Losses Breakdown Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400" />
              Loss Segregation by Material Grade & Operating Frequency ({specs.frequencyHz} Hz)
            </h3>
            <p className="text-xs text-slate-400">
              Copper losses separated into DC Joule and AC proximity/skin losses; core losses separated into hysteresis (linear with f) and eddy-current (quadratic with f²).
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono text-slate-400 block">Total Active Losses:</span>
            <span className="text-lg font-bold font-mono text-rose-400">{geom.totalLossW} W</span>
          </div>
        </div>

        {/* Stacked Proportional Visual Strip */}
        <div className="w-full bg-slate-950 h-5 rounded-lg overflow-hidden border border-slate-800 flex">
          {/* Stator Copper DC */}
          <div
            style={{ width: `${(geom.statorCopperLossDcW / geom.totalLossW) * 100}%` }}
            className="bg-rose-500 h-full transition-all"
            title={`Copper DC Loss: ${geom.statorCopperLossDcW} W`}
          />
          {/* Stator Copper AC */}
          <div
            style={{ width: `${(geom.statorCopperLossAcW / geom.totalLossW) * 100}%` }}
            className="bg-rose-700 h-full transition-all"
            title={`Copper AC Skin/Prox Loss: ${geom.statorCopperLossAcW} W`}
          />
          {/* Iron Hysteresis */}
          <div
            style={{ width: `${(geom.ironCoreHysteresisLossW / geom.totalLossW) * 100}%` }}
            className="bg-blue-400 h-full transition-all"
            title={`Iron Hysteresis Loss: ${geom.ironCoreHysteresisLossW} W`}
          />
          {/* Iron Eddy Current */}
          <div
            style={{ width: `${(geom.ironCoreEddyLossW / geom.totalLossW) * 100}%` }}
            className="bg-blue-600 h-full transition-all"
            title={`Iron Eddy Current Loss: ${geom.ironCoreEddyLossW} W`}
          />
          {/* Rotor Losses */}
          <div
            style={{ width: `${(geom.rotorLossW / geom.totalLossW) * 100}%` }}
            className="bg-amber-500 h-full transition-all"
            title={`Rotor Loss: ${geom.rotorLossW} W`}
          />
          {/* Mechanical + Stray */}
          <div
            style={{
              width: `${((geom.mechanicalLossW + geom.strayLoadLossW) / geom.totalLossW) * 100}%`,
            }}
            className="bg-emerald-500 h-full transition-all"
            title={`Mechanical & Stray: ${geom.mechanicalLossW + geom.strayLoadLossW} W`}
          />
        </div>

        {/* Detailed 4-Column Loss Segregation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
          {/* Copper Loss Box */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Stator Copper (Pcu_s)
            </span>
            <div className="text-base font-bold text-white">{geom.statorCopperLossW} W</div>
            <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-900">
              <div>DC Loss: <strong className="text-slate-300">{geom.statorCopperLossDcW} W</strong></div>
              <div>AC Loss: <strong className="text-slate-300">{geom.statorCopperLossAcW} W</strong></div>
              <div>AC Factor kac: <strong className="text-cyan-400">{geom.acResistanceFactorKac}</strong></div>
              <div>Temp: <strong className="text-slate-300">{geom.copperTemperatureC}°C</strong></div>
            </div>
          </div>

          {/* Iron Core Loss Box */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-blue-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Core Iron Loss (Pfe)
            </span>
            <div className="text-base font-bold text-white">{geom.ironCoreLossW} W</div>
            <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-900">
              <div>Hysteresis: <strong className="text-slate-300">{geom.ironCoreHysteresisLossW} W</strong></div>
              <div>Eddy Current: <strong className="text-slate-300">{geom.ironCoreEddyLossW} W</strong></div>
              <div>Teeth: <strong className="text-slate-300">{geom.teethIronLossW} W</strong></div>
              <div>Yoke: <strong className="text-slate-300">{geom.yokeIronLossW} W</strong></div>
            </div>
          </div>

          {/* Rotor Loss Box */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              Rotor Loss (Pcu_r / Pmag)
            </span>
            <div className="text-base font-bold text-white">{geom.rotorLossW} W</div>
            <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-900">
              <div>Share: <strong className="text-slate-300">{((geom.rotorLossW / geom.totalLossW) * 100).toFixed(1)}%</strong></div>
              <div>Type: <strong className="text-slate-300">{specs.topology.toUpperCase()}</strong></div>
              <div>Slip / PM Loss: <strong className="text-slate-300">{specs.topology === 'induction' ? `${specs.ratedSlipPercent}%` : 'PM Eddy'}</strong></div>
            </div>
          </div>

          {/* Mechanical & Stray Box */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Mech & Stray Losses
            </span>
            <div className="text-base font-bold text-white">{geom.mechanicalLossW + geom.strayLoadLossW} W</div>
            <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-900">
              <div>Friction/Wind: <strong className="text-slate-300">{geom.mechanicalLossW} W</strong></div>
              <div>Stray Load: <strong className="text-slate-300">{geom.strayLoadLossW} W</strong></div>
              <div>Active Speed: <strong className="text-slate-300">{geom.ratedSpeedRpm} rpm</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* EXTENDED: Simulated Winding Temperature & Resistance Scaling Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-rose-400" />
              Winding Temperature & Resistance Simulation (Thermal Resistance Scaling)
            </h3>
            <p className="text-xs text-slate-400">
              IEC 60034-1 & IEEE Std 112 copper thermal resistance model: R(T) = R₂₀ · [1 + α_cu(T - 20°C)]. Dynamically modulates winding I²R dissipation and recalculates machine active efficiency in real time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Thermal Safety Status Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                thermalSafetyStatus === 'safe'
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                  : thermalSafetyStatus === 'nominal'
                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60'
                  : thermalSafetyStatus === 'caution'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                  : 'bg-rose-950/90 text-rose-300 border-rose-600 animate-pulse'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              {thermalSafetyStatus === 'safe'
                ? 'Cold / Maximum Efficiency'
                : thermalSafetyStatus === 'nominal'
                ? 'Nominal Thermal Operation'
                : thermalSafetyStatus === 'caution'
                ? `Approaching Class ${materialConfig.insulation === 'class_b_130' ? 'B' : materialConfig.insulation === 'class_f_155' ? 'F' : 'H'} Limit`
                : `CRITICAL: Exceeds ${insulationLimitC}°C Limit!`}
            </span>

            {/* Reset to Nominal Button */}
            {isCustomTemp && (
              <button
                onClick={() =>
                  onChangeMaterialConfig({
                    ...materialConfig,
                    customWindingTemperatureC: undefined,
                  })
                }
                className="px-2.5 py-0.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded text-[11px] font-mono flex items-center gap-1 transition-colors"
                title="Reset temperature to selected insulation class standard operating point"
              >
                <RotateCcw className="w-3 h-3 text-cyan-400" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Temperature Controller: Slider + Presets */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5 font-sans">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Simulated Operating Winding Temperature:
              </span>
              <span className="text-lg font-bold font-mono text-cyan-300">
                {currentTemp}°C
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ({Math.round((currentTemp * 9) / 5 + 32)}°F)
              </span>
              {isCustomTemp ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-800 font-mono">
                  Custom Simulation
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                  Insulation Class Default
                </span>
              )}
            </div>

            {/* Temperature Stepper Buttons */}
            <div className="flex items-center gap-1">
              {[-5, -1, 1, 5].map((delta) => (
                <button
                  key={delta}
                  onClick={() =>
                    onChangeMaterialConfig({
                      ...materialConfig,
                      customWindingTemperatureC: Math.max(20, Math.min(220, currentTemp + delta)),
                    })
                  }
                  className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded text-[11px] font-mono transition-colors"
                >
                  {delta > 0 ? `+${delta}°C` : `${delta}°C`}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Range Slider */}
          <div className="space-y-1">
            <input
              type="range"
              min="20"
              max="200"
              step="1"
              value={currentTemp}
              onChange={(e) =>
                onChangeMaterialConfig({
                  ...materialConfig,
                  customWindingTemperatureC: Number(e.target.value),
                })
              }
              className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>20°C (Cold Lab)</span>
              <span>75°C (IEEE Test)</span>
              <span>115°C (Class F Rated)</span>
              <span>155°C (Class F Hotspot)</span>
              <span>200°C (Overload)</span>
            </div>
          </div>

          {/* Thermal Preset Quick Buttons */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-400 font-sans mr-1">Thermal Presets:</span>
            {[
              { label: '20°C Cold Lab', temp: 20 },
              { label: '75°C Standard Test', temp: 75 },
              { label: '95°C Class B Rated', temp: 95 },
              { label: '115°C Class F Rated', temp: 115 },
              { label: '140°C Class H Rated', temp: 140 },
              { label: '155°C Class F Hotspot', temp: 155 },
              { label: '180°C Class H Hotspot', temp: 180 },
            ].map((preset) => {
              const isActive = currentTemp === preset.temp;
              return (
                <button
                  key={preset.label}
                  onClick={() =>
                    onChangeMaterialConfig({
                      ...materialConfig,
                      customWindingTemperatureC: preset.temp,
                    })
                  }
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                    isActive
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 5-Column Live Metric Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono">
          {/* Phase Resistance R(T) */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Operating Rs(T)
              </span>
              <span
                className={`text-[9.5px] px-1 rounded font-bold ${
                  rIncreasePct > 50
                    ? 'text-rose-400 bg-rose-950/60'
                    : rIncreasePct > 30
                    ? 'text-amber-400 bg-amber-950/60'
                    : 'text-emerald-400 bg-emerald-950/60'
                }`}
              >
                +{rIncreasePct}%
              </span>
            </div>
            <div className="text-lg font-bold text-cyan-400">
              {rOper.toFixed(4)} <span className="text-xs text-slate-400 font-normal">Ω</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              R₂₀ = {r20.toFixed(4)} Ω | R₇₅ = {r75.toFixed(4)} Ω
            </span>
          </div>

          {/* Effective AC Resistance */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Effective Rac(f, T)
            </span>
            <div className="text-lg font-bold text-white">
              {(rOper * geom.acResistanceFactorKac).toFixed(4)}{' '}
              <span className="text-xs text-slate-400 font-normal">Ω</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              Skin kac = {geom.acResistanceFactorKac} at {specs.frequencyHz} Hz
            </span>
          </div>

          {/* Copper Loss Pcu(T) */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Copper Loss Pcu(T)
              </span>
              <span
                className={`text-[9.5px] px-1 rounded font-bold ${
                  copperLossDeltaW > 0 ? 'text-rose-400 bg-rose-950/60' : 'text-emerald-400 bg-emerald-950/60'
                }`}
              >
                {copperLossDeltaW >= 0 ? `+${copperLossDeltaW}` : copperLossDeltaW} W
              </span>
            </div>
            <div className="text-lg font-bold text-rose-400">
              {geom.statorCopperLossW} <span className="text-xs text-slate-400 font-normal">W</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              DC: {geom.statorCopperLossDcW} W | AC: {geom.statorCopperLossAcW} W
            </span>
          </div>

          {/* Machine Active Efficiency */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                Efficiency η(T)
              </span>
              <span
                className={`text-[9.5px] px-1 rounded font-bold ${
                  effDeltaPct < 0 ? 'text-amber-400 bg-amber-950/60' : 'text-emerald-400 bg-emerald-950/60'
                }`}
              >
                {effDeltaPct >= 0 ? `+${effDeltaPct}%` : `${effDeltaPct}%`}
              </span>
            </div>
            <div
              className={`text-lg font-bold ${
                geom.calculatedEfficiency >= 92
                  ? 'text-emerald-400'
                  : geom.calculatedEfficiency >= 88
                  ? 'text-cyan-300'
                  : 'text-amber-400'
              }`}
            >
              {geom.calculatedEfficiency}%
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              Cold η₂₀ = {eff20}% (Δ = {effDeltaPct}%)
            </span>
          </div>

          {/* Copper Resistivity rho(T) */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Resistivity ρ(T)
            </span>
            <div className="text-lg font-bold text-amber-300">
              {geom.copperResistivityOhm_mm2_m}{' '}
              <span className="text-xs text-slate-400 font-normal">Ω·mm²/m</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              α = 0.00393/°C | ρ₂₀ = 0.01724
            </span>
          </div>
        </div>

        {/* 2-Column: Temperature Sensitivity Curve + Mathematical Formulation */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Interactive Sensitivity SVG Curve (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Resistance R(T) & Efficiency η(T) Sensitivity Across 20°C - 200°C
                </span>
                <span className="text-[11px] text-slate-400">
                  Cyan curve: Winding resistance scaling. Green curve: Machine active efficiency decay.
                </span>
              </div>
            </div>

            {/* SVG Sensitivity Curve */}
            <div className="overflow-x-auto">
              {(() => {
                const svgW = 540;
                const svgH = 170;
                const padL = 45;
                const padR = 45;
                const padT = 20;
                const padB = 30;
                const innerW = svgW - padL - padR;
                const innerH = svgH - padT - padB;

                const rMin = Math.min(...tempSensitivityCurve.map((p) => p.r_t)) * 0.95;
                const rMax = Math.max(...tempSensitivityCurve.map((p) => p.r_t)) * 1.05;

                const effMin = Math.min(...tempSensitivityCurve.map((p) => p.eff_t)) - 0.5;
                const effMax = Math.max(...tempSensitivityCurve.map((p) => p.eff_t)) + 0.5;

                const getX = (t: number) => padL + ((t - 20) / (200 - 20)) * innerW;
                const getYR = (r: number) => padT + innerH - ((r - rMin) / Math.max(1e-5, rMax - rMin)) * innerH;
                const getYEff = (eff: number) =>
                  padT + innerH - ((eff - effMin) / Math.max(1e-5, effMax - effMin)) * innerH;

                const rPathD = tempSensitivityCurve
                  .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(p.t).toFixed(1)} ${getYR(p.r_t).toFixed(1)}`)
                  .join(' ');

                const effPathD = tempSensitivityCurve
                  .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(p.t).toFixed(1)} ${getYEff(p.eff_t).toFixed(1)}`)
                  .join(' ');

                const curX = getX(currentTemp);
                const curYR = getYR(rOper);
                const curYEff = getYEff(geom.calculatedEfficiency);
                const limitX = getX(insulationLimitC);

                return (
                  <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-44 select-none min-w-[500px]">
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                      const y = padT + frac * innerH;
                      return (
                        <line
                          key={frac}
                          x1={padL}
                          y1={y}
                          x2={svgW - padR}
                          y2={y}
                          stroke="#1e293b"
                          strokeDasharray="3 3"
                        />
                      );
                    })}

                    {/* Insulation Limit Vertical Line */}
                    {limitX <= svgW - padR && (
                      <g>
                        <line
                          x1={limitX}
                          y1={padT}
                          x2={limitX}
                          y2={svgH - padB}
                          stroke="#f43f5e"
                          strokeWidth="1.5"
                          strokeDasharray="4 2"
                        />
                        <text
                          x={limitX + 3}
                          y={padT + 10}
                          fill="#f43f5e"
                          fontSize="8.5"
                          fontFamily="monospace"
                        >
                          Limit: {insulationLimitC}°C
                        </text>
                      </g>
                    )}

                    {/* Active Temperature Vertical Cursor */}
                    <line
                      x1={curX}
                      y1={padT}
                      x2={curX}
                      y2={svgH - padB}
                      stroke="#06b6d4"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    />

                    {/* Curves */}
                    <path
                      d={rPathD}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <path
                      d={effPathD}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />

                    {/* Current operating dots */}
                    <circle cx={curX} cy={curYR} r="5" fill="#38bdf8" stroke="#020617" strokeWidth="2" />
                    <circle cx={curX} cy={curYEff} r="5" fill="#10b981" stroke="#020617" strokeWidth="2" />

                    {/* Dot value labels */}
                    <text
                      x={curX + 7}
                      y={curYR - 4}
                      fill="#38bdf8"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {rOper.toFixed(4)} Ω
                    </text>
                    <text
                      x={curX + 7}
                      y={curYEff + 12}
                      fill="#10b981"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      {geom.calculatedEfficiency}%
                    </text>

                    {/* X-axis tick labels */}
                    {[20, 60, 100, 140, 180, 200].map((t) => (
                      <text
                        key={t}
                        x={getX(t)}
                        y={svgH - padB + 16}
                        fill="#64748b"
                        fontSize="9"
                        fontFamily="monospace"
                        textAnchor="middle"
                      >
                        {t}°C
                      </text>
                    ))}

                    {/* Axis Labels */}
                    <text x={padL - 6} y={padT - 6} fill="#38bdf8" fontSize="9" fontFamily="monospace" textAnchor="end">
                      Rs (Ω)
                    </text>
                    <text x={svgW - padR + 6} y={padT - 6} fill="#10b981" fontSize="9" fontFamily="monospace" textAnchor="start">
                      η (%)
                    </text>
                  </svg>
                );
              })()}
            </div>

            <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80">
              <span className="flex items-center gap-1.5 text-sky-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
                Stator Winding Resistance Rs(T)
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                Motor Active Efficiency η(T)
              </span>
              <span className="flex items-center gap-1.5 text-rose-400">
                <span className="w-2.5 h-0.5 bg-rose-500 inline-block" />
                Insulation Limit ({insulationLimitC}°C)
              </span>
            </div>
          </div>

          {/* Right Column: Mathematical Formulation & Thermal Physics (5 cols) */}
          <div className="lg:col-span-5 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-semibold text-white">
                  Governing Thermal Resistance Physics
                </h4>
              </div>

              {/* Formula Cards */}
              <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 space-y-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-sans">
                  Linear Temperature Resistance Law (IEC 60034-1):
                </div>
                <div className="text-cyan-300 font-bold">
                  R(T) = R₂₀ · [1 + α_cu · (T - 20°C)]
                </div>
                <div className="text-slate-400 text-[11px]">
                  Where α_cu = 0.00393 / °C (1/α = 234.5°C inferred zero resistance for standard annealed copper).
                </div>
              </div>

              <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-200 space-y-2">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-sans">
                  Efficiency Impact Synthesis:
                </div>
                <div className="text-emerald-400 font-bold">
                  η(T) = P_out / [P_out + 3·I²·Rac(T) + Pfe + Pmw + Pstray]
                </div>
                <div className="text-slate-400 text-[11px]">
                  As winding temperature heats from 20°C to {currentTemp}°C, phase resistance increased by{' '}
                  <strong className="text-white">{rIncreasePct}%</strong>, expanding copper losses by{' '}
                  <strong className="text-rose-400">{copperLossDeltaW >= 0 ? `+${copperLossDeltaW}` : copperLossDeltaW} W</strong>{' '}
                  and adjusting efficiency by <strong className="text-amber-400">{effDeltaPct}%</strong>.
                </div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 font-sans leading-relaxed p-2 rounded bg-slate-900/40 border border-slate-900">
              Operating above rated insulation limits accelerates winding varnish degradation (Arrhenius rule: insulation lifespan halves for every 10°C thermal rise).
            </div>
          </div>
        </div>
      </div>

      {/* Main Torque-Speed Interactive Curve */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Dynamic Torque-Speed Operating Characteristic T(n)
            </h3>
            <p className="text-xs text-slate-400">
              Interactive envelope displaying rated operating point, breakdown pull-out torque, and field weakening.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="text-slate-300">
              Rated: <strong className="text-cyan-400">{geom.ratedSpeedRpm} rpm</strong> @{' '}
              <strong className="text-cyan-400">{geom.ratedTorqueNm} N·m</strong>
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-300">
              Breakdown Tmax: <strong className="text-amber-400">{geom.breakdownTorqueNm} N·m</strong>
            </span>
          </div>
        </div>

        {/* SVG Plot Canvas */}
        <div className="bg-slate-950 rounded-lg p-2 border border-slate-800/80">
          <svg viewBox={`0 0 ${plotW} ${plotH}`} className="w-full h-64 select-none">
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
              const y = plotH - padBottom - frac * (plotH - padTop - padBottom);
              const val = (frac * maxTorque).toFixed(0);
              return (
                <g key={frac}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={plotW - padRight}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* X-axis speed ticks */}
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
              const x = padLeft + frac * (plotW - padLeft - padRight);
              const val = (frac * maxSpeed).toFixed(0);
              return (
                <g key={frac}>
                  <line
                    x1={x}
                    y1={padTop}
                    x2={x}
                    y2={plotH - padBottom}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={x}
                    y={plotH - padBottom + 16}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Axis Titles */}
            <text
              x={plotW / 2}
              y={plotH - 6}
              fill="#94a3b8"
              fontSize="10"
              fontFamily="sans-serif"
              textAnchor="middle"
            >
              Rotor Speed n [rpm]
            </text>
            <text
              x={12}
              y={plotH / 2}
              fill="#94a3b8"
              fontSize="10"
              fontFamily="sans-serif"
              transform={`rotate(-90, 12, ${plotH / 2})`}
              textAnchor="middle"
            >
              Torque [N·m]
            </text>

            {/* Torque Curve Line */}
            <path
              d={curvePoints.reduce((p, pt, i) => {
                const x = getX(pt.speedRpm);
                const y = getY(pt.torqueNm);
                return i === 0 ? `M ${x} ${y}` : `${p} L ${x} ${y}`;
              }, '')}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2.5"
            />

            {/* Rated Operating Point Marker */}
            <circle
              cx={getX(geom.ratedSpeedRpm)}
              cy={getY(geom.ratedTorqueNm)}
              r="5"
              fill="#22c55e"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
            <text
              x={getX(geom.ratedSpeedRpm) + 8}
              y={getY(geom.ratedTorqueNm) - 8}
              fill="#22c55e"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              Rated Point ({geom.ratedSpeedRpm} rpm, {geom.ratedTorqueNm} Nm)
            </text>

            {/* Breakdown Torque Line */}
            <line
              x1={padLeft}
              y1={getY(geom.breakdownTorqueNm)}
              x2={plotW - padRight}
              y2={getY(geom.breakdownTorqueNm)}
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="4 2"
            />
            <text
              x={plotW - padRight - 4}
              y={getY(geom.breakdownTorqueNm) - 4}
              fill="#f59e0b"
              fontSize="8.5"
              fontFamily="monospace"
              textAnchor="end"
            >
              Tmax = {geom.breakdownTorqueNm} Nm
            </text>
          </svg>
        </div>
      </div>

      {/* EXTENDED: Back-EMF Harmonics, Stator Slot Ripple & High-Frequency EMI Mitigation Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              Back-EMF Harmonics & Stator Slot Ripple (High-Frequency EMI Analysis)
            </h3>
            <p className="text-xs text-slate-400">
              Evaluates spatial back-EMF harmonics (ν = 1…19), stator slot ripple frequency (f_slot), Carter airgap permeance pulsations, and rule-based engineering adjustments to suppress inverter EMI.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Back-EMF Quality:</span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                harmonicAnalysis.backEmfThdPct <= 2.5
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                  : harmonicAnalysis.backEmfThdPct <= 4.0
                  ? 'bg-amber-950/80 text-amber-400 border-amber-700/60'
                  : 'bg-rose-950/90 text-rose-300 border-rose-600'
              }`}
            >
              THD = {harmonicAnalysis.backEmfThdPct}%
            </span>
          </div>
        </div>

        {/* 5-Metric Engineering Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
          {/* Slot Passing Frequency */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Slot Frequency (f_slot)
            </span>
            <div className="text-lg font-bold text-white">
              {harmonicAnalysis.slotFrequencyHz.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-400">Hz</span>
            </div>
            <span className="text-[10px] text-cyan-400 block">
              Qs · nr / 60 ({specs.statorSlots} slots @ {geom.ratedSpeedRpm} rpm)
            </span>
          </div>

          {/* Slot Harmonic Orders */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Slot Harmonics (ν_slot)
            </span>
            <div className="text-lg font-bold text-amber-400">
              #{harmonicAnalysis.slotHarmonicOrderLower} & #{harmonicAnalysis.slotHarmonicOrderUpper}
            </div>
            <span className="text-[10px] text-slate-400 block">
              Sidebands: (Qs/p) ± 1
            </span>
          </div>

          {/* Permeance Ripple Index */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Carter Ripple Index
            </span>
            <div className="text-lg font-bold text-white">
              {harmonicAnalysis.permeanceRippleIndexPct}%
            </div>
            <span className="text-[10px] text-slate-400 block">
              bs0/g = {(geom.slotOpeningWidthMm / Math.max(0.2, geom.airgapLengthMm)).toFixed(1)} (Airgap dip)
            </span>
          </div>

          {/* Skew Factor Fundamental */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Skew Factor k_skew1
            </span>
            <div className="text-lg font-bold text-cyan-300">
              {harmonicAnalysis.skewFactorFundamental}
            </div>
            <span className="text-[10px] text-slate-400 block">
              {harmonicAnalysis.skewAngleSlots > 0.05
                ? `${harmonicAnalysis.skewAngleSlots.toFixed(2)} slot pitch applied`
                : 'Straight slots (Unskewed)'}
            </span>
          </div>

          {/* Slot Ripple Attenuation */}
          <div
            className={`p-3 rounded-lg border space-y-1 ${
              harmonicAnalysis.slotRippleAttenuationDb < -15
                ? 'bg-emerald-950/30 border-emerald-700/60'
                : harmonicAnalysis.slotRippleAttenuationDb < -5
                ? 'bg-amber-950/20 border-amber-700/60'
                : 'bg-slate-950 border-slate-800'
            }`}
          >
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Slot Attenuation
            </span>
            <div
              className={`text-lg font-bold ${
                harmonicAnalysis.slotRippleAttenuationDb < -15
                  ? 'text-emerald-400'
                  : harmonicAnalysis.slotRippleAttenuationDb < -5
                  ? 'text-amber-400'
                  : 'text-slate-300'
              }`}
            >
              {harmonicAnalysis.slotRippleAttenuationDb.toFixed(1)}{' '}
              <span className="text-xs font-normal text-slate-400">dB</span>
            </div>
            <span className="text-[10px] text-slate-400 block">
              k_skew(ν_slot) = {harmonicAnalysis.skewFactorSlotHarmonic}
            </span>
          </div>
        </div>

        {/* Interactive Stator Stack Skewing Slider */}
        <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-semibold text-white">
                Interactive Stator Stack Helical Skewing Control:
              </span>
              <span className="text-xs font-mono font-bold text-cyan-300">
                {skewAngleSlots.toFixed(2)} Slot Pitches
              </span>
            </div>

            {/* Quick preset buttons */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[11px] text-slate-400 font-mono mr-1">Presets:</span>
              <button
                onClick={() => setSkewAngleSlots(0)}
                className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                  skewAngleSlots === 0
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                0.0 (Unskewed)
              </button>
              <button
                onClick={() => setSkewAngleSlots(0.5)}
                className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                  skewAngleSlots === 0.5
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                0.5 (Half Pitch)
              </button>
              <button
                onClick={() => setSkewAngleSlots(1.0)}
                className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                  skewAngleSlots === 1.0
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                1.00 (Optimal Null)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={skewAngleSlots}
              onChange={(e) => setSkewAngleSlots(parseFloat(e.target.value))}
              className="flex-1 accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono text-slate-400 w-16 text-right">
              {skewAngleSlots.toFixed(2)} slots
            </span>
          </div>

          <p className="text-[11px] text-slate-400 font-sans">
            Continuous helical skewing by exactly 1.00 slot pitch aligns the skew angle with the slot period, making <code className="text-cyan-300 font-mono">k_skew(ν_slot) = 0</code>. This effectively eliminates stator slot ripple and acoustic whine with less than 1.5% loss on fundamental voltage.
          </p>
        </div>

        {/* Back-EMF Harmonic Spectrum SVG Bar Chart */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                Phase Back-EMF Harmonic Spectrum E_ν (Relative to Fundamental)
              </span>
              <span className="text-[11px] text-slate-400">
                Click any harmonic bar to inspect detailed phase voltage and frequency. Triplen harmonics (gray) cancel line-to-line.
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1 text-cyan-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 inline-block" />
                Fundamental
              </span>
              <span className="flex items-center gap-1 text-sky-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 inline-block" />
                Spatial Harmonics
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                Slot Ripple (f_slot)
              </span>
              <span className="flex items-center gap-1 text-slate-400">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-600 inline-block" />
                Triplen (Cancelled)
              </span>
            </div>
          </div>

          {/* SVG Spectrum Chart */}
          <div className="overflow-x-auto">
            <svg viewBox="0 0 620 220" className="w-full h-56 select-none min-w-[560px]">
              {/* Y-axis grid lines (0 to 12%) */}
              {[0, 3, 6, 9, 12].map((pct) => {
                const y = 25 + 155 - (pct / 12) * 155;
                return (
                  <g key={pct}>
                    <line
                      x1={42}
                      y1={y}
                      x2={602}
                      y2={y}
                      stroke="#1e293b"
                      strokeDasharray="2 2"
                    />
                    <text
                      x={36}
                      y={y + 3}
                      fill="#64748b"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {pct}%
                    </text>
                  </g>
                );
              })}

              {/* Baseline axis */}
              <line x1={42} y1={180} x2={602} y2={180} stroke="#334155" strokeWidth="1" />

              {/* Bars */}
              {harmonicAnalysis.harmonics.map((h, i) => {
                const totalBars = harmonicAnalysis.harmonics.length;
                const plotW = 560;
                const slotW = plotW / totalBars;
                const barW = Math.min(26, Math.max(16, slotW * 0.68));
                const barX = 42 + i * slotW + (slotW - barW) / 2;

                // Scale: fundamental is capped with break indicator
                let barH = 0;
                let topLabel = '';
                if (h.order === 1) {
                  barH = 155;
                  topLabel = '100%';
                } else {
                  barH = Math.max(4, Math.min(155, (h.relativeAmplitudePct / 12) * 155));
                  topLabel = `${h.relativeAmplitudePct}%`;
                }
                const barY = 180 - barH;

                let barColor = '#38bdf8';
                if (h.order === 1) barColor = '#06b6d4';
                else if (h.isSlotHarmonic) barColor = '#f43f5e';
                else if (h.isTriplen) barColor = '#64748b';

                const isSelected = selectedHarmonic?.order === h.order;

                return (
                  <g
                    key={h.order}
                    className="cursor-pointer group"
                    onClick={() => setSelectedHarmonic(h)}
                  >
                    {/* Hover highlight background */}
                    <rect
                      x={42 + i * slotW}
                      y={20}
                      width={slotW}
                      height={165}
                      fill={isSelected ? '#38bdf815' : 'transparent'}
                      className="group-hover:fill-slate-800/40 transition-colors"
                    />

                    {/* Harmonic Bar */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barW}
                      height={barH}
                      fill={barColor}
                      rx="2"
                      stroke={h.isSlotHarmonic ? '#fda4af' : isSelected ? '#ffffff' : 'none'}
                      strokeWidth={h.isSlotHarmonic || isSelected ? 1.5 : 0}
                      strokeDasharray={h.isTriplen ? '2 2' : 'none'}
                      opacity={h.isTriplen ? 0.6 : 1}
                    />

                    {/* Top amplitude percentage */}
                    <text
                      x={barX + barW / 2}
                      y={barY - 4}
                      fill={h.isSlotHarmonic ? '#f43f5e' : '#cbd5e1'}
                      fontSize={h.order === 1 ? '8.5' : '8'}
                      fontFamily="monospace"
                      fontWeight={h.isSlotHarmonic || h.order === 1 ? 'bold' : 'normal'}
                      textAnchor="middle"
                    >
                      {topLabel}
                    </text>

                    {/* Bottom Order tick label */}
                    <text
                      x={barX + barW / 2}
                      y={194}
                      fill={h.isSlotHarmonic ? '#fb7185' : '#94a3b8'}
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight={h.isSlotHarmonic ? 'bold' : 'normal'}
                      textAnchor="middle"
                    >
                      ν={h.order}
                    </text>

                    {/* Frequency tick label */}
                    <text
                      x={barX + barW / 2}
                      y={206}
                      fill="#64748b"
                      fontSize="7.5"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {h.frequencyHz}Hz
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected Harmonic Detail Card */}
          {selectedHarmonic && (
            <div className="bg-slate-900 border border-cyan-800/60 rounded-lg p-3 text-xs font-mono flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-bold text-cyan-300">
                  Harmonic ν = {selectedHarmonic.order} ({selectedHarmonic.frequencyHz} Hz)
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-200">
                  Relative: <strong>{selectedHarmonic.relativeAmplitudePct}%</strong> of fundamental
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-200">
                  Phase Voltage: <strong>{selectedHarmonic.phaseVoltageV} V_rms</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedHarmonic.isSlotHarmonic && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-700">
                    Primary Slot Ripple Sideband
                  </span>
                )}
                {selectedHarmonic.isTriplen && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    Triplen Harmonic (Cancelled Line-to-Line)
                  </span>
                )}
                <button
                  onClick={() => setSelectedHarmonic(null)}
                  className="text-[11px] text-slate-400 hover:text-white ml-2"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Deterministic Engineering Design Adjustments (Rule-Based, Non-AI) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-cyan-400" />
                Deterministic Engineering Design Adjustments to Reduce High-Frequency EMI
              </h4>
              <p className="text-[11px] text-slate-400">
                Formulated from classical electrical machine textbooks (Pyrhönen, Sawhney, Alger, Carter). Apply concrete adjustments directly to the geometry:
              </p>
            </div>
            <span className="text-[11px] font-mono text-cyan-400">
              {harmonicAnalysis.suggestedAdjustments.length} Recommendations Available
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {harmonicAnalysis.suggestedAdjustments.map((adj) => {
              const isApplied = appliedAdjustmentIds.includes(adj.id);
              return (
                <div
                  key={adj.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                    isApplied
                      ? 'bg-emerald-950/20 border-emerald-600/40'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                        {adj.title}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-900 text-cyan-300 border border-slate-800">
                        EMI: {adj.emiAttenuationDb} dB
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {adj.description}
                    </p>

                    <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Current Design:</span>
                        <span className="text-slate-300">{adj.currentValue}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Recommended Target:</span>
                        <strong className="text-emerald-400">{adj.recommendedValue}</strong>
                      </div>
                      <div className="text-[10px] text-cyan-400 pt-1 border-t border-slate-800/80">
                        Benefit: {adj.expectedBenefit}
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-500 font-sans italic">
                      Ref: {adj.scientificReference}
                    </div>
                  </div>

                  <div className="pt-3 mt-2 border-t border-slate-900 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-emerald-400">
                      THD Gain: -{adj.thdReductionPct}%
                    </span>

                    <button
                      onClick={() => handleApplyAdjustment(adj)}
                      disabled={isApplied}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        isApplied
                          ? 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/60 cursor-default'
                          : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-sm shadow-cyan-500/20'
                      }`}
                    >
                      {isApplied ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Applied
                        </>
                      ) : (
                        <>
                          Apply Adjustment <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* EXTENDED: Simulated Torque Ripple & Cogging Waveform Visualization Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              Simulated Instantaneous Torque Ripple & Cogging Waveform (Air-Gap Flux Harmonics & Reluctance Interaction)
            </h3>
            <p className="text-xs text-slate-400">
              Simulates the continuous instantaneous torque waveform T(θ) across one full electrical cycle (0° to 360° elec), decomposing stator slot reluctance cogging torque and space harmonic electromagnetic pulsations (6th, 12th, and slot permeance harmonics).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                torqueRippleAnalysis.qualityRating === 'excellent'
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                  : torqueRippleAnalysis.qualityRating === 'good'
                  ? 'bg-cyan-950/80 text-cyan-400 border-cyan-700/60'
                  : torqueRippleAnalysis.qualityRating === 'moderate'
                  ? 'bg-amber-950/80 text-amber-400 border-amber-700/60'
                  : 'bg-rose-950/90 text-rose-300 border-rose-600'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              {torqueRippleAnalysis.qualityLabel}
            </span>

            <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-950 text-cyan-300 border border-slate-800">
              K_ripple: {torqueRippleAnalysis.ripplePercentagePct}% (ΔT = {torqueRippleAnalysis.peakToPeakRippleNm} N·m)
            </span>
          </div>
        </div>

        {/* 5-Metric Engineering KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 font-mono text-xs">
          {/* Rated Mean Torque */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Rated Mean Torque (Tn)
            </span>
            <div className="text-lg font-bold text-white">
              {torqueRippleAnalysis.avgTorqueNm}{' '}
              <span className="text-xs font-normal text-slate-400">N·m</span>
            </div>
            <span className="text-[10px] text-emerald-400 block font-sans">
              9550·P/nr ({specs.powerKw} kW @ {geom.ratedSpeedRpm} rpm)
            </span>
          </div>

          {/* Peak-to-Peak Torque Ripple */}
          <div
            className={`p-3 rounded-lg border space-y-1 ${
              torqueRippleAnalysis.ripplePercentagePct <= 5
                ? 'bg-slate-950 border-slate-800'
                : torqueRippleAnalysis.ripplePercentagePct <= 10
                ? 'bg-amber-950/20 border-amber-700/60'
                : 'bg-rose-950/20 border-rose-700/60'
            }`}
          >
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Peak-to-Peak Ripple (ΔT)
            </span>
            <div
              className={`text-lg font-bold ${
                torqueRippleAnalysis.ripplePercentagePct <= 5
                  ? 'text-cyan-400'
                  : torqueRippleAnalysis.ripplePercentagePct <= 10
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {torqueRippleAnalysis.peakToPeakRippleNm}{' '}
              <span className="text-xs font-normal text-slate-400">N·m</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              Range: [{torqueRippleAnalysis.minTorqueNm} … {torqueRippleAnalysis.maxTorqueNm}] N·m
            </span>
          </div>

          {/* Peak Cogging Torque */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Peak Cogging (Tcog,pk)
            </span>
            <div className="text-lg font-bold text-amber-400">
              {torqueRippleAnalysis.coggingTorquePeakNm}{' '}
              <span className="text-xs font-normal text-slate-400">N·m</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              {torqueRippleAnalysis.coggingRatioPct}% of rated mean torque
            </span>
          </div>

          {/* Fundamental Cogging Periodicity */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Cogging Order (Ncog)
            </span>
            <div className="text-lg font-bold text-sky-400">
              {torqueRippleAnalysis.coggingOrderLcm}{' '}
              <span className="text-xs font-normal text-slate-400">pulses/rev</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              LCM({specs.statorSlots}, {specs.poles}) = {torqueRippleAnalysis.coggingCyclesPerElecPeriod} pulses/elec cycle
            </span>
          </div>

          {/* Dominant Ripple Harmonic */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Dominant Ripple Order
            </span>
            <div className="text-lg font-bold text-purple-400">
              #{torqueRippleAnalysis.dominantHarmonicOrder}·fe
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              At {Math.round(torqueRippleAnalysis.dominantHarmonicOrder * specs.frequencyHz)} Hz (k_skew = {torqueRippleAnalysis.skewFactorSlotHarmonic})
            </span>
          </div>
        </div>

        {/* Waveform Visualization & Interactive Canvas Container */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          {/* Waveform Canvas Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white flex items-center gap-1.5 font-mono">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                Torque Waveform T(θ) [0° to 360° Electrical]
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                (Mechanical span: 0° to {(360 / (specs.poles / 2)).toFixed(1)}° mech)
              </span>
            </div>

            {/* Toggle Overlay Checkboxes */}
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                <input
                  type="checkbox"
                  checked={showCoggingOverlay}
                  onChange={(e) => setShowCoggingOverlay(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                <span>Cogging Component (Tcog)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                <input
                  type="checkbox"
                  checked={showHarmonicEnvelope}
                  onChange={(e) => setShowHarmonicEnvelope(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-purple-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
                <span>Harmonic Interaction (Tharm)</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 hover:text-white select-none">
                <input
                  type="checkbox"
                  checked={showRippleBand}
                  onChange={(e) => setShowRippleBand(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="w-2 h-2 rounded-sm bg-cyan-400/40 inline-block" />
                <span>Peak Ripple Band (ΔT)</span>
              </label>
            </div>
          </div>

          {/* Interactive SVG Torque Waveform Canvas */}
          {(() => {
            const svgW = 720;
            const svgH = 260;
            const pLeft = 65;
            const pRight = 35;
            const pTop = 30;
            const pBottom = 45;
            const iW = svgW - pLeft - pRight;
            const iH = svgH - pTop - pBottom;

            const tAvg = torqueRippleAnalysis.avgTorqueNm;
            const tMin = torqueRippleAnalysis.minTorqueNm;
            const tMax = torqueRippleAnalysis.maxTorqueNm;
            const rippleSpan = Math.max(0.1, tMax - tMin);

            // Vertical scale bounds with margin
            const yMargin = Math.max(rippleSpan * 0.7, tAvg * 0.05);
            const yMin = Math.max(0, tMin - yMargin);
            const yMax = tMax + yMargin;
            const yRange = Math.max(0.2, yMax - yMin);

            const scaleX = (deg: number) => pLeft + (deg / 360) * iW;
            const scaleY = (val: number) => pTop + iH - ((val - yMin) / yRange) * iH;

            // Generate SVG path strings
            const points = torqueRippleAnalysis.waveformPoints;

            // Instantaneous Total Torque Path
            const d_total = points
              .map(
                (p, idx) =>
                  `${idx === 0 ? 'M' : 'L'} ${scaleX(p.electricalAngleDeg).toFixed(1)} ${scaleY(
                    p.instantaneousTorqueNm
                  ).toFixed(1)}`
              )
              .join(' ');

            // Area fill under instantaneous torque curve
            const d_fill = `${d_total} L ${scaleX(360).toFixed(1)} ${scaleY(yMin).toFixed(
              1
            )} L ${scaleX(0).toFixed(1)} ${scaleY(yMin).toFixed(1)} Z`;

            // Cogging torque path (centered around mean torque for visual overlay)
            const d_cog = points
              .map(
                (p, idx) =>
                  `${idx === 0 ? 'M' : 'L'} ${scaleX(p.electricalAngleDeg).toFixed(1)} ${scaleY(
                    tAvg + p.coggingTorqueNm
                  ).toFixed(1)}`
              )
              .join(' ');

            // Harmonic interaction torque path (centered around mean torque)
            const d_harm = points
              .map(
                (p, idx) =>
                  `${idx === 0 ? 'M' : 'L'} ${scaleX(p.electricalAngleDeg).toFixed(1)} ${scaleY(
                    tAvg + p.harmonicTorqueNm
                  ).toFixed(1)}`
              )
              .join(' ');

            // Y-axis tick values (5 grid levels)
            const yTicks = [
              yMin,
              yMin + yRange * 0.25,
              yMin + yRange * 0.5,
              yMin + yRange * 0.75,
              yMax,
            ];

            // X-axis tick angles
            const xTicks = [0, 60, 120, 180, 240, 300, 360];
            const pPoles = Math.max(1, specs.poles / 2);

            const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const mouseX = e.clientX - rect.left;
              const normalizedX = (mouseX / rect.width) * svgW;
              if (normalizedX >= pLeft && normalizedX <= pLeft + iW) {
                const deg = Math.max(0, Math.min(360, ((normalizedX - pLeft) / iW) * 360));
                // Find closest point in waveformPoints
                const closest = points.reduce((prev, curr) =>
                  Math.abs(curr.electricalAngleDeg - deg) < Math.abs(prev.electricalAngleDeg - deg)
                    ? curr
                    : prev
                );
                setHoveredTorquePoint(closest);
              }
            };

            return (
              <div className="relative">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="w-full h-64 select-none cursor-crosshair overflow-visible"
                  onMouseMove={handleSvgMouseMove}
                  onMouseLeave={() => setHoveredTorquePoint(null)}
                >
                  <defs>
                    <linearGradient id="torqueFillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#0891b2" stopOpacity="0.02" />
                    </linearGradient>

                    <linearGradient id="rippleBandGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.12" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.04" />
                    </linearGradient>

                    <filter id="glowLine" x="-10%" y="-10%" width="120%" height="120%">
                      <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#22d3ee" floodOpacity="0.4" />
                    </filter>
                  </defs>

                  {/* Horizontal Y-Gridlines & Labels */}
                  {yTicks.map((yVal, idx) => {
                    const yPos = scaleY(yVal);
                    return (
                      <g key={idx}>
                        <line
                          x1={pLeft}
                          y1={yPos}
                          x2={pLeft + iW}
                          y2={yPos}
                          stroke="#1e293b"
                          strokeDasharray="2 3"
                        />
                        <text
                          x={pLeft - 8}
                          y={yPos + 3.5}
                          fill="#64748b"
                          fontSize="9"
                          fontFamily="monospace"
                          textAnchor="end"
                        >
                          {yVal.toFixed(2)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Vertical X-Gridlines & Dual Angle Labels (Elec & Mech) */}
                  {xTicks.map((deg, idx) => {
                    const xPos = scaleX(deg);
                    const mechDeg = (deg / pPoles).toFixed(1);
                    return (
                      <g key={idx}>
                        <line
                          x1={xPos}
                          y1={pTop}
                          x2={xPos}
                          y2={pTop + iH}
                          stroke="#1e293b"
                          strokeDasharray="2 3"
                        />
                        {/* Electrical Angle Label */}
                        <text
                          x={xPos}
                          y={pTop + iH + 16}
                          fill="#94a3b8"
                          fontSize="9.5"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {deg}°e
                        </text>
                        {/* Secondary Mechanical Angle Label */}
                        <text
                          x={xPos}
                          y={pTop + iH + 28}
                          fill="#64748b"
                          fontSize="8"
                          fontFamily="monospace"
                          textAnchor="middle"
                        >
                          {mechDeg}°m
                        </text>
                      </g>
                    );
                  })}

                  {/* Y-Axis Title */}
                  <text
                    x={-pTop - iH / 2}
                    y="18"
                    transform="rotate(-90)"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    Torque [N·m]
                  </text>

                  {/* X-Axis Title */}
                  <text
                    x={pLeft + iW / 2}
                    y={pTop + iH + 40}
                    fill="#94a3b8"
                    fontSize="9.5"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    Rotor Angle θ [Electrical Degrees °e / Mechanical Degrees °m]
                  </text>

                  {/* Shaded Peak-to-Peak Ripple Band */}
                  {showRippleBand && (
                    <g>
                      <rect
                        x={pLeft}
                        y={scaleY(tMax)}
                        width={iW}
                        height={Math.max(1, scaleY(tMin) - scaleY(tMax))}
                        fill="url(#rippleBandGrad)"
                        stroke="#38bdf8"
                        strokeOpacity="0.3"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={pLeft + iW - 6}
                        y={scaleY(tMax) - 5}
                        fill="#38bdf8"
                        fontSize="8.5"
                        fontFamily="monospace"
                        textAnchor="end"
                      >
                        Tmax = {tMax} N·m (+{(( (tMax - tAvg) / tAvg ) * 100).toFixed(1)}%)
                      </text>
                      <text
                        x={pLeft + iW - 6}
                        y={scaleY(tMin) + 12}
                        fill="#38bdf8"
                        fontSize="8.5"
                        fontFamily="monospace"
                        textAnchor="end"
                      >
                        Tmin = {tMin} N·m ({(( (tMin - tAvg) / tAvg ) * 100).toFixed(1)}%)
                      </text>
                    </g>
                  )}

                  {/* Mean Rated Torque Reference Line (dashed green) */}
                  <g>
                    <line
                      x1={pLeft}
                      y1={scaleY(tAvg)}
                      x2={pLeft + iW}
                      y2={scaleY(tAvg)}
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={pLeft + 6}
                      y={scaleY(tAvg) - 5}
                      fill="#10b981"
                      fontSize="9"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      Tn (Rated Mean) = {tAvg} N·m
                    </text>
                  </g>

                  {/* Cogging Torque Component Waveform Path */}
                  {showCoggingOverlay && (
                    <path
                      d={d_cog}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.5"
                      strokeOpacity="0.85"
                    />
                  )}

                  {/* Harmonic Interaction Waveform Path */}
                  {showHarmonicEnvelope && (
                    <path
                      d={d_harm}
                      fill="none"
                      stroke="#c084fc"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                      strokeOpacity="0.85"
                    />
                  )}

                  {/* Area Under Instantaneous Total Torque */}
                  <path d={d_fill} fill="url(#torqueFillGrad)" />

                  {/* Instantaneous Total Torque Synthesized Waveform Path */}
                  <path
                    d={d_total}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    filter="url(#glowLine)"
                  />

                  {/* Hover Crosshair and Data Point */}
                  {hoveredTorquePoint && (
                    <g>
                      {/* Vertical line indicator */}
                      <line
                        x1={scaleX(hoveredTorquePoint.electricalAngleDeg)}
                        y1={pTop}
                        x2={scaleX(hoveredTorquePoint.electricalAngleDeg)}
                        y2={pTop + iH}
                        stroke="#e2e8f0"
                        strokeWidth="1.2"
                        strokeDasharray="3 3"
                        strokeOpacity="0.7"
                      />

                      {/* Cogging dot */}
                      {showCoggingOverlay && (
                        <circle
                          cx={scaleX(hoveredTorquePoint.electricalAngleDeg)}
                          cy={scaleY(tAvg + hoveredTorquePoint.coggingTorqueNm)}
                          r="3"
                          fill="#f59e0b"
                          stroke="#020617"
                          strokeWidth="1"
                        />
                      )}

                      {/* Total torque dot */}
                      <circle
                        cx={scaleX(hoveredTorquePoint.electricalAngleDeg)}
                        cy={scaleY(hoveredTorquePoint.instantaneousTorqueNm)}
                        r="5"
                        fill="#22d3ee"
                        stroke="#020617"
                        strokeWidth="2"
                      />
                    </g>
                  )}
                </svg>

                {/* Floating Tooltip Crosshair Callout */}
                {hoveredTorquePoint && (
                  <div
                    className="absolute pointer-events-none bg-slate-900/95 border border-cyan-500/60 shadow-xl rounded-lg p-2.5 text-[11px] font-mono text-slate-200 z-30 transition-all backdrop-blur-sm"
                    style={{
                      left: `${Math.min(
                        75,
                        Math.max(12, (hoveredTorquePoint.electricalAngleDeg / 360) * 100)
                      )}%`,
                      top: '12px',
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 font-bold text-white border-b border-slate-800 pb-1 mb-1">
                      <span className="text-cyan-400">
                        θe = {hoveredTorquePoint.electricalAngleDeg}° ({hoveredTorquePoint.mechanicalAngleDeg}°m)
                      </span>
                      <span className="text-emerald-400">
                        {hoveredTorquePoint.instantaneousTorqueNm} N·m
                      </span>
                    </div>
                    <div className="space-y-0.5 text-slate-300 text-[10px]">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400">Deviation from Mean:</span>
                        <span
                          className={
                            hoveredTorquePoint.instantaneousTorqueNm >= tAvg
                              ? 'text-cyan-300'
                              : 'text-rose-400'
                          }
                        >
                          {hoveredTorquePoint.instantaneousTorqueNm >= tAvg ? '+' : ''}
                          {(hoveredTorquePoint.instantaneousTorqueNm - tAvg).toFixed(3)} N·m (
                          {(
                            ((hoveredTorquePoint.instantaneousTorqueNm - tAvg) / tAvg) *
                            100
                          ).toFixed(2)}
                          %)
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-amber-400">Cogging Component:</span>
                        <span>
                          {hoveredTorquePoint.coggingTorqueNm >= 0 ? '+' : ''}
                          {hoveredTorquePoint.coggingTorqueNm} N·m
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-purple-400">Harmonic Component:</span>
                        <span>
                          {hoveredTorquePoint.harmonicTorqueNm >= 0 ? '+' : ''}
                          {hoveredTorquePoint.harmonicTorqueNm} N·m
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Interactive Curve Legend & Skew Preset Quick-Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
            {/* Visual Color Legend */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-3 h-0.5 bg-cyan-400 inline-block shadow-sm shadow-cyan-400" />
                <span>Total Synthesized T(θ)</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-3 h-0.5 bg-emerald-400 border-t border-dashed border-emerald-400 inline-block" />
                <span>Rated Mean Tn ({torqueRippleAnalysis.avgTorqueNm} N·m)</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-3 h-0.5 bg-amber-400 inline-block" />
                <span>Cogging Reluctance Tcog</span>
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-3 h-0.5 bg-purple-400 border-t border-dashed border-purple-400 inline-block" />
                <span>Space MMF Harmonics Tharm</span>
              </span>
            </div>

            {/* Quick Skewing Impact Selector */}
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-slate-400">Slot Skew:</span>
              <span className="text-cyan-300 font-bold mr-1">{skewAngleSlots.toFixed(2)} slots</span>
              {[0, 0.5, 1.0].map((val) => (
                <button
                  key={val}
                  onClick={() => setSkewAngleSlots(val)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    skewAngleSlots === val
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {val === 0 ? '0.0 (None)' : val === 0.5 ? '0.5' : '1.0 (Optimal)'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Harmonic Components Decomposition Table & Physical Analysis */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-cyan-400" />
              Torque Ripple Harmonic Decomposition & Origin Matrix
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Fundamental fe = {specs.frequencyHz} Hz | Rated nr = {geom.ratedSpeedRpm} rpm
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {torqueRippleAnalysis.harmonicComponents.map((hc) => {
              const isSelected = selectedTorqueHarmonic?.id === hc.id;
              return (
                <div
                  key={hc.id}
                  onClick={() =>
                    setSelectedTorqueHarmonic(isSelected ? null : hc)
                  }
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-cyan-950/20 border-cyan-500 ring-1 ring-cyan-500/40'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-white font-mono">{hc.orderName}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        hc.source === 'cogging'
                          ? 'bg-amber-400'
                          : hc.source === 'slot_permeance'
                          ? 'bg-sky-400'
                          : 'bg-purple-400'
                      }`}
                    />
                  </div>

                  <div className="flex items-baseline justify-between font-mono my-1.5">
                    <span className="text-base font-bold text-cyan-300">
                      {hc.amplitudeNm} <span className="text-[10px] text-slate-400 font-normal">N·m</span>
                    </span>
                    <span className="text-xs text-slate-400 font-bold">
                      {hc.relativePct}% <span className="text-[9px] text-slate-500 font-normal">Tn</span>
                    </span>
                  </div>

                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800 mb-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        hc.source === 'cogging'
                          ? 'bg-amber-400'
                          : hc.source === 'slot_permeance'
                          ? 'bg-sky-400'
                          : 'bg-purple-400'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.max(4, hc.relativePct * 7))}%`,
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>Freq: {hc.frequencyHz} Hz</span>
                    <span className="text-cyan-400 font-sans">Inspect →</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected Harmonic Detail Drawer */}
          {selectedTorqueHarmonic && (
            <div className="p-3 bg-slate-900/90 rounded-lg border border-cyan-500/40 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-cyan-300 font-mono flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  {selectedTorqueHarmonic.orderName} Physical Mechanism:
                </span>
                <span className="font-mono text-slate-400 text-[11px]">
                  Amplitude = {selectedTorqueHarmonic.amplitudeNm} N·m ({selectedTorqueHarmonic.relativePct}% of rated torque)
                </span>
              </div>
              <p className="text-slate-300 font-sans leading-relaxed text-[11px]">
                {selectedTorqueHarmonic.description}
              </p>
            </div>
          )}
        </div>

        {/* Actionable Directives for Cogging & Torque Quality Mitigation */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Torque Quality & Cogging Torque Mitigation Directives</span>
            </div>
            <span className="text-[11px] font-mono text-cyan-400">
              Analytical textbook formulations (Hanselman, Pyrhönen, Zhu)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
            {torqueRippleAnalysis.mitigationDirectives.map((dir, idx) => (
              <div
                key={idx}
                className="bg-slate-900/70 p-3 rounded-lg border border-slate-800/80 flex flex-col justify-between space-y-2"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      {dir.title}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        dir.effectiveness === 'high'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {dir.effectiveness.toUpperCase()} IMPACT
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed font-sans">
                    {dir.description}
                  </p>
                </div>

                {dir.actionable && dir.title.includes('Skewing') && (
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">
                      Current: {skewAngleSlots.toFixed(2)} slots
                    </span>
                    <button
                      onClick={() => setSkewAngleSlots(1.0)}
                      className="px-2.5 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded text-[11px] font-mono transition-colors"
                    >
                      Apply 1.0 Slot Pitch Skew
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* EXTENDED: Maxwell Radial Force Density & Stator Structural NVH Analysis */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Waves className="w-4 h-4 text-cyan-400" />
              Maxwell Radial Force Density & Stator NVH Acoustic Analysis
            </h3>
            <p className="text-xs text-slate-400">
              Analytical estimation of electromagnetic radial pressure (p_r = B²/2μ₀), stator circumferential modal frequencies (Jordan / Den Hartog), dynamic deformation, and radiated acoustic sound pressure level (IEC 60034-9).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Acoustic SPL:</span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                nvhAnalysis.noiseRating === 'quiet'
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                  : nvhAnalysis.noiseRating === 'nominal'
                  ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60'
                  : nvhAnalysis.noiseRating === 'elevated'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                  : 'bg-rose-950/90 text-rose-300 border-rose-600'
              }`}
            >
              {nvhAnalysis.noiseRating === 'quiet' ? (
                <VolumeX className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
              {nvhAnalysis.estimatedSoundPressureLevelDba} dBA ({nvhAnalysis.noiseRating.toUpperCase()})
            </span>
          </div>
        </div>

        {/* NVH Primary KPI Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono">
          {/* Peak Maxwell Radial Stress */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Peak Radial Stress (pr,max)
            </span>
            <div className="text-lg font-bold text-cyan-400">
              {nvhAnalysis.peakRadialPressureKPa} <span className="text-xs text-slate-400 font-normal">kPa</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              {nvhAnalysis.peakRadialPressurePsi} psi | Avg: {nvhAnalysis.averageRadialPressureKPa} kPa
            </span>
          </div>

          {/* Lowest Spatial Mode */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Lowest Spatial Mode (r_low)
            </span>
            <div className="text-lg font-bold text-white flex items-center gap-1.5">
              <span>Mode {nvhAnalysis.lowestSpatialMode}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-sans font-semibold uppercase ${
                  nvhAnalysis.poleSlotCombinationQuality === 'optimal'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : nvhAnalysis.poleSlotCombinationQuality === 'moderate'
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}
              >
                {nvhAnalysis.poleSlotCombinationQuality}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              GCD(Qs, 2p) = GCD({specs.statorSlots}, {specs.poles})
            </span>
          </div>

          {/* Dominant Acoustic Frequency */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Dominant Acoustic Tone
            </span>
            <div className="text-lg font-bold text-amber-400">
              {nvhAnalysis.dominantExcitationFreqHz} <span className="text-xs text-slate-400 font-normal">Hz</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              2·fe = {2 * specs.frequencyHz} Hz | Slot: {Math.round(specs.statorSlots * (geom.ratedSpeedRpm / 60))} Hz
            </span>
          </div>

          {/* Radiated SPL at 1 Meter */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Radiated SPL (1m Free Field)
            </span>
            <div
              className={`text-lg font-bold ${
                nvhAnalysis.estimatedSoundPressureLevelDba < 76
                  ? 'text-emerald-400'
                  : nvhAnalysis.estimatedSoundPressureLevelDba < 84
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {nvhAnalysis.estimatedSoundPressureLevelDba} <span className="text-xs text-slate-400 font-normal">dBA</span>
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              IEC 60034-9 industrial limit: 82 dBA
            </span>
          </div>

          {/* Stator Yoke Stiffness Ratio */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
              Yoke Stiffness (hys / Rm)
            </span>
            <div
              className={`text-lg font-bold ${
                nvhAnalysis.yokeStiffnessRatio >= 0.18 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {nvhAnalysis.yokeStiffnessRatio}
            </div>
            <span className="text-[10px] text-slate-400 block font-sans">
              hys = {geom.statorYokeDepthMm} mm | Target ≥ 0.18
            </span>
          </div>
        </div>

        {/* 2-Column Section: Modal Vibration Spectrum & Interactive Ring Deformation */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Circumferential Modes & Resonance Response Table (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Stator Structural Modal Resonance & Dynamic Deflection
                </span>
                <span className="text-[11px] text-slate-400">
                  Den Hartog ring bending formulation with tooth mass loading correction (~0.85). Click a mode to visualize deformation.
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                    <th className="pb-2 font-medium">Spatial Mode</th>
                    <th className="pb-2 font-medium">Excitation</th>
                    <th className="pb-2 font-medium">Natural Freq</th>
                    <th className="pb-2 font-medium text-right">Dyn. Gain H</th>
                    <th className="pb-2 font-medium text-right">Deflection δr</th>
                    <th className="pb-2 font-medium text-right">Resonance Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {nvhAnalysis.radialHarmonics.map((h) => {
                    const isSelected = selectedNvhMode === h.modeOrder;
                    return (
                      <tr
                        key={h.modeName}
                        onClick={() => setSelectedNvhMode(h.modeOrder)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-cyan-950/40 text-cyan-200'
                            : 'hover:bg-slate-900/60 text-slate-300'
                        }`}
                      >
                        <td className="py-2.5 font-medium flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isSelected ? 'bg-cyan-400 ring-2 ring-cyan-500/40' : 'bg-slate-600'
                            }`}
                          />
                          <span>{h.modeName}</span>
                        </td>
                        <td className="py-2.5 text-slate-300">{h.excitationFreqHz} Hz</td>
                        <td className="py-2.5 text-slate-300">{h.naturalFreqHz} Hz</td>
                        <td className="py-2.5 text-right font-bold text-cyan-300">
                          {h.amplificationFactor}x
                        </td>
                        <td className="py-2.5 text-right font-bold text-white">
                          {h.statorDeformationMicrons} <span className="text-slate-400 text-[10px]">μm</span>
                        </td>
                        <td className="py-2.5 text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              h.resonanceRisk === 'high'
                                ? 'bg-rose-950 text-rose-300 border border-rose-700'
                                : h.resonanceRisk === 'moderate'
                                ? 'bg-amber-950 text-amber-300 border border-amber-700'
                                : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                            }`}
                          >
                            {h.resonanceRisk}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Frequency Proximity Visualizer Bar */}
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <span className="text-[11px] text-slate-400 block">
                Excitation vs. Modal Frequency Spectrum (0 - {Math.max(3000, specs.statorSlots * 35)} Hz)
              </span>
              <div className="relative h-6 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                {/* 2*fe excitation marker */}
                {(() => {
                  const maxHz = Math.max(3500, specs.statorSlots * 40);
                  const excPos = Math.min(96, ((2 * specs.frequencyHz) / maxHz) * 100);
                  const slotPos = Math.min(96, ((specs.statorSlots * (geom.ratedSpeedRpm / 60)) / maxHz) * 100);
                  const mode2Pos = Math.min(96, (nvhAnalysis.statorNaturalFrequenciesHz.mode2_oval / maxHz) * 100);
                  const mode0Pos = Math.min(96, (nvhAnalysis.statorNaturalFrequenciesHz.mode0_breathing / maxHz) * 100);

                  return (
                    <>
                      {/* Mode 2 Natural frequency marker */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-sky-400/80 z-10"
                        style={{ left: `${mode2Pos}%` }}
                        title={`Mode 2 Natural: ${nvhAnalysis.statorNaturalFrequenciesHz.mode2_oval} Hz`}
                      />
                      {/* Mode 0 Natural frequency marker */}
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-purple-400/80 z-10"
                        style={{ left: `${mode0Pos}%` }}
                        title={`Mode 0 Natural: ${nvhAnalysis.statorNaturalFrequenciesHz.mode0_breathing} Hz`}
                      />
                      {/* 2fe Excitation pointer */}
                      <div
                        className="absolute top-0 bottom-0 w-1.5 bg-amber-400 shadow-sm shadow-amber-400/50 z-20"
                        style={{ left: `${excPos}%` }}
                        title={`2*fe Excitation: ${2 * specs.frequencyHz} Hz`}
                      />
                      {/* Slot Ripple Excitation pointer */}
                      <div
                        className="absolute top-0 bottom-0 w-1.5 bg-rose-400 shadow-sm shadow-rose-400/50 z-20"
                        style={{ left: `${slotPos}%` }}
                        title={`Slot Passing: ${Math.round(specs.statorSlots * (geom.ratedSpeedRpm / 60))} Hz`}
                      />
                    </>
                  );
                })()}
              </div>
              <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 font-mono">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block" /> 2·fe ({2 * specs.frequencyHz} Hz)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-rose-400 inline-block" /> f_slot ({Math.round(specs.statorSlots * (geom.ratedSpeedRpm / 60))} Hz)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-sky-400 inline-block" /> f_nat (Mode 2: {nvhAnalysis.statorNaturalFrequenciesHz.mode2_oval} Hz)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-purple-400 inline-block" /> f_nat (Mode 0: {nvhAnalysis.statorNaturalFrequenciesHz.mode0_breathing} Hz)
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Stator Ring Modal Deformation Visualizer (5 cols) */}
          <div className="lg:col-span-5 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  Stator Circumferential Mode Shape
                </span>
                <span className="text-[10px] font-mono text-cyan-400">
                  r = {selectedNvhMode} ({selectedNvhMode === 0 ? 'Breathing' : selectedNvhMode === 2 ? 'Ovalizing' : selectedNvhMode === 3 ? 'Triangular' : 'Quad'})
                </span>
              </div>

              {/* Mode Selection Pills */}
              <div className="grid grid-cols-4 gap-1 mb-3">
                {[0, 2, 3, 4].map((m) => (
                  <button
                    key={m}
                    onClick={() => setSelectedNvhMode(m)}
                    className={`py-1 px-1.5 text-[11px] font-mono rounded font-medium transition-colors ${
                      selectedNvhMode === m
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm shadow-cyan-500/20'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    Mode {m}
                  </button>
                ))}
              </div>

              {/* SVG Modal Ring Visualizer */}
              <div className="relative flex justify-center items-center bg-slate-900/60 rounded-xl p-2 border border-slate-800/80">
                <svg viewBox="0 0 240 220" className="w-full max-w-[240px] h-[190px]">
                  <defs>
                    <radialGradient id="ringBg" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#0f172a" stopOpacity="0" />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.08" />
                    </radialGradient>
                  </defs>

                  {/* Circular reference center */}
                  <circle cx="120" cy="110" r="28" fill="#020617" stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
                  <text x="120" y="113" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="monospace">
                    ROTOR
                  </text>

                  {/* Undeformed Baseline Ring (dashed gray) */}
                  <circle
                    cx="120"
                    cy="110"
                    r="72"
                    fill="none"
                    stroke="#475569"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />

                  {/* Deformed Modal Ring Path */}
                  {(() => {
                    const cx = 120;
                    const cy = 110;
                    const baseR = 72;
                    const amp = selectedNvhMode === 0 ? 10 : 16;
                    const steps = 72;
                    const pathParts: string[] = [];

                    for (let i = 0; i <= steps; i++) {
                      const angle = (i / steps) * 2 * Math.PI;
                      const r = baseR + (selectedNvhMode === 0 ? amp : amp * Math.cos(selectedNvhMode * angle));
                      const x = cx + r * Math.cos(angle);
                      const y = cy + r * Math.sin(angle);
                      pathParts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
                    }
                    const d = pathParts.join(' ') + ' Z';

                    return (
                      <path
                        d={d}
                        fill="url(#ringBg)"
                        stroke="#22d3ee"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                      />
                    );
                  })()}

                  {/* Radial Force Vector Arrows */}
                  {(() => {
                    const cx = 120;
                    const cy = 110;
                    const baseR = 72;
                    const numArrows = selectedNvhMode === 0 ? 8 : (selectedNvhMode === 2 ? 4 : (selectedNvhMode === 3 ? 6 : 8));
                    const arrows = [];

                    for (let i = 0; i < numArrows; i++) {
                      const angle = (i / numArrows) * 2 * Math.PI;
                      const factor = selectedNvhMode === 0 ? 1 : Math.cos(selectedNvhMode * angle);
                      const r1 = baseR;
                      const r2 = baseR + factor * 18;
                      const x1 = cx + r1 * Math.cos(angle);
                      const y1 = cy + r1 * Math.sin(angle);
                      const x2 = cx + r2 * Math.cos(angle);
                      const y2 = cy + r2 * Math.sin(angle);

                      arrows.push(
                        <g key={i}>
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={factor >= 0 ? '#38bdf8' : '#f43f5e'}
                            strokeWidth="1.5"
                          />
                          <circle
                            cx={x2}
                            cy={y2}
                            r="2"
                            fill={factor >= 0 ? '#38bdf8' : '#f43f5e'}
                          />
                        </g>
                      );
                    }
                    return arrows;
                  })()}

                  {/* Mode Label */}
                  <text
                    x="120"
                    y="198"
                    textAnchor="middle"
                    fill="#38bdf8"
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight="bold"
                  >
                    Mode {selectedNvhMode}: {
                      selectedNvhMode === 0
                        ? `Uniform Pulsation (${nvhAnalysis.statorNaturalFrequenciesHz.mode0_breathing} Hz)`
                        : selectedNvhMode === 2
                        ? `4-Node Ovalization (${nvhAnalysis.statorNaturalFrequenciesHz.mode2_oval} Hz)`
                        : selectedNvhMode === 3
                        ? `6-Node Triangular (${nvhAnalysis.statorNaturalFrequenciesHz.mode3_triangular} Hz)`
                        : `8-Node Quad (${nvhAnalysis.statorNaturalFrequenciesHz.mode4_quad} Hz)`
                    }
                  </text>
                </svg>
              </div>
            </div>

            {/* Formula Reference Tag */}
            <div className="bg-slate-900/90 rounded-lg p-2.5 border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
              <div className="flex justify-between text-slate-400 text-[10px]">
                <span>Jordan / Den Hartog Modal Equation:</span>
                <span className="text-cyan-400">c_ring ≈ 5,175 m/s</span>
              </div>
              <div className="text-slate-200">
                fr = <span className="text-cyan-300">1/(2π)·√(E·I/(ρ·A·Rm⁴))</span> · [r(r²-1)/√(r²+1)]
              </div>
            </div>
          </div>
        </div>

        {/* Actionable Engineering NVH Mitigation Advisories */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>NVH & Acoustic Noise Mitigation Directives</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300 font-sans">
            {nvhAnalysis.mitigationAdvisories.map((advisory, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 bg-slate-900/70 p-2.5 rounded-lg border border-slate-800/80"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                <span className="leading-relaxed">{advisory}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* EXTENDED: Loss Breakdown Stacked Bar Chart & Energy Flow Analysis */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Loss Breakdown & Stacked Energy Flow (Efficiency Drain Analysis)
            </h3>
            <p className="text-xs text-slate-400">
              Visual breakdown of active dissipation channels (Copper I²R, Iron Core Hysteresis/Eddy, and Mechanical Friction/Windage) as a stacked bar chart to identify efficiency loss bottlenecks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Selector Toggle */}
            <div className="bg-slate-950 p-0.5 rounded-lg border border-slate-800 flex text-xs font-mono">
              <button
                onClick={() => setLossStackMode('relative')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  lossStackMode === 'relative'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Loss Share (100% Ploss)
              </button>
              <button
                onClick={() => setLossStackMode('power_flow')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  lossStackMode === 'power_flow'
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Power Flow (100% Pin)
              </button>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 font-bold">
                η = {geom.calculatedEfficiency}%
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 text-slate-300 border border-slate-800">
                Ploss = <strong>{totalLossW} W</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Dominant Loss Alert Banner */}
        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <TrendingDown className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-semibold text-white">
                Primary Efficiency Sink: <span className="text-rose-400">{dominantLoss.title}</span> ({dominantLoss.totalW} W, {dominantLoss.pctOfLoss}% of total losses)
              </span>
              <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                {dominantLoss.rootCause}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedLossCategory(dominantLoss.id)}
            className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-700 rounded-lg text-[11px] font-mono whitespace-nowrap transition-colors"
          >
            Inspect Mitigation →
          </button>
        </div>

        {/* Stacked Bar Chart Container */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center gap-1.5 font-mono">
              <PieChart className="w-3.5 h-3.5 text-cyan-400" />
              {lossStackMode === 'relative'
                ? `Total Dissipated Heat Stack (Ploss = ${totalLossW} W)`
                : `Total Electrical Input Power Flow (Pin = ${Math.round(pInW)} W)`}
            </span>
            <span className="text-[11px] text-slate-400 font-sans">
              Click any segment to view detailed physics & mitigation roadmap
            </span>
          </div>

          {/* Primary Stacked Bar */}
          <div className="space-y-1">
            <div className="h-10 w-full rounded-lg overflow-hidden border border-slate-800 bg-slate-900/60 flex relative shadow-inner select-none">
              {lossStackMode === 'relative' ? (
                // Relative 100% of Losses Mode
                <>
                  {/* Copper Segment */}
                  <div
                    onClick={() => setSelectedLossCategory('copper')}
                    style={{ width: `${pctCu}%` }}
                    className="h-full bg-gradient-to-r from-rose-600 to-rose-500 hover:brightness-110 cursor-pointer transition-all duration-200 flex items-center justify-center px-1.5 relative group border-r border-slate-900/40"
                    title={`Copper Loss: ${copperTotalW} W (${pctCu}%)`}
                  >
                    <span className="text-[11px] font-mono font-bold text-white drop-shadow-sm truncate">
                      {pctCu >= 16 ? `Copper ${pctCu}% (${copperTotalW}W)` : pctCu >= 8 ? `Cu ${pctCu}%` : `${pctCu}%`}
                    </span>
                  </div>

                  {/* Iron Core Segment */}
                  <div
                    onClick={() => setSelectedLossCategory('iron')}
                    style={{ width: `${pctFe}%` }}
                    className="h-full bg-gradient-to-r from-sky-600 to-sky-500 hover:brightness-110 cursor-pointer transition-all duration-200 flex items-center justify-center px-1.5 relative group border-r border-slate-900/40"
                    title={`Iron Core Loss: ${ironTotalW} W (${pctFe}%)`}
                  >
                    <span className="text-[11px] font-mono font-bold text-white drop-shadow-sm truncate">
                      {pctFe >= 16 ? `Iron Core ${pctFe}% (${ironTotalW}W)` : pctFe >= 8 ? `Fe ${pctFe}%` : `${pctFe}%`}
                    </span>
                  </div>

                  {/* Mechanical / Windage Segment */}
                  <div
                    onClick={() => setSelectedLossCategory('mechanical')}
                    style={{ width: `${pctMech}%` }}
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:brightness-110 cursor-pointer transition-all duration-200 flex items-center justify-center px-1.5 relative group border-r border-slate-900/40"
                    title={`Windage & Friction: ${mechTotalW} W (${pctMech}%)`}
                  >
                    <span className="text-[11px] font-mono font-bold text-white drop-shadow-sm truncate">
                      {pctMech >= 16 ? `Windage ${pctMech}% (${mechTotalW}W)` : pctMech >= 8 ? `Mech ${pctMech}%` : `${pctMech}%`}
                    </span>
                  </div>

                  {/* Stray Load Segment */}
                  <div
                    onClick={() => setSelectedLossCategory('stray')}
                    style={{ width: `${pctStray}%` }}
                    className="h-full bg-gradient-to-r from-purple-600 to-purple-500 hover:brightness-110 cursor-pointer transition-all duration-200 flex items-center justify-center px-1.5 relative group"
                    title={`Stray Load Loss: ${strayTotalW} W (${pctStray}%)`}
                  >
                    <span className="text-[11px] font-mono font-bold text-white drop-shadow-sm truncate">
                      {pctStray >= 12 ? `Stray ${pctStray}% (${strayTotalW}W)` : pctStray >= 6 ? `Stray ${pctStray}%` : `${pctStray}%`}
                    </span>
                  </div>
                </>
              ) : (
                // Full Input Power Flow Mode
                <>
                  {/* Shaft Output Power Segment */}
                  <div
                    style={{ width: `${pctShaftIn}%` }}
                    className="h-full bg-gradient-to-r from-emerald-600 to-teal-500 hover:brightness-105 transition-all duration-200 flex items-center justify-center px-2 relative group border-r border-slate-900/60"
                    title={`Useful Shaft Power Output: ${(pShaftW / 1000).toFixed(1)} kW (${pctShaftIn}%)`}
                  >
                    <span className="text-[11px] font-mono font-bold text-white drop-shadow-sm truncate">
                      Useful Mechanical Power: {pctShaftIn}% ({(pShaftW / 1000).toFixed(1)} kW)
                    </span>
                  </div>

                  {/* Copper Loss */}
                  <div
                    onClick={() => setSelectedLossCategory('copper')}
                    style={{ width: `${pctCuIn}%` }}
                    className="h-full bg-rose-500 hover:brightness-110 cursor-pointer transition-all duration-200 flex items-center justify-center px-1 relative group border-r border-slate-900/40"
                    title={`Copper Loss: ${copperTotalW} W (${pctCuIn}% of Pin)`}
                  >
                    <span className="text-[10px] font-mono font-bold text-white drop-shadow-sm truncate">
                      {pctCuIn >= 5 ? `Cu ${pctCuIn}%` : `${pctCuIn}%`}
                    </span>
                  </div>

                  {/* Iron Core Loss */}
                  <div
                    onClick={() => setSelectedLossCategory('iron')}
                    style={{ width: `${pctFeIn}%` }}
                    className="h-full bg-sky-500 hover:brightness-110 cursor-pointer transition-all duration-200 flex items-center justify-center px-1 relative group border-r border-slate-900/40"
                    title={`Iron Core Loss: ${ironTotalW} W (${pctFeIn}% of Pin)`}
                  >
                    <span className="text-[10px] font-mono font-bold text-white drop-shadow-sm truncate">
                      {pctFeIn >= 5 ? `Fe ${pctFeIn}%` : `${pctFeIn}%`}
                    </span>
                  </div>

                  {/* Mechanical Loss */}
                  <div
                    onClick={() => setSelectedLossCategory('mechanical')}
                    style={{ width: `${pctMechIn}%` }}
                    className="h-full bg-emerald-500 hover:brightness-110 cursor-pointer transition-all duration-200 flex items-center justify-center px-1 relative group border-r border-slate-900/40"
                    title={`Friction & Windage: ${mechTotalW} W (${pctMechIn}% of Pin)`}
                  >
                    <span className="text-[10px] font-mono font-bold text-white drop-shadow-sm truncate">
                      {pctMechIn >= 4 ? `Mech ${pctMechIn}%` : `${pctMechIn}%`}
                    </span>
                  </div>

                  {/* Stray Loss */}
                  <div
                    onClick={() => setSelectedLossCategory('stray')}
                    style={{ width: `${pctStrayIn}%` }}
                    className="h-full bg-purple-500 hover:brightness-110 cursor-pointer transition-all duration-200 flex items-center justify-center px-1 relative group"
                    title={`Stray Load Loss: ${strayTotalW} W (${pctStrayIn}% of Pin)`}
                  >
                    <span className="text-[10px] font-mono font-bold text-white drop-shadow-sm truncate">
                      {pctStrayIn >= 3 ? `${pctStrayIn}%` : ''}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Stack Axis Labels */}
            <div className="flex justify-between text-[10px] font-mono text-slate-500 px-1 pt-0.5">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>
                100% {lossStackMode === 'relative' ? `(${totalLossW} W Heat)` : `(${Math.round(pInW)} W Input)`}
              </span>
            </div>
          </div>

          {/* Secondary Stacked Bar for Optimized Design Comparison (if converged) */}
          {optimizedCandidate && (
            <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Auto-Optimized Geometry Comparison: {optimizedCandidate.geom.totalLossW} W (η = {optimizedCandidate.geom.calculatedEfficiency}%)
                </span>
                <span className="text-emerald-300 font-bold">
                  -{optimizedCandidate.lossReductionW} W Dissipation ({optimizedCandidate.efficiencyGainPct}% efficiency gain)
                </span>
              </div>

              {(() => {
                const optTotalLoss = Math.max(1, optimizedCandidate.geom.totalLossW);
                const optCu = optimizedCandidate.geom.statorCopperLossW + optimizedCandidate.geom.rotorLossW;
                const optFe = optimizedCandidate.geom.ironCoreLossW;
                const optMech = optimizedCandidate.geom.mechanicalLossW;
                const optStray = optimizedCandidate.geom.strayLoadLossW;

                const optPctCu = Number(((optCu / optTotalLoss) * 100).toFixed(1));
                const optPctFe = Number(((optFe / optTotalLoss) * 100).toFixed(1));
                const optPctMech = Number(((optMech / optTotalLoss) * 100).toFixed(1));
                const optPctStray = Number(((optStray / optTotalLoss) * 100).toFixed(1));
                const optWidthPct = Math.min(100, Math.max(20, (optTotalLoss / totalLossW) * 100));

                return (
                  <div className="relative">
                    <div
                      style={{ width: `${optWidthPct}%` }}
                      className="h-7 rounded-md overflow-hidden border border-emerald-700/60 flex relative shadow-sm transition-all duration-300"
                    >
                      <div
                        style={{ width: `${optPctCu}%` }}
                        className="h-full bg-rose-600/90 flex items-center justify-center px-1 border-r border-slate-900/40"
                        title={`Optimized Copper Loss: ${optCu} W (${optPctCu}%)`}
                      >
                        <span className="text-[9.5px] font-mono text-white truncate">
                          {optPctCu >= 15 ? `Cu ${optCu}W` : ''}
                        </span>
                      </div>
                      <div
                        style={{ width: `${optPctFe}%` }}
                        className="h-full bg-sky-600/90 flex items-center justify-center px-1 border-r border-slate-900/40"
                        title={`Optimized Iron Core Loss: ${optFe} W (${optPctFe}%)`}
                      >
                        <span className="text-[9.5px] font-mono text-white truncate">
                          {optPctFe >= 15 ? `Fe ${optFe}W` : ''}
                        </span>
                      </div>
                      <div
                        style={{ width: `${optPctMech}%` }}
                        className="h-full bg-emerald-600/90 flex items-center justify-center px-1 border-r border-slate-900/40"
                        title={`Optimized Mechanical Loss: ${optMech} W (${optPctMech}%)`}
                      >
                        <span className="text-[9.5px] font-mono text-white truncate">
                          {optPctMech >= 12 ? `${optMech}W` : ''}
                        </span>
                      </div>
                      <div
                        style={{ width: `${optPctStray}%` }}
                        className="h-full bg-purple-600/90 flex items-center justify-center px-1"
                        title={`Optimized Stray Loss: ${optStray} W (${optPctStray}%)`}
                      >
                        <span className="text-[9.5px] font-mono text-white truncate">
                          {optPctStray >= 10 ? `${optStray}W` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Color Legend */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono border-t border-slate-800/80">
            {lossCategories.map((cat) => {
              const isSelected = activeLossCategory.id === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedLossCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded transition-all ${
                    isSelected
                      ? 'bg-slate-800 text-white font-bold ring-1 ring-cyan-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span>{cat.shortTitle}</span>
                  <span className="text-slate-500 font-normal">
                    ({cat.pctOfLoss}% | {cat.totalW}W)
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 4-Column Loss Category Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
          {lossCategories.map((cat) => {
            const isSelected = activeLossCategory.id === cat.id;
            return (
              <div
                key={cat.id}
                onClick={() => setSelectedLossCategory(cat.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? `${cat.borderClass} bg-slate-950 ring-1 ring-cyan-500/50 shadow-md`
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans">
                    {cat.shortTitle}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: cat.color }}
                  />
                </div>
                <div className="text-base font-bold text-white mt-1">
                  {cat.totalW} <span className="text-xs text-slate-400 font-normal">W</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5 font-sans">
                  <span>{cat.pctOfLoss}% of heat</span>
                  <span className="text-slate-500 font-mono">({cat.pctOfInput}% Pin)</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 2-Column Sub-Section: Loss Diagnostic Detail & Multi-Variable Optimizer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Selected Loss Physical Diagnosis & Roadmap (7 cols) */}
          <div className="lg:col-span-7 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block shadow-sm"
                    style={{ backgroundColor: activeLossCategory.color }}
                  />
                  <h4 className="text-xs font-semibold text-white">
                    {activeLossCategory.title}
                  </h4>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-cyan-300 font-bold">
                    {activeLossCategory.totalW} W
                  </span>
                  <span className="text-slate-400">
                    {activeLossCategory.pctOfLoss}% of total losses
                  </span>
                </div>
              </div>

              {/* Governing Physical Equation */}
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 space-y-1">
                <span className="text-[10px] text-slate-400 block font-sans uppercase tracking-wider">
                  Governing Physical Formulation:
                </span>
                <span className="text-cyan-300 block font-bold">
                  {activeLossCategory.governingFormula}
                </span>
              </div>

              {/* Active Root Cause in Current Geometry */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-sans uppercase tracking-wider block">
                  Geometric & Material Driving Factors:
                </span>
                <p className="text-xs text-slate-300 leading-relaxed font-sans bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/80">
                  {activeLossCategory.rootCause}
                </p>
              </div>

              {/* Actionable Engineering Mitigation Levers */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-sans uppercase tracking-wider block">
                  Actionable Engineering Levers to Recover Efficiency:
                </span>
                <p className="text-xs text-emerald-300/90 leading-relaxed font-sans bg-emerald-950/20 p-2.5 rounded-lg border border-emerald-900/40">
                  {activeLossCategory.mitigationStrategy}
                </p>
              </div>

              {/* Granular Sub-components Breakdown */}
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] text-slate-400 font-sans uppercase tracking-wider block">
                  Sub-Component Loss Segregation:
                </span>
                <div className="space-y-1 text-xs font-mono">
                  {activeLossCategory.subItems.map((sub, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-slate-900/60 px-2.5 py-1.5 rounded-md border border-slate-800/70"
                    >
                      <div className="flex items-center gap-1.5 text-slate-300 font-sans text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        <span>{sub.label}</span>
                        <span className="text-slate-500 font-sans text-[10px]">({sub.note})</span>
                      </div>
                      <span className="font-bold text-white">
                        {sub.val} W
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Multi-Variable D²L Pareto Optimizer (5 cols) */}
          <div className="lg:col-span-5 bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Automatic Multi-Variable D²L Optimizer
                </h4>
              </div>
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                Iteratively rebalances core length aspect ratio (L/τ), specific electric loading (ac), and slot current density (J) to converge on maximum active efficiency.
              </p>

              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2 mb-3 text-xs font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>Current Aspect Ratio (L/τ):</span>
                  <strong className="text-white">{specs.aspectRatio}</strong>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Active Machine Efficiency:</span>
                  <strong className="text-emerald-400">{geom.calculatedEfficiency}%</strong>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Total Active Losses:</span>
                  <strong className="text-rose-400">{geom.totalLossW} W</strong>
                </div>
              </div>

              {optimizedCandidate && (
                <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Optimal Solution Converged:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-300 font-mono text-[11px]">
                    <div>
                      Optimal L/τ:{' '}
                      <strong className="text-white">{optimizedCandidate.specs.aspectRatio}</strong>
                    </div>
                    <div>
                      Efficiency:{' '}
                      <strong className="text-emerald-300">
                        {optimizedCandidate.geom.calculatedEfficiency}% (+
                        {optimizedCandidate.efficiencyGainPct}%)
                      </strong>
                    </div>
                    <div>
                      Loss Reduction:{' '}
                      <strong className="text-emerald-300">
                        -{optimizedCandidate.lossReductionW} W
                      </strong>
                    </div>
                    <div>
                      Bore D: <strong className="text-white">{optimizedCandidate.geom.statorBoreDiameterMm} mm</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
              <button
                onClick={handleRunOptimizer}
                disabled={isOptimizing}
                className="flex-1 py-2 px-3 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-lg transition-colors shadow-sm shadow-cyan-500/20"
              >
                {isOptimizing ? 'Evaluating Geometry Space...' : 'Run Auto-Optimizer'}
              </button>

              {optimizedCandidate && (
                <button
                  onClick={() => onApplyOptimizedSpecs(optimizedCandidate.specs)}
                  className="py-2 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Apply Solution
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
