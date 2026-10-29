/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MotorSpecs, CalculatedGeometry } from '../types/motor';
import {
  calculateWindingFactors,
  generateSlotAllocations,
  calculateWindingFunctionWaveform,
} from '../utils/windingFunction';
import { Layers, Activity, Sliders, Info, ShieldCheck } from 'lucide-react';

interface WindingAnalysisViewProps {
  specs: MotorSpecs;
  geom: CalculatedGeometry;
  onUpdateCoilPitch: (pitch: number) => void;
}

export const WindingAnalysisView: React.FC<WindingAnalysisViewProps> = ({
  specs,
  geom,
  onUpdateCoilPitch,
}) => {
  const [selectedPhase, setSelectedPhase] = useState<'A' | 'B' | 'C'>('A');

  const { q, gammaDeg, kd1, kp1, kw1, harmonics, thdPct } = calculateWindingFactors(
    specs.statorSlots,
    specs.poles,
    specs.coilPitchSlots,
    specs.phases
  );

  const allocations = generateSlotAllocations(
    specs.statorSlots,
    specs.poles,
    specs.coilPitchSlots,
    specs.phases
  );

  const waveformPoints = calculateWindingFunctionWaveform(allocations, specs.poles, kw1, 180);

  const polePitchSlots = specs.statorSlots / specs.poles;
  const chordingRatio = (specs.coilPitchSlots / polePitchSlots).toFixed(2);

  // Phase color mapping
  const getPhaseColor = (phase: 'A' | 'B' | 'C') => {
    switch (phase) {
      case 'A':
        return '#EF4444';
      case 'B':
        return '#3B82F6';
      case 'C':
        return '#F59E0B';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Parameter Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 font-medium">Slots/Pole/Phase (q)</span>
          <div className="text-lg font-bold font-mono text-cyan-400">{q}</div>
          <span className="text-[10px] text-slate-500 font-mono">
            {Number.isInteger(q) ? 'Integer-slot' : 'Fractional-slot'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 font-medium">Slot Elec Angle (γ)</span>
          <div className="text-lg font-bold font-mono text-white">{gammaDeg}°</div>
          <span className="text-[10px] text-slate-500 font-mono">per slot pitch</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 font-medium">Distribution Factor (kd)</span>
          <div className="text-lg font-bold font-mono text-white">{kd1}</div>
          <span className="text-[10px] text-slate-500 font-mono">Slot grouping</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 font-medium">Pitch Factor (kp)</span>
          <div className="text-lg font-bold font-mono text-white">{kp1}</div>
          <span className="text-[10px] text-slate-500 font-mono">Chording ratio: {chordingRatio}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 font-medium">Winding Factor (kw1)</span>
          <div className="text-lg font-bold font-mono text-emerald-400">{kw1}</div>
          <span className="text-[10px] text-slate-500 font-mono">Fundamental coupling</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <span className="text-[11px] text-slate-400 font-medium">MMF Harmonic THD</span>
          <div className="text-lg font-bold font-mono text-amber-400">{thdPct}%</div>
          <span className="text-[10px] text-slate-500 font-mono">Total distortion</span>
        </div>
      </div>

      {/* Interactive Coil Pitch Optimizer Slider */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-cyan-400 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-white">Coil Chording Pitch Tuning (ys)</h4>
            <p className="text-xs text-slate-400">
              Short-pitching reduces low-order 5th and 7th spatial harmonics to minimize torque ripple and losses.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-300 whitespace-nowrap">
            Span: <strong className="text-cyan-400 font-bold">{specs.coilPitchSlots}</strong> / {polePitchSlots} slots
          </span>
          <input
            type="range"
            min={Math.max(1, Math.floor(polePitchSlots * 0.5))}
            max={Math.ceil(polePitchSlots)}
            value={specs.coilPitchSlots}
            onChange={(e) => onUpdateCoilPitch(Number(e.target.value))}
            className="w-36 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>
      </div>

      {/* Spatial Winding Function Waveform Graph */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Spatial Winding Function Distribution M_A(θ)
            </h3>
            <p className="text-xs text-slate-400">
              True conductor turn distribution step waveform along the air gap periphery over 360 electrical degrees.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-3 h-0.5 bg-cyan-400 inline-block rounded"></span>
              Discrete Winding Function M_A(θ)
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-3 h-0.5 bg-amber-400 border-dashed inline-block rounded"></span>
              Fundamental Sinusoid M_1(θ)
            </span>
          </div>
        </div>

        {/* SVG Waveform Plot */}
        <div className="h-64 w-full bg-slate-950 rounded-lg p-2 border border-slate-800/80">
          <svg viewBox="0 0 720 220" className="w-full h-full">
            <defs>
              <linearGradient id="waveFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid Lines */}
            <line x1="40" y1="30" x2="680" y2="30" stroke="#1e293b" strokeDasharray="3 3" />
            <line x1="40" y1="110" x2="680" y2="110" stroke="#334155" strokeWidth="1" /> {/* Zero axis */}
            <line x1="40" y1="190" x2="680" y2="190" stroke="#1e293b" strokeDasharray="3 3" />

            {/* Vertical angle markers */}
            {[0, 60, 120, 180, 240, 300, 360].map((deg) => {
              const x = 40 + (deg / 360) * 640;
              return (
                <g key={deg}>
                  <line x1={x} y1="20" x2={x} y2="200" stroke="#1e293b" strokeDasharray="2 2" />
                  <text
                    x={x}
                    y="214"
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="monospace"
                    textAnchor="middle"
                  >
                    {deg}°
                  </text>
                </g>
              );
            })}

            {/* Y Axis Labels */}
            <text x="32" y="34" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">
              +1.0
            </text>
            <text x="32" y="114" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">
              0.0
            </text>
            <text x="32" y="194" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="end">
              -1.0
            </text>

            {/* Fundamental Wave (Amber) */}
            <path
              d={waveformPoints.reduce((path, pt, idx) => {
                const x = 40 + (pt.electricalDegree / 360) * 640;
                const y = 110 - pt.fundamentalA * 80;
                return idx === 0 ? `M ${x} ${y}` : `${path} L ${x} ${y}`;
              }, '')}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity={0.85}
            />

            {/* Actual Step Winding Function (Cyan) */}
            <path
              d={waveformPoints.reduce((path, pt, idx) => {
                const x = 40 + (pt.electricalDegree / 360) * 640;
                const y = 110 - pt.windingFunctionA * 80;
                return idx === 0 ? `M ${x} ${y}` : `${path} L ${x} ${y}`;
              }, '')}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2.2"
            />
          </svg>
        </div>
      </div>

      {/* 2-Column Section: Harmonic Spectrum & Slot Allocation Diagram */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Harmonic Spectrum Bar Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            MMF Spatial Harmonic Spectrum
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Relative harmonic magnitude (kw_ν / ν) compared to the fundamental (ν = 1).
          </p>

          <div className="space-y-2">
            {harmonics.slice(0, 8).map((h) => {
              const isFund = h.order === 1;
              const barWidth = Math.min(100, isFund ? 100 : h.relativeAmplitudePct * 4);

              return (
                <div key={h.order} className="flex items-center gap-3 text-xs font-mono">
                  <span className={`w-8 font-bold ${isFund ? 'text-cyan-400' : 'text-slate-400'}`}>
                    ν={h.order}
                  </span>

                  <div className="flex-1 bg-slate-950 h-5 rounded overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className={`h-full rounded transition-all duration-300 ${
                        isFund
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                          : h.relativeAmplitudePct > 10
                          ? 'bg-amber-500'
                          : 'bg-slate-600'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  <span className="w-16 text-right font-medium text-slate-300">
                    {h.relativeAmplitudePct}%
                  </span>

                  <span className="w-16 text-right text-slate-500 text-[11px]">
                    kw={h.kw}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unwrapped Slot Allocation Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
          <h3 className="text-sm font-semibold text-white mb-1">
            Double-Layer Slot Coil Allocation (1 ... {specs.statorSlots})
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Phase assignment and polarity for each slot's top and bottom conductor layers.
          </p>

          <div className="flex-1 overflow-x-auto max-h-72 border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/80 sticky top-0 text-[11px] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-2.5">Slot #</th>
                  <th className="py-2 px-2">Angle</th>
                  <th className="py-2 px-2">Top Layer</th>
                  <th className="py-2 px-2">Bottom Layer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {allocations.map((a) => (
                  <tr key={a.slotNumber} className="hover:bg-slate-800/40">
                    <td className="py-1.5 px-2.5 font-bold text-white">#{a.slotNumber}</td>
                    <td className="py-1.5 px-2 text-slate-400">{a.slotMechanicalAngleDeg}°</td>
                    <td className="py-1.5 px-2">
                      <span
                        className="inline-flex items-center gap-1 font-semibold"
                        style={{ color: getPhaseColor(a.topLayerPhase) }}
                      >
                        {a.topLayerPolarity > 0 ? '+' : '-'}Phase {a.topLayerPhase}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <span
                        className="inline-flex items-center gap-1 font-semibold"
                        style={{ color: getPhaseColor(a.bottomLayerPhase) }}
                      >
                        {a.bottomLayerPolarity > 0 ? '+' : '-'}Phase {a.bottomLayerPhase}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
