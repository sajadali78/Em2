/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { MotorSpecs, CalculatedGeometry, MaterialLimitsConfig } from '../types/motor';
import {
  calculateEfficiencyMap,
  EfficiencyMapResult,
  EFFICIENCY_CONTOUR_BANDS,
} from '../utils/efficiencyMapAnalysis';
import {
  simulateTransientThermalDutyCycle,
  TransientThermalResult,
  DUTY_CYCLE_PRESETS,
} from '../utils/transientThermalAnalysis';
import {
  calculateActiveMaterialBOM,
  DEFAULT_UNIT_PRICES,
  MaterialUnitPriceConfig,
  ActiveMaterialAnalysisResult,
} from '../utils/materialCostAnalysis';
import {
  generateMotorCadDxf,
  generateEfficiencyMapCsv,
  generateMachineJson,
  triggerBrowserDownload,
} from '../utils/dxfExportGenerator';
import {
  Activity,
  Zap,
  Gauge,
  Thermometer,
  Layers,
  DollarSign,
  Download,
  Crosshair,
  RotateCcw,
  Sliders,
  Clock,
  Compass,
  FileSpreadsheet,
  FileCode,
  Flame,
} from 'lucide-react';

interface SystemAnalysisViewProps {
  specs: MotorSpecs;
  geom: CalculatedGeometry;
  materialConfig: MaterialLimitsConfig;
  onExportPdf: () => void;
}

