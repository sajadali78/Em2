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

  // Harmonic and EMI analysis calculation
  const harmonicAnalysis: HarmonicEmiAnalysisResult = analyzeHarmonicsAndEmi(
    specs,
    geom,
    skewAngleSlots
  );

  // Analytical Maxwell radial force density & stator NVH acoustic analysis
  const nvhAnalysis: NvhAnalysisResult = analyzeRadialForceAndNvh(specs, geom);

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

      {/* 2-Column Section: Loss Balance Breakdown & Pareto Auto-Optimizer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Loss Breakdown Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-cyan-400" />
              Thermal Loss Segregation (Total: {geom.totalLossW} W)
            </h3>
            <span className="text-xs font-mono font-bold text-emerald-400">
              η = {geom.calculatedEfficiency}%
            </span>
          </div>

          <div className="space-y-3">
            {lossItems.map((item) => {
              const pct = ((item.val / geom.totalLossW) * 100).toFixed(1);
              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300 flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.name}
                    </span>
                    <span className="font-mono text-slate-200">
                      <strong>{item.val} W</strong> ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: item.color }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono block pl-4">
                    {item.cite}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pareto Efficiency & Sizing Optimizer */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Automatic Multi-Variable D²L Optimizer
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Iteratively balances core length aspect ratio (L/τ), specific electric loading (ac), and slot current density (J) to converge on maximum active efficiency.
            </p>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 mb-4 text-xs font-mono">
              <div className="flex justify-between text-slate-300">
                <span>Current Aspect Ratio (L/τ):</span>
                <strong className="text-white">{specs.aspectRatio}</strong>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Current Active Efficiency:</span>
                <strong className="text-emerald-400">{geom.calculatedEfficiency}%</strong>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Total Active Losses:</span>
                <strong className="text-rose-400">{geom.totalLossW} W</strong>
              </div>
            </div>

            {optimizedCandidate && (
              <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-lg p-3 mb-4 space-y-2 text-xs">
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

          <div className="flex items-center gap-3 pt-2">
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
                className="py-2 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
              >
                Apply Solution
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
