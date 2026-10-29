/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MotorSpecs, CalculatedGeometry } from '../types/motor';
import {
  Sliders,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  BookOpen,
} from 'lucide-react';

interface GeometrySpreadsheetProps {
  specs: MotorSpecs;
  geom: CalculatedGeometry;
  onUpdateSpecs: (updated: Partial<MotorSpecs>) => void;
  onResetToDefault: () => void;
}

export const GeometrySpreadsheet: React.FC<GeometrySpreadsheetProps> = ({
  specs,
  geom,
  onUpdateSpecs,
  onResetToDefault,
}) => {
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'primary' | 'loadings' | 'stator' | 'rotor' | 'losses'
  >('all');

  return (
    <div className="space-y-5">
      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-2 rounded-xl">
        <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeCategory === 'all'
                ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Parameters
          </button>
          <button
            onClick={() => setActiveCategory('primary')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeCategory === 'primary'
                ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            1. Primary Ratings
          </button>
          <button
            onClick={() => setActiveCategory('loadings')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeCategory === 'loadings'
                ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            2. D²L Loadings
          </button>
          <button
            onClick={() => setActiveCategory('stator')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeCategory === 'stator'
                ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            3. Stator Core & Slots
          </button>
          <button
            onClick={() => setActiveCategory('rotor')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeCategory === 'rotor'
                ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            4. Rotor & Airgap
          </button>
          <button
            onClick={() => setActiveCategory('losses')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
              activeCategory === 'losses'
                ? 'bg-slate-800 text-cyan-400 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            5. Losses & Efficiency
          </button>
        </div>

        <button
          onClick={onResetToDefault}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Preset</span>
        </button>
      </div>

      {/* Interactive Sensitivity Sliders Strip for Fast Exploration */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          Real-Time D²L Sizing Sensitivity Controls
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Specific Magnetic Loading Bav */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Magnetic Loading (Bav):</span>
              <strong className="text-cyan-400">{specs.specificMagneticLoading} T</strong>
            </div>
            <input
              type="range"
              min="0.38"
              max="0.75"
              step="0.01"
              value={specs.specificMagneticLoading}
              onChange={(e) => onUpdateSpecs({ specificMagneticLoading: Number(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.38 T (Cool)</span>
              <span>0.75 T (Heavy Saturation)</span>
            </div>
          </div>

          {/* Specific Electric Loading ac */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Electric Loading (ac):</span>
              <strong className="text-cyan-400">{specs.specificElectricLoading.toLocaleString()} A/m</strong>
            </div>
            <input
              type="range"
              min="16000"
              max="52000"
              step="500"
              value={specs.specificElectricLoading}
              onChange={(e) => onUpdateSpecs({ specificElectricLoading: Number(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>16,000 A/m</span>
              <span>52,000 A/m</span>
            </div>
          </div>

          {/* Aspect Ratio L/tau */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Core Aspect Ratio (λ = L/τ):</span>
              <strong className="text-cyan-400">{specs.aspectRatio}</strong>
            </div>
            <input
              type="range"
              min="0.65"
              max="2.4"
              step="0.05"
              value={specs.aspectRatio}
              onChange={(e) => onUpdateSpecs({ aspectRatio: Number(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.65 (Pancake/Short)</span>
              <span>2.4 (Elongated)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sizing Sheet Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono border-collapse">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[11px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Parameter Name</th>
                <th className="py-2.5 px-3 font-semibold">Symbol</th>
                <th className="py-2.5 px-4 font-semibold text-right">Value</th>
                <th className="py-2.5 px-3 font-semibold">Unit</th>
                <th className="py-2.5 px-4 font-semibold">Classical Formulation & Standard Cite</th>
                <th className="py-2.5 px-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-200">
              {/* SECTION 1: PRIMARY RATINGS */}
              {(activeCategory === 'all' || activeCategory === 'primary') && (
                <>
                  <tr className="bg-slate-950/60 text-cyan-400 font-sans font-bold text-xs">
                    <td colSpan={6} className="py-2 px-4">
                      1. PRIMARY OPERATIONAL REQUIREMENTS & RATINGS
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Rated Output Power
                    </td>
                    <td className="py-2 px-3 text-slate-400">Pn</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={specs.powerKw}
                        onChange={(e) => onUpdateSpecs({ powerKw: Number(e.target.value) })}
                        className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-right font-mono text-white focus:outline-none focus:border-cyan-500"
                      />
                    </td>
                    <td className="py-2 px-3 text-slate-400">kW</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Required shaft mechanical output (IEC 60034-1)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Rated Supply Voltage (line-to-line)
                    </td>
                    <td className="py-2 px-3 text-slate-400">Vn</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={specs.voltageV}
                        onChange={(e) => onUpdateSpecs({ voltageV: Number(e.target.value) })}
                        className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-right font-mono text-white focus:outline-none focus:border-cyan-500"
                      />
                    </td>
                    <td className="py-2 px-3 text-slate-400">V</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Supply grid / inverter rms line voltage
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Base Supply Frequency
                    </td>
                    <td className="py-2 px-3 text-slate-400">f</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        value={specs.frequencyHz}
                        onChange={(e) => onUpdateSpecs({ frequencyHz: Number(e.target.value) })}
                        className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-right font-mono text-white focus:outline-none focus:border-cyan-500"
                      />
                    </td>
                    <td className="py-2 px-3 text-slate-400">Hz</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Electrical fundamental frequency
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Armature Magnetic Poles
                    </td>
                    <td className="py-2 px-3 text-slate-400">2p</td>
                    <td className="py-2 px-4 text-right">
                      <select
                        value={specs.poles}
                        onChange={(e) => onUpdateSpecs({ poles: Number(e.target.value) })}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 font-mono text-white text-right focus:outline-none focus:border-cyan-500"
                      >
                        {[2, 4, 6, 8, 10, 12].map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-slate-400">-</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Determines ns = 120 * f / 2p (Sawhney Eq. 3.2)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Target Efficiency Assumption
                    </td>
                    <td className="py-2 px-3 text-slate-400">η_est</td>
                    <td className="py-2 px-4 text-right">
                      <input
                        type="number"
                        step="0.1"
                        value={specs.targetEfficiency}
                        onChange={(e) => onUpdateSpecs({ targetEfficiency: Number(e.target.value) })}
                        className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-right font-mono text-white focus:outline-none focus:border-cyan-500"
                      />
                    </td>
                    <td className="py-2 px-3 text-slate-400">%</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Initial assumption for apparent power sizing S (kVA)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>
                </>
              )}

              {/* SECTION 2: D²L SIZING LOADINGS */}
              {(activeCategory === 'all' || activeCategory === 'loadings') && (
                <>
                  <tr className="bg-slate-950/60 text-cyan-400 font-sans font-bold text-xs">
                    <td colSpan={6} className="py-2 px-4">
                      2. D²L OUTPUT EQUATION & SPECIFIC LOADINGS
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Output Sizing Coefficient
                    </td>
                    <td className="py-2 px-3 text-slate-400">C0</td>
                    <td className="py-2 px-4 text-right font-bold text-cyan-400">
                      {geom.outputCoefficientC0}
                    </td>
                    <td className="py-2 px-3 text-slate-400">kVA/(m³·rpm)</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      C0 = 11 · kw · Bav · ac · 10⁻³ (Sawhney Ch. 4, Pyrhönen Eq. 6.4)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Core Active Volume Factor
                    </td>
                    <td className="py-2 px-3 text-slate-400">D²L</td>
                    <td className="py-2 px-4 text-right font-bold text-white">
                      {(
                        Math.pow(geom.statorBoreDiameterMm * 1e-3, 2) *
                        (geom.coreLengthMm * 1e-3)
                      ).toFixed(6)}
                    </td>
                    <td className="py-2 px-3 text-slate-400">m³</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      D²L = S / (C0 · ns) [Classical D²L Output Equation]
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Stator Bore Diameter
                    </td>
                    <td className="py-2 px-3 text-slate-400">D</td>
                    <td className="py-2 px-4 text-right font-bold text-cyan-300">
                      {geom.statorBoreDiameterMm}
                    </td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      D = ∛( (D²L · 2p) / (π · λ) )
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Active Core Stack Length
                    </td>
                    <td className="py-2 px-3 text-slate-400">L</td>
                    <td className="py-2 px-4 text-right font-bold text-cyan-300">
                      {geom.coreLengthMm}
                    </td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      L = λ · τ = λ · (π · D / 2p)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Pole Pitch Length
                    </td>
                    <td className="py-2 px-3 text-slate-400">τ</td>
                    <td className="py-2 px-4 text-right">{geom.polePitchMm}</td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      τ = π · D / 2p
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>
                </>
              )}

              {/* SECTION 3: STATOR CORE & SLOTS */}
              {(activeCategory === 'all' || activeCategory === 'stator') && (
                <>
                  <tr className="bg-slate-950/60 text-cyan-400 font-sans font-bold text-xs">
                    <td colSpan={6} className="py-2 px-4">
                      3. STATOR SLOTTED LAMINATION & TOOTH SIZING
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Total Stator Punching Slots
                    </td>
                    <td className="py-2 px-3 text-slate-400">Qs</td>
                    <td className="py-2 px-4 text-right">
                      <select
                        value={specs.statorSlots}
                        onChange={(e) => onUpdateSpecs({ statorSlots: Number(e.target.value) })}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 font-mono text-white text-right focus:outline-none focus:border-cyan-500"
                      >
                        {[18, 24, 36, 48, 54, 72].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 px-3 text-slate-400">-</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Slot count Qs determines slot pitch τs = π · D / Qs
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Stator Tooth Width
                    </td>
                    <td className="py-2 px-3 text-slate-400">bts</td>
                    <td className="py-2 px-4 text-right font-bold">{geom.toothWidthMm}</td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      bts = (Bav · τs) / (Bts · kfe)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Tooth Flux Density Check
                    </td>
                    <td className="py-2 px-3 text-slate-400">Bts</td>
                    <td
                      className={`py-2 px-4 text-right font-bold ${
                        geom.toothFluxDensityTesla > 1.8 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {geom.toothFluxDensityTesla}
                    </td>
                    <td className="py-2 px-3 text-slate-400">T</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Must stay below knee saturation threshold (&lt; 1.80 T)
                    </td>
                    <td className="py-2 px-3 text-center">
                      {geom.toothFluxDensityTesla > 1.8 ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mx-auto" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                      )}
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Total Slot Depth
                    </td>
                    <td className="py-2 px-3 text-slate-400">hs</td>
                    <td className="py-2 px-4 text-right font-bold">{geom.slotDepthMm}</td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Slot area requirement based on copper area and fill factor
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Slot Copper Fill Factor
                    </td>
                    <td className="py-2 px-3 text-slate-400">kfill</td>
                    <td
                      className={`py-2 px-4 text-right font-bold ${
                        geom.actualSlotFillFactor > 0.44 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {geom.actualSlotFillFactor}
                    </td>
                    <td className="py-2 px-3 text-slate-400">-</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Acu / Aslot (Industrial manufacturability limit ≤ 0.44)
                    </td>
                    <td className="py-2 px-3 text-center">
                      {geom.actualSlotFillFactor > 0.44 ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mx-auto" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                      )}
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Stator Back-Iron (Yoke) Depth
                    </td>
                    <td className="py-2 px-3 text-slate-400">hys</td>
                    <td className="py-2 px-4 text-right font-bold">{geom.statorYokeDepthMm}</td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      hys = (Φ / 2) / (Bys · L · kfe)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Stator Outer Frame Diameter
                    </td>
                    <td className="py-2 px-3 text-slate-400">Do</td>
                    <td className="py-2 px-4 text-right font-bold text-cyan-300">
                      {geom.statorOuterDiameterMm}
                    </td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Do = D + 2 · hs + 2 · hys
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>
                </>
              )}

              {/* SECTION 4: ROTOR & AIRGAP */}
              {(activeCategory === 'all' || activeCategory === 'rotor') && (
                <>
                  <tr className="bg-slate-950/60 text-cyan-400 font-sans font-bold text-xs">
                    <td colSpan={6} className="py-2 px-4">
                      4. ROTOR GEOMETRY & AIRGAP COEFFICIENTS
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Mechanical Airgap Clearance
                    </td>
                    <td className="py-2 px-3 text-slate-400">g</td>
                    <td className="py-2 px-4 text-right font-bold text-cyan-400">
                      {geom.airgapLengthMm}
                    </td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Empirical standard clearance (Sawhney Eq. 7.14)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Carter Airgap Expansion Coefficient
                    </td>
                    <td className="py-2 px-3 text-slate-400">kc</td>
                    <td className="py-2 px-4 text-right">{geom.carterCoefficient}</td>
                    <td className="py-2 px-3 text-slate-400">-</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Fringing factor ge = kc · g (F. W. Carter, 1926)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Rotor Outer Diameter
                    </td>
                    <td className="py-2 px-3 text-slate-400">Dr</td>
                    <td className="py-2 px-4 text-right">{geom.rotorOuterDiameterMm}</td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Dr = D - 2 · g
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Shaft Diameter Sizing
                    </td>
                    <td className="py-2 px-3 text-slate-400">Dsh</td>
                    <td className="py-2 px-4 text-right">{geom.shaftDiameterMm}</td>
                    <td className="py-2 px-3 text-slate-400">mm</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Dsh ≈ 0.26 · D (Torsional shear capacity)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  {/* Topology-Specific Rotor Entries */}
                  {specs.topology === 'induction' && (
                    <tr className="hover:bg-slate-800/40">
                      <td className="py-2 px-4 font-sans font-medium text-slate-300">
                        Induction Rotor Slots
                      </td>
                      <td className="py-2 px-3 text-slate-400">Qr</td>
                      <td className="py-2 px-4 text-right">{specs.rotorSlots ?? 28}</td>
                      <td className="py-2 px-3 text-slate-400">-</td>
                      <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                        Chosen to prevent cogging harmonic torques (Qr ≠ Qs ± 2p)
                      </td>
                      <td className="py-2 px-3 text-center text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                      </td>
                    </tr>
                  )}

                  {(specs.topology === 'pmsm_spm' || specs.topology === 'pmsm_ipm') && (
                    <tr className="hover:bg-slate-800/40">
                      <td className="py-2 px-4 font-sans font-medium text-slate-300">
                        Permanent Magnet Thickness
                      </td>
                      <td className="py-2 px-3 text-slate-400">hm</td>
                      <td className="py-2 px-4 text-right">{geom.magnetThicknessActualMm}</td>
                      <td className="py-2 px-3 text-slate-400">mm</td>
                      <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                        Demagnetization safety against 3x rated peak In
                      </td>
                      <td className="py-2 px-3 text-center text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                      </td>
                    </tr>
                  )}

                  {specs.topology === 'vernier_pm' && (
                    <tr className="hover:bg-slate-800/40">
                      <td className="py-2 px-4 font-sans font-medium text-slate-300">
                        Vernier Magnetic Gear Ratio
                      </td>
                      <td className="py-2 px-3 text-slate-400">Gr</td>
                      <td className="py-2 px-4 text-right font-bold text-cyan-400">
                        {geom.vernierGearRatio}
                      </td>
                      <td className="py-2 px-3 text-slate-400">-</td>
                      <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                        Gr = pr / ps = ({geom.rotorPolesPr} / 2) / ({specs.poles} / 2)
                      </td>
                      <td className="py-2 px-3 text-center text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                      </td>
                    </tr>
                  )}
                </>
              )}

              {/* SECTION 5: LOSSES & EFFICIENCY */}
              {(activeCategory === 'all' || activeCategory === 'losses') && (
                <>
                  <tr className="bg-slate-950/60 text-cyan-400 font-sans font-bold text-xs">
                    <td colSpan={6} className="py-2 px-4">
                      5. ACTIVE LOSS BALANCE & OPERATING EFFICIENCY
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Stator Copper Loss (Total Pcu_s)
                    </td>
                    <td className="py-2 px-3 text-slate-400">Pcu_s</td>
                    <td className="py-2 px-4 text-right font-bold text-rose-400">
                      {geom.statorCopperLossW}
                    </td>
                    <td className="py-2 px-3 text-slate-400">W</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      DC: {geom.statorCopperLossDcW} W, AC Skin/Prox: {geom.statorCopperLossAcW} W (kac = {geom.acResistanceFactorKac} at {specs.frequencyHz} Hz, {geom.copperTemperatureC}°C)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Stator Core Iron Loss (Total Pfe)
                    </td>
                    <td className="py-2 px-3 text-slate-400">Pfe</td>
                    <td className="py-2 px-4 text-right font-bold text-blue-400">
                      {geom.ironCoreLossW}
                    </td>
                    <td className="py-2 px-3 text-slate-400">W</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Hysteresis: {geom.ironCoreHysteresisLossW} W, Eddy-Current: {geom.ironCoreEddyLossW} W (p_fe0 = {geom.specificIronLossW_kg} W/kg)
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40">
                    <td className="py-2 px-4 font-sans font-medium text-slate-300">
                      Total Machine Losses
                    </td>
                    <td className="py-2 px-3 text-slate-400">Ploss</td>
                    <td className="py-2 px-4 text-right font-bold text-rose-300">
                      {geom.totalLossW}
                    </td>
                    <td className="py-2 px-3 text-slate-400">W</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">
                      Ploss = Pcu_s + Pcu_r + Pfe + Pmw + Pstray
                    </td>
                    <td className="py-2 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 mx-auto" />
                    </td>
                  </tr>

                  <tr className="hover:bg-slate-800/40 bg-emerald-950/20">
                    <td className="py-2.5 px-4 font-sans font-bold text-emerald-400">
                      Calculated Active Efficiency
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400">η</td>
                    <td className="py-2.5 px-4 text-right font-bold text-base text-emerald-400">
                      {geom.calculatedEfficiency}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-emerald-400">%</td>
                    <td className="py-2.5 px-4 text-slate-300 font-sans text-[11px]">
                      η = Pn / (Pn + Ploss) · 100% (Target: {specs.targetEfficiency}%)
                    </td>
                    <td className="py-2.5 px-3 text-center text-emerald-400">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