export const SystemAnalysisView: React.FC<SystemAnalysisViewProps> = ({
  specs,
  geom,
  materialConfig,
  onExportPdf,
}) => {
  // Drive cycle & efficiency map state
  const [cycleStandard, setCycleStandard] = useState<'iec_industrial' | 'wltp_traction'>('iec_industrial');
  const [showContinuousLimit, setShowContinuousLimit] = useState(true);
  const [showPeakLimit, setShowPeakLimit] = useState(true);
  const [showCycleMarkers, setShowCycleMarkers] = useState(true);
  const [probedPoint, setProbedPoint] = useState<{ speedRpm: number; torqueNm: number } | null>(null);
  const [selectedCyclePointId, setSelectedCyclePointId] = useState<string | null>(null);

  // Transient thermal state
  const [thermalPresetId, setThermalPresetId] = useState<string>('iec_s1');
  const [ambientTempC, setAmbientTempC] = useState<number>(40);
  const [hoveredTimeMinute, setHoveredTimeMinute] = useState<number | null>(null);

  // BOM Material Pricing state
  const [unitPrices, setUnitPrices] = useState<MaterialUnitPriceConfig>(DEFAULT_UNIT_PRICES.default);
  const [dxfDownloadSuccess, setDxfDownloadSuccess] = useState(false);
  const [csvDownloadSuccess, setCsvDownloadSuccess] = useState(false);
  const [jsonDownloadSuccess, setJsonDownloadSuccess] = useState(false);

  // Memoized multi-physics calculations
  const effMap: EfficiencyMapResult = useMemo(() => {
    return calculateEfficiencyMap(specs, geom, cycleStandard);
  }, [specs, geom, cycleStandard]);

  const thermalSim: TransientThermalResult = useMemo(() => {
    return simulateTransientThermalDutyCycle(specs, geom, materialConfig, thermalPresetId, ambientTempC);
  }, [specs, geom, materialConfig, thermalPresetId, ambientTempC]);

  const bomResult: ActiveMaterialAnalysisResult = useMemo(() => {
    return calculateActiveMaterialBOM(specs, geom, unitPrices);
  }, [specs, geom, unitPrices]);

  // Active probe details
  const activeProbeDetails = useMemo(() => {
    if (!probedPoint) return null;
    const { speedRpm, torqueNm } = probedPoint;
    const pShaftW = (torqueNm * speedRpm * 2 * Math.PI) / 60;
    const n_base = effMap.baseSpeedRpm;
    const T_rated = effMap.ratedTorqueNm;

    const sRatio = Math.max(0.01, speedRpm / n_base);
    const tRatio = torqueNm / T_rated;

    const fwFactor = speedRpm > n_base ? 1 + 0.35 * Math.pow((speedRpm - n_base) / n_base, 1.3) : 1.0;
    const pCu = (geom.statorCopperLossW + geom.rotorLossW) * Math.pow(tRatio, 2) * fwFactor;
    const fluxWeak = speedRpm > n_base ? Math.max(0.45, n_base / speedRpm) : 1.0;
    const pFe = geom.ironCoreLossW * Math.pow(sRatio, 1.45) * Math.pow(fluxWeak, 1.8);
    const pMech = geom.mechanicalLossW * Math.pow(sRatio, 2.1);
    const pStray = geom.strayLoadLossW * Math.pow(tRatio, 1.8) * Math.pow(sRatio, 1.2);
    const totLoss = pCu + pFe + pMech + pStray;

    const eff = Math.min(99.0, Math.max(30, (pShaftW / (pShaftW + totLoss)) * 100));

    return {
      speedRpm,
      torqueNm,
      powerKw: Number((pShaftW / 1000).toFixed(2)),
      copperLossW: Math.round(pCu),
      ironLossW: Math.round(pFe),
      mechLossW: Math.round(pMech),
      totalLossW: Math.round(totLoss),
      efficiencyPct: Number(eff.toFixed(2)),
    };
  }, [probedPoint, effMap, geom]);

  // File export handlers
  const handleDownloadDxf = () => {
    const dxf = generateMotorCadDxf(specs, geom);
    triggerBrowserDownload(`${specs.name.replace(/\s+/g, '_')}_2D_Geometry.dxf`, dxf, 'application/dxf');
    setDxfDownloadSuccess(true);
    setTimeout(() => setDxfDownloadSuccess(false), 2500);
  };

  const handleDownloadCsv = () => {
    const csv = generateEfficiencyMapCsv(specs, effMap);
    triggerBrowserDownload(`${specs.name.replace(/\s+/g, '_')}_Efficiency_Map.csv`, csv, 'text/csv');
    setCsvDownloadSuccess(true);
    setTimeout(() => setCsvDownloadSuccess(false), 2500);
  };

  const handleDownloadJson = () => {
    const json = generateMachineJson(specs, geom, bomResult);
    triggerBrowserDownload(`${specs.name.replace(/\s+/g, '_')}_Machine_Spec.json`, json, 'application/json');
    setJsonDownloadSuccess(true);
    setTimeout(() => setJsonDownloadSuccess(false), 2500);
  };

  // SVG dimensions for 2D Efficiency Map
  const mapWidth = 640;
  const mapHeight = 360;
  const padding = { top: 25, right: 35, bottom: 45, left: 60 };
  const plotW = mapWidth - padding.left - padding.right;
  const plotH = mapHeight - padding.top - padding.bottom;

  const maxSpeedPlot = effMap.maxSpeedRpm * 1.05;
  const maxTorquePlot = effMap.peakTorqueNm * 1.15;

  const toSvgX = (rpm: number) => padding.left + (rpm / maxSpeedPlot) * plotW;
  const toSvgY = (nm: number) => padding.top + plotH - (nm / maxTorquePlot) * plotH;

  const fromSvgX = (x: number) => Math.max(0, Math.min(effMap.maxSpeedRpm, ((x - padding.left) / plotW) * maxSpeedPlot));
  const fromSvgY = (y: number) => Math.max(0, Math.min(effMap.peakTorqueNm, ((padding.top + plotH - y) / plotH) * maxTorquePlot));

  const handleSvgClickOrMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (
      clickX >= padding.left &&
      clickX <= padding.left + plotW &&
      clickY >= padding.top &&
      clickY <= padding.top + plotH
    ) {
      const rpm = Math.round(fromSvgX(clickX));
      const nm = Number(fromSvgY(clickY).toFixed(1));
      setProbedPoint({ speedRpm: rpm, torqueNm: nm });
    }
  };

  // Build SVG path strings for envelopes
  const contPathD = effMap.continuousEnvelope
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toSvgX(p.speedRpm).toFixed(1)} ${toSvgY(p.maxTorqueNm).toFixed(1)}`)
    .join(' ');

  const peakPathD = effMap.peakEnvelope
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toSvgX(p.speedRpm).toFixed(1)} ${toSvgY(p.maxTorqueNm).toFixed(1)}`)
    .join(' ');

  // SVG dimensions for Transient Thermal Plot
  const thermW = 640;
  const thermH = 260;
  const tPad = { top: 20, right: 35, bottom: 35, left: 55 };
  const tPlotW = thermW - tPad.left - tPad.right;
  const tPlotH = thermH - tPad.top - tPad.bottom;

  const maxSimMinutes = thermalSim.preset.durationMinutes;
  const maxPlotTemp = Math.max(thermalSim.insulationLimitTempC + 25, thermalSim.maxWindingTempC + 15);
  const minPlotTemp = Math.min(ambientTempC - 5, 20);

  const tToSvgX = (min: number) => tPad.left + (min / maxSimMinutes) * tPlotW;
  const tToSvgY = (c: number) => tPad.top + tPlotH - ((c - minPlotTemp) / (maxPlotTemp - minPlotTemp)) * tPlotH;

  const windingCurveD = thermalSim.timePoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${tToSvgX(p.timeMinutes).toFixed(1)} ${tToSvgY(p.windingTempC).toFixed(1)}`)
    .join(' ');

  const statorIronCurveD = thermalSim.timePoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${tToSvgX(p.timeMinutes).toFixed(1)} ${tToSvgY(p.statorIronTempC).toFixed(1)}`)
    .join(' ');

  const rotorCurveD = thermalSim.timePoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${tToSvgX(p.timeMinutes).toFixed(1)} ${tToSvgY(p.rotorCoreTempC).toFixed(1)}`)
    .join(' ');

  const housingCurveD = thermalSim.timePoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${tToSvgX(p.timeMinutes).toFixed(1)} ${tToSvgY(p.housingTempC).toFixed(1)}`)
    .join(' ');

  // Hovered thermal point
  const currentHoveredThermalPoint = useMemo(() => {
    if (hoveredTimeMinute === null) return null;
    return thermalSim.timePoints.reduce((prev, curr) =>
      Math.abs(curr.timeMinutes - hoveredTimeMinute) < Math.abs(prev.timeMinutes - hoveredTimeMinute) ? curr : prev
    );
  }, [hoveredTimeMinute, thermalSim]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Engineering Control Center */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Activity className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Advanced System Analysis & Multi-Physics Evaluation
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-950/80 border border-indigo-700/60 text-indigo-300">
              IEC 60034-1 & WLTP
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Complete electrical machine system validation: 2D torque-speed operating efficiency envelope (η(n, T)),
            dynamic 4-node lumped-parameter thermal network (T(t)), active material bill-of-materials cost synthesis,
            and AutoCAD DXF export.
          </p>
        </div>

        {/* Global Export Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadDxf}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-500/50 text-xs font-semibold text-white flex items-center gap-1.5 transition-all shadow-sm"
            title="Download AutoCAD DXF 2D Cross-Section"
          >
            <Compass className={`w-3.5 h-3.5 ${dxfDownloadSuccess ? 'text-emerald-400' : 'text-cyan-400'}`} />
            <span>{dxfDownloadSuccess ? 'DXF Exported!' : 'Export 2D CAD (DXF)'}</span>
          </button>

          <button
            onClick={handleDownloadCsv}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 text-xs font-semibold text-white flex items-center gap-1.5 transition-all shadow-sm"
            title="Export Efficiency Grid & Cycle Data to CSV"
          >
            <FileSpreadsheet className={`w-3.5 h-3.5 ${csvDownloadSuccess ? 'text-emerald-400' : 'text-emerald-400'}`} />
            <span>{csvDownloadSuccess ? 'CSV Exported!' : 'Export Map (CSV)'}</span>
          </button>

          <button
            onClick={handleDownloadJson}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500/50 text-xs font-semibold text-white flex items-center gap-1.5 transition-all shadow-sm"
            title="Export Complete Machine Geometry & BOM to JSON"
          >
            <FileCode className={`w-3.5 h-3.5 ${jsonDownloadSuccess ? 'text-emerald-400' : 'text-indigo-400'}`} />
            <span>{jsonDownloadSuccess ? 'JSON Exported!' : 'Machine JSON'}</span>
          </button>

          <button
            onClick={onExportPdf}
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-600/20"
          >
            <Download className="w-3.5 h-3.5 text-slate-950" />
            <span>PDF Report</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: 2D Torque-Speed Efficiency Map & Drive Cycle Analysis */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <h2 className="text-base font-bold text-white">2D Torque-Speed Efficiency Map η(n, T)</h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-semibold">
                Peak η_max: {effMap.peakEfficiencyPct}%
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Full operating envelope featuring constant torque (MTPA), field-weakening rolloff, and efficiency contours.
            </p>
          </div>

          {/* Standard Selector & Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700 text-xs">
              <button
                onClick={() => setCycleStandard('iec_industrial')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  cycleStandard === 'iec_industrial'
                    ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                IEC 60034-1 Duty
              </button>
              <button
                onClick={() => setCycleStandard('wltp_traction')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  cycleStandard === 'wltp_traction'
                    ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                WLTP / EV Drive
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <button
                onClick={() => setShowContinuousLimit(!showContinuousLimit)}
                className={`px-2 py-1 rounded border text-[11px] font-mono transition-colors ${
                  showContinuousLimit
                    ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300 font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Continuous T_cont
              </button>
              <button
                onClick={() => setShowPeakLimit(!showPeakLimit)}
                className={`px-2 py-1 rounded border text-[11px] font-mono transition-colors ${
                  showPeakLimit
                    ? 'bg-rose-950/60 border-rose-500 text-rose-300 font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Peak T_pk
              </button>
              <button
                onClick={() => setShowCycleMarkers(!showCycleMarkers)}
                className={`px-2 py-1 rounded border text-[11px] font-mono transition-colors ${
                  showCycleMarkers
                    ? 'bg-amber-950/60 border-amber-500 text-amber-300 font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Cycle Points
              </button>
            </div>
          </div>
        </div>

        {/* 5-Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Base Speed (n_b)</span>
            <div className="text-sm font-bold font-mono text-cyan-400 mt-0.5">
              {effMap.baseSpeedRpm} <span className="text-xs text-slate-500">rpm</span>
            </div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Max Overspeed (n_max)</span>
            <div className="text-sm font-bold font-mono text-white mt-0.5">
              {effMap.maxSpeedRpm} <span className="text-xs text-slate-500">rpm</span>
            </div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Rated Torque (T_n)</span>
            <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5">
              {effMap.ratedTorqueNm} <span className="text-xs text-slate-500">N·m</span>
            </div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Sweet Spot Island</span>
            <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
              {effMap.sweetSpotSpeedRpm} rpm <span className="text-xs text-slate-400">@ {effMap.sweetSpotTorqueNm} Nm</span>
            </div>
          </div>
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Weighted Cycle η</span>
            <div className="text-sm font-bold font-mono text-emerald-300 mt-0.5">
              {effMap.weightedCycleEfficiencyPct}%
            </div>
          </div>
        </div>

        {/* Map Visualization & Live Probe Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Main 2D Efficiency Map SVG */}
          <div className="lg:col-span-8 bg-slate-950/90 rounded-lg border border-slate-800/90 p-3 relative">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1.5">
                <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                <span>Click or hover anywhere inside envelope to probe operating point (n, T)</span>
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                Range: 0-{effMap.maxSpeedRpm} rpm × 0-{effMap.peakTorqueNm} N·m
              </span>
            </div>

            <svg
              viewBox={`0 0 ${mapWidth} ${mapHeight}`}
              className="w-full h-auto cursor-crosshair select-none"
              onClick={handleSvgClickOrMove}
              onMouseMove={(e) => {
                if (e.buttons === 1) handleSvgClickOrMove(e);
              }}
            >
              <defs>
                <pattern id="gridPattern" width="40" height="30" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 30" fill="none" stroke="#1e293b" strokeWidth="0.8" />
                </pattern>
              </defs>

              {/* Background Grid */}
              <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="#090d16" />
              <rect x={padding.left} y={padding.top} width={plotW} height={plotH} fill="url(#gridPattern)" />

              {/* Base Speed Vertical Guideline */}
              <line
                x1={toSvgX(effMap.baseSpeedRpm)}
                y1={padding.top}
                x2={toSvgX(effMap.baseSpeedRpm)}
                y2={padding.top + plotH}
                stroke="#06b6d4"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
              <text
                x={toSvgX(effMap.baseSpeedRpm) + 4}
                y={padding.top + 14}
                fill="#06b6d4"
                fontSize="9"
                fontFamily="monospace"
              >
                Base Speed: {effMap.baseSpeedRpm} rpm
              </text>

              {/* Efficiency Grid Heat Cells */}
              {effMap.gridPoints
                .filter((p) => p.isWithinPeakLimit)
                .map((pt, idx) => {
                  const cx = toSvgX(pt.speedRpm);
                  const cy = toSvgY(pt.torqueNm);
                  const band =
                    EFFICIENCY_CONTOUR_BANDS.find((b) => pt.efficiencyPct >= b.minEff && pt.efficiencyPct < b.maxEff) ??
                    EFFICIENCY_CONTOUR_BANDS[EFFICIENCY_CONTOUR_BANDS.length - 1];

                  return (
                    <circle
                      key={`grid-${idx}`}
                      cx={cx}
                      cy={cy}
                      r="4.2"
                      fill={band.color}
                      opacity={band.fillOpacity}
                      className="transition-all hover:scale-150 hover:opacity-100"
                    />
                  );
                })}

              {/* Sweet Spot Island Marker */}
              <circle
                cx={toSvgX(effMap.sweetSpotSpeedRpm)}
                cy={toSvgY(effMap.sweetSpotTorqueNm)}
                r="10"
                fill="none"
                stroke="#10b981"
                strokeWidth="1.8"
                strokeDasharray="2 2"
                className="animate-pulse"
              />
              <circle
                cx={toSvgX(effMap.sweetSpotSpeedRpm)}
                cy={toSvgY(effMap.sweetSpotTorqueNm)}
                r="3.5"
                fill="#10b981"
              />

              {/* Continuous Envelope Curve */}
              {showContinuousLimit && (
                <path
                  d={contPathD}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )}

              {/* Peak Overload Envelope Curve */}
              {showPeakLimit && (
                <path
                  d={peakPathD}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="2.0"
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                />
              )}

              {/* Drive Cycle Operating Points Overlaid */}
              {showCycleMarkers &&
                effMap.driveCyclePoints.map((dp) => {
                  const isSelected = selectedCyclePointId === dp.id;
                  const dx = toSvgX(dp.speedRpm);
                  const dy = toSvgY(dp.torqueNm);

                  return (
                    <g
                      key={dp.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCyclePointId(dp.id);
                        setProbedPoint({ speedRpm: dp.speedRpm, torqueNm: dp.torqueNm });
                      }}
                    >
                      <circle
                        cx={dx}
                        cy={dy}
                        r={isSelected ? 7 : 5}
                        fill={isSelected ? '#38bdf8' : '#f59e0b'}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text
                        x={dx + 7}
                        y={dy - 5}
                        fill="#f8fafc"
                        fontSize="9"
                        fontWeight="bold"
                        fontFamily="sans-serif"
                        className="drop-shadow"
                      >
                        {dp.name.split(' ')[0]} ({dp.efficiencyPct}%)
                      </text>
                    </g>
                  );
                })}

              {/* Interactive Crosshair Cursor */}
              {probedPoint && (
                <g>
                  <line
                    x1={toSvgX(probedPoint.speedRpm)}
                    y1={padding.top}
                    x2={toSvgX(probedPoint.speedRpm)}
                    y2={padding.top + plotH}
                    stroke="#ffffff"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    opacity="0.8"
                  />
                  <line
                    x1={padding.left}
                    y1={toSvgY(probedPoint.torqueNm)}
                    x2={padding.left + plotW}
                    y2={toSvgY(probedPoint.torqueNm)}
                    stroke="#ffffff"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    opacity="0.8"
                  />
                  <circle
                    cx={toSvgX(probedPoint.speedRpm)}
                    cy={toSvgY(probedPoint.torqueNm)}
                    r="5"
                    fill="#38bdf8"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                </g>
              )}

              {/* Axes and Tick Marks */}
              {/* Y Axis (Torque) */}
              <line
                x1={padding.left}
                y1={padding.top}
                x2={padding.left}
                y2={padding.top + plotH}
                stroke="#64748b"
                strokeWidth="1.2"
              />
              {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                const torqueVal = Math.round(frac * effMap.peakTorqueNm);
                const yPos = toSvgY(torqueVal);
                return (
                  <g key={`y-tick-${frac}`}>
                    <line x1={padding.left - 4} y1={yPos} x2={padding.left} y2={yPos} stroke="#94a3b8" />
                    <text
                      x={padding.left - 7}
                      y={yPos + 3}
                      fill="#94a3b8"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="end"
                    >
                      {torqueVal}
                    </text>
                  </g>
                );
              })}

              {/* X Axis (Speed) */}
              <line
                x1={padding.left}
                y1={padding.top + plotH}
                x2={padding.left + plotW}
                y2={padding.top + plotH}
                stroke="#64748b"
                strokeWidth="1.2"
              />
              {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
                const speedVal = Math.round(frac * effMap.maxSpeedRpm);
                const xPos = toSvgX(speedVal);
                return (
                  <g key={`x-tick-${frac}`}>
                    <line x1={xPos} y1={padding.top + plotH} x2={xPos} y2={padding.top + plotH + 4} stroke="#94a3b8" />
                    <text
                      x={xPos}
                      y={padding.top + plotH + 15}
                      fill="#94a3b8"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {speedVal}
                    </text>
                  </g>
                );
              })}

              {/* Axis Titles */}
              <text
                x={padding.left + plotW / 2}
                y={mapHeight - 8}
                fill="#cbd5e1"
                fontSize="10"
                fontFamily="sans-serif"
                fontWeight="600"
                textAnchor="middle"
              >
                Rotor Speed n [rpm]
              </text>
              <text
                transform="rotate(-90)"
                x={-(padding.top + plotH / 2)}
                y={18}
                fill="#cbd5e1"
                fontSize="10"
                fontFamily="sans-serif"
                fontWeight="600"
                textAnchor="middle"
              >
                Shaft Torque T [N·m]
              </text>
            </svg>

            {/* Contour Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
              <span className="font-semibold text-slate-300">Efficiency Bands:</span>
              <div className="flex flex-wrap items-center gap-2">
                {EFFICIENCY_CONTOUR_BANDS.map((band) => (
                  <div key={band.label} className="flex items-center gap-1 font-mono">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: band.color }} />
                    <span>{band.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Panel: Probed Point Inspector & Quick Table */}
          <div className="lg:col-span-4 space-y-3">
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Operating Point Probe</span>
                </span>
                {probedPoint && (
                  <button
                    onClick={() => {
                      setProbedPoint(null);
                      setSelectedCyclePointId(null);
                    }}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>

              {activeProbeDetails ? (
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2 bg-slate-900/90 rounded p-2 border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400">Speed (n)</span>
                      <div className="text-sm font-bold font-mono text-white">
                        {activeProbeDetails.speedRpm} <span className="text-xs text-slate-500">rpm</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Torque (T)</span>
                      <div className="text-sm font-bold font-mono text-cyan-300">
                        {activeProbeDetails.torqueNm} <span className="text-xs text-slate-500">N·m</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Mechanical Power</span>
                      <div className="text-sm font-bold font-mono text-amber-300">
                        {activeProbeDetails.powerKw} <span className="text-xs text-slate-500">kW</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Operating Efficiency</span>
                      <div className="text-sm font-bold font-mono text-emerald-400">
                        {activeProbeDetails.efficiencyPct}%
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1 text-[11px] font-mono">
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-400">Copper Loss (P_cu):</span>
                      <strong className="text-rose-400">{activeProbeDetails.copperLossW} W</strong>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-400">Iron Core Loss (P_fe):</span>
                      <strong className="text-indigo-300">{activeProbeDetails.ironLossW} W</strong>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-400">Mech Friction & Windage:</span>
                      <strong className="text-amber-400">{activeProbeDetails.mechLossW} W</strong>
                    </div>
                    <div className="flex justify-between text-slate-200 border-t border-slate-800 pt-1 font-semibold">
                      <span>Total Active Losses:</span>
                      <strong className="text-white">{activeProbeDetails.totalLossW} W</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs">
                  <p>Click or drag on the 2D map to inspect any speed-torque coordinate.</p>
                </div>
              )}
            </div>

            {/* Drive Cycle Summary Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <span className="text-xs font-bold text-white flex items-center justify-between">
                <span>Cycle Operating Points ({cycleStandard === 'iec_industrial' ? 'IEC 60034-1' : 'WLTP Class 3'})</span>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                  Avg: {effMap.weightedCycleEfficiencyPct}%
                </span>
              </span>

              <div className="space-y-1.5 max-h-[175px] overflow-y-auto pr-1">
                {effMap.driveCyclePoints.map((pt) => {
                  const isSelected = selectedCyclePointId === pt.id;
                  return (
                    <div
                      key={pt.id}
                      onClick={() => {
                        setSelectedCyclePointId(pt.id);
                        setProbedPoint({ speedRpm: pt.speedRpm, torqueNm: pt.torqueNm });
                      }}
                      className={`p-1.5 rounded border text-[11px] cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-cyan-950/70 border-cyan-500 text-cyan-200'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span className="truncate max-w-[170px]">{pt.name}</span>
                        <strong className="font-mono text-emerald-400">{pt.efficiencyPct}%</strong>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                        <span>
                          {pt.speedRpm} rpm · {pt.torqueNm} Nm
                        </span>
                        <span>Weight: {pt.timeWeightPct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: Dynamic Lumped-Parameter Transient Thermal Simulator */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-rose-400" />
              <h2 className="text-base font-bold text-white">
                Dynamic Transient Thermal Duty Simulator (4-Node LPTN)
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-mono border font-semibold ${
                  thermalSim.isInsulationExceeded
                    ? 'bg-rose-950/80 border-rose-700 text-rose-300 animate-pulse'
                    : thermalSim.windingThermalMarginDegC < 15
                    ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                    : 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                }`}
              >
                {thermalSim.isInsulationExceeded
                  ? 'TRIP: Insulation Exceeded'
                  : `Margin: +${thermalSim.windingThermalMarginDegC}°C (${thermalSim.insulationClass})`}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulates time-domain temperature evolution T(t) across Winding Hot-Spot, Teeth Core, Rotor, and Frame
              using differential heat balance equations.
            </p>
          </div>

          {/* Duty Cycle Presets & Ambient Control */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
              {DUTY_CYCLE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setThermalPresetId(p.id)}
                  className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                    thermalPresetId === p.id
                      ? 'bg-rose-600 text-white font-bold shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title={p.description}
                >
                  {p.code}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
              <span className="text-slate-400">Ambient:</span>
              <input
                type="number"
                min="10"
                max="65"
                value={ambientTempC}
                onChange={(e) => setAmbientTempC(Number(e.target.value) || 40)}
                className="w-12 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-center font-mono text-white text-xs"
              />
              <span className="text-slate-400">°C</span>
            </div>
          </div>
        </div>

        {/* 4-Node Thermal Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-rose-400" /> Winding Peak (T_1)
            </span>
            <div className="text-sm font-bold font-mono text-rose-400 mt-0.5">
              {thermalSim.maxWindingTempC}°C{' '}
              <span className="text-xs text-slate-500">/ {thermalSim.insulationLimitTempC}°C max</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-cyan-400" /> Stator Iron Peak (T_2)
            </span>
            <div className="text-sm font-bold font-mono text-cyan-300 mt-0.5">
              {thermalSim.maxStatorIronTempC}°C
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-indigo-400" /> Rotor Core Peak (T_3)
            </span>
            <div className="text-sm font-bold font-mono text-indigo-300 mt-0.5">
              {thermalSim.maxRotorTempC}°C
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-400" /> Thermal Time Constant
            </span>
            <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
              {(thermalSim.thermalTimeConstantSeconds / 60).toFixed(1)}{' '}
              <span className="text-xs text-slate-500">min (τ)</span>
            </div>
          </div>
        </div>

        {/* Transient Temperature vs Time SVG Chart */}
        <div className="bg-slate-950/90 rounded-lg border border-slate-800/90 p-3 relative">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold text-slate-300">
              {thermalSim.preset.name} ({thermalSim.preset.durationMinutes} min simulation)
            </span>
            {currentHoveredThermalPoint && (
              <span className="font-mono text-[11px] text-cyan-300">
                t = {currentHoveredThermalPoint.timeMinutes} min | Winding: {currentHoveredThermalPoint.windingTempC}°C |
                Loss: {currentHoveredThermalPoint.instantTotalLossW} W
              </span>
            )}
          </div>

          <svg
            viewBox={`0 0 ${thermW} ${thermH}`}
            className="w-full h-auto cursor-crosshair select-none"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const min = Math.max(0, Math.min(maxSimMinutes, ((x - tPad.left) / tPlotW) * maxSimMinutes));
              setHoveredTimeMinute(Number(min.toFixed(1)));
            }}
            onMouseLeave={() => setHoveredTimeMinute(null)}
          >
            {/* Background & Gridlines */}
            <rect x={tPad.left} y={tPad.top} width={tPlotW} height={tPlotH} fill="#090d16" />

            {/* Insulation Limit Line */}
            <line
              x1={tPad.left}
              y1={tToSvgY(thermalSim.insulationLimitTempC)}
              x2={tPad.left + tPlotW}
              y2={tToSvgY(thermalSim.insulationLimitTempC)}
              stroke="#ef4444"
              strokeWidth="1.8"
              strokeDasharray="4 3"
            />
            <text
              x={tPad.left + tPlotW - 6}
              y={tToSvgY(thermalSim.insulationLimitTempC) - 4}
              fill="#ef4444"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
              textAnchor="end"
            >
              {thermalSim.insulationClass} Limit ({thermalSim.insulationLimitTempC}°C)
            </text>

            {/* Temperature Curves */}
            {/* Housing */}
            <path d={housingCurveD} fill="none" stroke="#10b981" strokeWidth="1.8" />
            {/* Rotor */}
            <path d={rotorCurveD} fill="none" stroke="#6366f1" strokeWidth="1.8" strokeDasharray="3 2" />
            {/* Stator Iron */}
            <path d={statorIronCurveD} fill="none" stroke="#06b6d4" strokeWidth="2.0" />
            {/* Winding Hot Spot (Top Node) */}
            <path d={windingCurveD} fill="none" stroke="#f43f5e" strokeWidth="2.5" />

            {/* Hover Indicator Ray */}
            {hoveredTimeMinute !== null && (
              <line
                x1={tToSvgX(hoveredTimeMinute)}
                y1={tPad.top}
                x2={tToSvgX(hoveredTimeMinute)}
                y2={tPad.top + tPlotH}
                stroke="#ffffff"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.8"
              />
            )}

            {/* Y Axis (Temperature) */}
            <line x1={tPad.left} y1={tPad.top} x2={tPad.left} y2={tPad.top + tPlotH} stroke="#64748b" />
            {[minPlotTemp, 60, 100, thermalSim.insulationLimitTempC, maxPlotTemp].map((tVal) => {
              const yP = tToSvgY(tVal);
              return (
                <g key={`therm-y-${tVal}`}>
                  <line x1={tPad.left - 4} y1={yP} x2={tPad.left} y2={yP} stroke="#94a3b8" />
                  <text
                    x={tPad.left - 7}
                    y={yP + 3}
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {Math.round(tVal)}°C
                  </text>
                </g>
              );
            })}

            {/* X Axis (Time in Minutes) */}
            <line x1={tPad.left} y1={tPad.top + tPlotH} x2={tPad.left + tPlotW} y2={tPad.top + tPlotH} stroke="#64748b" />
            {[0, 0.25, 0.5, 0.75, 1.0].map((frac) => {
              const minVal = Math.round(frac * maxSimMinutes);
              const xP = tToSvgX(minVal);
              return (
                <g key={`therm-x-${minVal}`}>
                  <line x1={xP} y1={tPad.top + tPlotH} x2={xP} y2={tPad.top + tPlotH + 4} stroke="#94a3b8" />
                  <text
                    x={xP}
                    y={tPad.top + tPlotH + 14}
                    fill="#94a3b8"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {minVal}m
                  </text>
                </g>
              );
            })}

            {/* Axis Titles */}
            <text
              x={tPad.left + tPlotW / 2}
              y={thermH - 4}
              fill="#cbd5e1"
              fontSize="10"
              fontFamily="sans-serif"
              fontWeight="600"
              textAnchor="middle"
            >
              Time Elapsed t [minutes]
            </text>
            <text
              transform="rotate(-90)"
              x={-(tPad.top + tPlotH / 2)}
              y={16}
              fill="#cbd5e1"
              fontSize="10"
              fontFamily="sans-serif"
              fontWeight="600"
              textAnchor="middle"
            >
              Temperature [°C]
            </text>
          </svg>

          {/* Curve Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-400">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-3 h-1 bg-rose-500 rounded" /> Winding Hot Spot (T_1)
              </span>
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-3 h-1 bg-cyan-400 rounded" /> Stator Teeth Core (T_2)
              </span>
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-3 h-1 bg-indigo-500 rounded" /> Rotor Active Core (T_3)
              </span>
              <span className="flex items-center gap-1.5 font-mono">
                <span className="w-3 h-1 bg-emerald-500 rounded" /> Housing Frame (T_4)
              </span>
            </div>
            <div className="text-slate-400 text-[11px]">
              Equilibrium at 100% Load:{' '}
              <strong className="text-cyan-300 font-mono">{thermalSim.steadyStateWindingTempC}°C</strong>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: Active Material Mass, Volume & BOM Cost Engine */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-bold text-white">
                Active Material Mass, Volume & BOM Cost Synthesis
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-semibold">
                Total BOM: ${bomResult.totalBomCostUsd.toFixed(2)} USD
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Breakdown of physical mass (electrical steel, copper wire, NdFeB magnets, aluminum) with live unit pricing
              and volumetric power density.
            </p>
          </div>

          <button
            onClick={() => setUnitPrices(DEFAULT_UNIT_PRICES.default)}
            className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1 bg-slate-800 px-2.5 py-1 rounded border border-slate-700 transition-colors"
          >
            <RotateCcw className="w-3 h-3 text-cyan-400" /> Reset Default Market Prices
          </button>
        </div>

        {/* 5-Metric Economics & Densities Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Total Active Mass</span>
            <div className="text-sm font-bold font-mono text-cyan-400 mt-0.5">
              {bomResult.totalActiveMassKg} <span className="text-xs text-slate-500">kg</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Specific Torque Density</span>
            <div className="text-sm font-bold font-mono text-white mt-0.5">
              {bomResult.specificTorqueNm_kg} <span className="text-xs text-slate-500">N·m/kg</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Specific Power (Grav.)</span>
            <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
              {bomResult.specificPowerKw_kg} <span className="text-xs text-slate-500">kW/kg</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Volumetric Power (Vol.)</span>
            <div className="text-sm font-bold font-mono text-indigo-400 mt-0.5">
              {bomResult.volumetricPowerDensityKw_L} <span className="text-xs text-slate-500">kW/L</span>
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5">
            <span className="text-[11px] text-slate-400 font-medium">Specific Cost</span>
            <div className="text-sm font-bold font-mono text-amber-300 mt-0.5">
              ${bomResult.specificCostUsdPerKw.toFixed(1)} <span className="text-xs text-slate-500">/ kW</span>
            </div>
          </div>
        </div>

        {/* Pricing Inputs & Visual Mass vs Cost Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Unit Price Sliders */}
          <div className="lg:col-span-5 bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-3">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Configurable Unit Material Pricing</span>
            </span>

            <div className="space-y-2 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Copper Magnet Wire ($/kg):</span>
                  <span className="font-mono text-amber-400">${unitPrices.copperPricePerKg.toFixed(1)}/kg</span>
                </div>
                <input
                  type="range"
                  min="6.0"
                  max="25.0"
                  step="0.5"
                  value={unitPrices.copperPricePerKg}
                  onChange={(e) =>
                    setUnitPrices((prev) => ({ ...prev, copperPricePerKg: Number(e.target.value) }))
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-300 font-medium mb-1">
                  <span>Electrical Silicon Steel ($/kg):</span>
                  <span className="font-mono text-cyan-400">${unitPrices.steelPricePerKg.toFixed(1)}/kg</span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="10.0"
                  step="0.2"
                  value={unitPrices.steelPricePerKg}
                  onChange={(e) =>
                    setUnitPrices((prev) => ({ ...prev, steelPricePerKg: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-500"
                />
              </div>

              {specs.topology?.includes('pmsm') && (
                <div>
                  <div className="flex justify-between text-slate-300 font-medium mb-1">
                    <span>NdFeB Rare-Earth Magnets ($/kg):</span>
                    <span className="font-mono text-rose-400">${unitPrices.magnetPricePerKg.toFixed(1)}/kg</span>
                  </div>
                  <input
                    type="range"
                    min="30.0"
                    max="150.0"
                    step="2.0"
                    value={unitPrices.magnetPricePerKg}
                    onChange={(e) =>
                      setUnitPrices((prev) => ({ ...prev, magnetPricePerKg: Number(e.target.value) }))
                    }
                    className="w-full accent-rose-500"
                  />
                </div>
              )}

              {specs.topology === 'induction' && (
                <div>
                  <div className="flex justify-between text-slate-300 font-medium mb-1">
                    <span>Aluminum Rotor Cage ($/kg):</span>
                    <span className="font-mono text-slate-300">${unitPrices.aluminumPricePerKg.toFixed(1)}/kg</span>
                  </div>
                  <input
                    type="range"
                    min="2.0"
                    max="8.0"
                    step="0.2"
                    value={unitPrices.aluminumPricePerKg}
                    onChange={(e) =>
                      setUnitPrices((prev) => ({ ...prev, aluminumPricePerKg: Number(e.target.value) }))
                    }
                    className="w-full accent-slate-400"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mass vs Cost Proportional Stacked Bars & BOM Table */}
          <div className="lg:col-span-7 space-y-3">
            {/* Mass Share Bar */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-xs text-slate-300 font-medium">
                <span>Active Mass Distribution (Total: {bomResult.totalActiveMassKg} kg)</span>
              </div>
              <div className="h-5 rounded-lg overflow-hidden flex bg-slate-900 border border-slate-800">
                {bomResult.costBreakdown.map((item) => {
                  const colors: Record<string, string> = {
                    copper: 'bg-amber-500',
                    steel: 'bg-cyan-500',
                    magnet: 'bg-rose-500',
                    aluminum: 'bg-slate-400',
                    insulation: 'bg-emerald-500',
                  };
                  return (
                    <div
                      key={`mass-${item.id}`}
                      style={{ width: `${item.massSharePct}%` }}
                      className={`${colors[item.category] || 'bg-slate-600'} transition-all`}
                      title={`${item.name}: ${item.massKg} kg (${item.massSharePct}%)`}
                    />
                  );
                })}
              </div>

              {/* Cost Share Bar */}
              <div className="flex justify-between text-xs text-slate-300 font-medium pt-1">
                <span>Cost Contribution (Total: ${bomResult.totalBomCostUsd.toFixed(2)})</span>
              </div>
              <div className="h-5 rounded-lg overflow-hidden flex bg-slate-900 border border-slate-800">
                {bomResult.costBreakdown.map((item) => {
                  const colors: Record<string, string> = {
                    copper: 'bg-amber-500',
                    steel: 'bg-cyan-500',
                    magnet: 'bg-rose-500',
                    aluminum: 'bg-slate-400',
                    insulation: 'bg-emerald-500',
                  };
                  return (
                    <div
                      key={`cost-${item.id}`}
                      style={{ width: `${item.costSharePct}%` }}
                      className={`${colors[item.category] || 'bg-slate-600'} transition-all`}
                      title={`${item.name}: $${item.costUsd.toFixed(2)} (${item.costSharePct}%)`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Itemized Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Component</th>
                    <th className="px-3 py-2">Mass</th>
                    <th className="px-3 py-2">Rate</th>
                    <th className="px-3 py-2">Cost</th>
                    <th className="px-3 py-2">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-300">
                  {bomResult.costBreakdown.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/50">
                      <td className="px-3 py-1.5 font-sans font-medium text-white">{item.name}</td>
                      <td className="px-3 py-1.5">{item.massKg} kg</td>
                      <td className="px-3 py-1.5 text-slate-400">${item.unitPricePerKg}/kg</td>
                      <td className="px-3 py-1.5 text-emerald-400 font-semibold">${item.costUsd.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-slate-400">{item.costSharePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
