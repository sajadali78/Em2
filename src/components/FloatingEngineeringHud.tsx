/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MotorSpecs, CalculatedGeometry, MaterialLimitsConfig } from '../types/motor';
import {
  convertLength,
  convertForce,
  convertTorque,
  convertDensity,
  convertPower,
  convertElectricLoading,
  convertCurrentDensity,
  convertFluxDensity,
  MATERIAL_DENSITY_PRESETS,
  AWG_WIRE_TABLE,
  LengthUnit,
  ForceUnit,
  TorqueUnit,
  DensityUnit,
  PowerUnit,
  ElectricLoadingUnit,
  CurrentDensityUnit,
  FluxDensityUnit,
} from '../utils/unitConversions';
import {
  Calculator,
  X,
  Minimize2,
  Maximize2,
  ArrowRightLeft,
  Scale,
  Compass,
  Zap,
  Magnet,
  Layers,
  Thermometer,
  ShieldAlert,
  Check,
  RotateCcw,
  Copy,
  SlidersHorizontal,
  Flame,
  Activity,
  ChevronRight,
  Bookmark,
  History,
} from 'lucide-react';

interface DesignSnapshot {
  id: string;
  timestamp: string;
  name: string;
  specs: MotorSpecs;
  geom: CalculatedGeometry;
}

interface FloatingEngineeringHudProps {
  specs: MotorSpecs;
  geom: CalculatedGeometry;
  onUpdateSpecs: (updated: Partial<MotorSpecs>) => void;
  materialConfig: MaterialLimitsConfig;
}

export const FloatingEngineeringHud: React.FC<FloatingEngineeringHudProps> = ({
  specs,
  geom,
  onUpdateSpecs,
  materialConfig,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'converter' | 'wire' | 'maxwell' | 'thermal' | 'snapshots'>('converter');

  // Length conversion states
  const [lenVal, setLenVal] = useState<number>(geom.statorBoreDiameterMm || 150);
  const [lenFrom, setLenFrom] = useState<LengthUnit>('mm');
  const [lenTo, setLenTo] = useState<LengthUnit>('in');

  // Force / Torque conversion states
  const [torqueVal, setTorqueVal] = useState<number>(geom.ratedTorqueNm || 100);
  const [torqueFrom, setTorqueFrom] = useState<TorqueUnit>('Nm');
  const [torqueTo, setTorqueTo] = useState<TorqueUnit>('lbf_ft');

  // Density conversion states
  const [densityVal, setDensityVal] = useState<number>(7650);
  const [densityFrom, setDensityFrom] = useState<DensityUnit>('kg_m3');
  const [densityTo, setDensityTo] = useState<DensityUnit>('lb_in3');

  // Power conversion states
  const [powerVal, setPowerVal] = useState<number>(specs.powerKw || 15);
  const [powerFrom, setPowerFrom] = useState<PowerUnit>('kW');
  const [powerTo, setPowerTo] = useState<PowerUnit>('HP');

  // Wire Sizing State
  const [selectedAwg, setSelectedAwg] = useState<number>(18);
  const [parallelStrands, setParallelStrands] = useState<number>(2);

  // Design Snapshots State
  const [snapshots, setSnapshots] = useState<DesignSnapshot[]>([]);
  const [justAppliedTarget, setJustAppliedTarget] = useState<string | null>(null);

  // Trigger feedback
  const triggerAppliedFeedback = (targetName: string) => {
    setJustAppliedTarget(targetName);
    setTimeout(() => setJustAppliedTarget(null), 2000);
  };

  // 1. Length conversions
  const convertedLength = convertLength(lenVal, lenFrom, lenTo);

  // 2. Torque conversions
  const convertedTorque = convertTorque(torqueVal, torqueFrom, torqueTo);

  // 3. Density conversions
  const convertedDensity = convertDensity(densityVal, densityFrom, densityTo);

  // 4. Power conversions
  const convertedPower = convertPower(powerVal, powerFrom, powerTo);

  // 5. Wire calculation
  const wireEntry = AWG_WIRE_TABLE.find((w) => w.awg === selectedAwg) ?? AWG_WIRE_TABLE[5];
  const totalCopperAreaPerSlot = wireEntry.copperAreaMm2 * parallelStrands * geom.conductorsPerSlot;
  const wireSlotFill = Number((totalCopperAreaPerSlot / Math.max(1, geom.slotAreaMm2)).toFixed(3));

  // 6. Maxwell Stress & UMP
  // sigma = B^2 / (2 * mu_0) [Pa]. mu_0 = 4*pi*1e-7
  const mu0 = 4 * Math.PI * 1e-7;
  const peakAirgapB = specs.specificMagneticLoading * 1.57; // Peak of sinusoidal Bav
  const maxwellStressKPa = Number(((Math.pow(peakAirgapB, 2) / (2 * mu0)) / 1000).toFixed(1));
  const maxwellStressPsi = Number((maxwellStressKPa * 0.145038).toFixed(1));
  // 10% dynamic rotor eccentricity UMP: F_ump ~ (pi * D * L / (2*mu0)) * B^2 * (eccentricity / g)
  const D_m = geom.statorBoreDiameterMm / 1000;
  const L_m = geom.coreLengthMm / 1000;
  const eccentricityRatio = 0.10; // 10% deflection
  const umpForceN = Math.round(((Math.PI * D_m * L_m) / (2 * mu0)) * Math.pow(specs.specificMagneticLoading, 2) * eccentricityRatio);
  const umpForceLbf = Math.round(umpForceN * 0.224809);

  // 7. Stator Frame Thermal Dissipation
  const Do_m = geom.statorOuterDiameterMm / 1000;
  const frameCylindricalAreaM2 = Math.PI * Do_m * L_m;
  const frameEndplatesAreaM2 = 2 * (Math.PI / 4) * (Math.pow(Do_m, 2) - Math.pow(D_m, 2));
  const totalCoolingAreaM2 = Number((frameCylindricalAreaM2 + frameEndplatesAreaM2).toFixed(3));
  const totalCoolingAreaSqFt = Number((totalCoolingAreaM2 * 10.7639).toFixed(2));
  const heatFluxW_m2 = Number((geom.totalLossW / Math.max(0.01, totalCoolingAreaM2)).toFixed(0));
  const heatFluxW_in2 = Number((heatFluxW_m2 * 0.00064516).toFixed(3));
  // Convective heat transfer coefficient h_c based on cooling method
  const h_conv = materialConfig.cooling === 'ic71w_liquid' ? 250 : materialConfig.cooling === 'ic411_tefc' ? 45 : 20; // W/(m²·K)
  const estimatedFrameDeltaT = Number((geom.totalLossW / (h_conv * totalCoolingAreaM2)).toFixed(1));

  // Snapshot Management
  const handleTakeSnapshot = () => {
    const snap: DesignSnapshot = {
      id: `rev_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      name: `Rev #${snapshots.length + 1} (${specs.topology.toUpperCase()})`,
      specs: { ...specs },
      geom: { ...geom },
    };
    setSnapshots([snap, ...snapshots.slice(0, 3)]);
    triggerAppliedFeedback('Snapshot Saved');
  };

  const handleRestoreSnapshot = (snap: DesignSnapshot) => {
    onUpdateSpecs(snap.specs);
    triggerAppliedFeedback(`Restored ${snap.name}`);
  };

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-40">
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-cyan-500/40 shadow-xl shadow-cyan-950/50 backdrop-blur-md transition-all hover:scale-105 active:scale-95 group"
          >
            <div className="relative">
              <Scale className="w-4 h-4 text-cyan-400" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            </div>
            <span className="text-xs font-semibold text-white tracking-wide">
              Engineering HUD & Units
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
              SI ⟷ Imperial
            </span>
          </button>
        </div>
      )}

      {/* Floating Expanded Engineering HUD Panel */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-200 shadow-2xl shadow-black/80 border border-slate-700 bg-slate-950/95 backdrop-blur-md rounded-2xl flex flex-col ${
            isMinimized
              ? 'bottom-5 right-5 w-80 h-14'
              : 'bottom-5 right-5 w-[92vw] sm:w-[600px] md:w-[680px] max-h-[85vh] h-[640px]'
          }`}
        >
          {/* HUD Header Bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90 rounded-t-2xl select-none">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white tracking-wide">
                Electrical Machine Engineering HUD
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                v2.4
              </span>
            </div>

            <div className="flex items-center gap-2">
              {justAppliedTarget && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/60 animate-fadeIn">
                  <Check className="w-3 h-3" /> {justAppliedTarget}
                </span>
              )}

              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                title={isMinimized ? 'Expand HUD' : 'Minimize HUD'}
              >
                {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                title="Close HUD"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body Content (Visible when not minimized) */}
          {!isMinimized && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tab Navigation Strip */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800/80 bg-slate-900/40 text-xs overflow-x-auto">
                <button
                  onClick={() => setActiveTab('converter')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    activeTab === 'converter'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" /> SI ⟷ Imperial Sync
                </button>

                <button
                  onClick={() => setActiveTab('wire')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    activeTab === 'wire'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" /> AWG & Slot Fill
                </button>

                <button
                  onClick={() => setActiveTab('maxwell')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    activeTab === 'maxwell'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Magnet className="w-3.5 h-3.5" /> Maxwell Stress & UMP
                </button>

                <button
                  onClick={() => setActiveTab('thermal')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    activeTab === 'thermal'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" /> Frame Heat Flux
                </button>

                <button
                  onClick={() => setActiveTab('snapshots')}
                  className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                    activeTab === 'snapshots'
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" /> Design Snapshots ({snapshots.length})
                </button>
              </div>

              {/* Tab Viewport */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* TAB 1: UNIT CONVERTER & MOTOR DESIGN CONSISTENCY INJECTOR */}
                {activeTab === 'converter' && (
                  <div className="space-y-4">
                    {/* Header info */}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Convert engineering values and inject directly into motor dimensions:</span>
                      <span className="font-mono text-cyan-400">Precision: 4 decimal places</span>
                    </div>

                    {/* 1. Length Converter & Injector */}
                    <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Compass className="w-3.5 h-3.5 text-cyan-400" />
                          Length & Dimensional Conversions (D, L, g, hs, bts)
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setLenVal(geom.statorBoreDiameterMm);
                              setLenFrom('mm');
                            }}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                          >
                            Use Bore ({geom.statorBoreDiameterMm}mm)
                          </button>
                          <button
                            onClick={() => {
                              setLenVal(geom.coreLengthMm);
                              setLenFrom('mm');
                            }}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                          >
                            Use Stack ({geom.coreLengthMm}mm)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center font-mono text-xs">
                        {/* Input Value */}
                        <div className="sm:col-span-2 flex items-center gap-1.5">
                          <input
                            type="number"
                            value={lenVal}
                            onChange={(e) => setLenVal(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-400 focus:outline-none"
                          />
                          <select
                            value={lenFrom}
                            onChange={(e) => setLenFrom(e.target.value as LengthUnit)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 font-mono focus:outline-none"
                          >
                            <option value="mm">mm</option>
                            <option value="cm">cm</option>
                            <option value="m">m</option>
                            <option value="in">inch</option>
                            <option value="mil">mil (thou)</option>
                            <option value="ft">ft</option>
                          </select>
                        </div>

                        {/* Equals indicator */}
                        <div className="text-center text-slate-400 font-sans text-xs sm:col-span-1">
                          <ArrowRightLeft className="w-3.5 h-3.5 inline text-cyan-400" />
                        </div>

                        {/* Output Value */}
                        <div className="sm:col-span-2 flex items-center gap-1.5">
                          <div className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono font-bold select-all truncate">
                            {convertedLength.toFixed(4)}
                          </div>
                          <select
                            value={lenTo}
                            onChange={(e) => setLenTo(e.target.value as LengthUnit)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 font-mono focus:outline-none"
                          >
                            <option value="in">inch</option>
                            <option value="mm">mm</option>
                            <option value="cm">cm</option>
                            <option value="m">m</option>
                            <option value="mil">mil (thou)</option>
                            <option value="ft">ft</option>
                          </select>
                        </div>
                      </div>

                      {/* Quick Design Injection Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-800/80 text-[11px]">
                        <span className="text-slate-400 font-mono mr-1">Inject as mm:</span>
                        <button
                          onClick={() => {
                            const inMm = convertLength(lenVal, lenFrom, 'mm');
                            // Recalculate aspectRatio lambda = L / tau
                            const tau = (Math.PI * inMm) / specs.poles;
                            const newAspectRatio = Number((geom.coreLengthMm / tau).toFixed(2));
                            onUpdateSpecs({ aspectRatio: newAspectRatio });
                            triggerAppliedFeedback(`Updated Aspect Ratio to match Bore ${inMm.toFixed(1)}mm`);
                          }}
                          className="px-2 py-1 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 font-mono transition-colors"
                        >
                          Target Bore ({convertLength(lenVal, lenFrom, 'mm').toFixed(1)} mm)
                        </button>
                        <button
                          onClick={() => {
                            const inMm = convertLength(lenVal, lenFrom, 'mm');
                            const newAspectRatio = Number((inMm / geom.polePitchMm).toFixed(2));
                            onUpdateSpecs({ aspectRatio: newAspectRatio });
                            triggerAppliedFeedback(`Updated Stack to ${inMm.toFixed(1)}mm (L/τ = ${newAspectRatio})`);
                          }}
                          className="px-2 py-1 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 font-mono transition-colors"
                        >
                          Target Stack ({convertLength(lenVal, lenFrom, 'mm').toFixed(1)} mm)
                        </button>
                      </div>
                    </div>

                    {/* 2. Force & Torque Converter */}
                    <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-400" />
                          Torque & Force Conversions (Tn, Breakdown Torque, Shear Stress)
                        </span>
                        <button
                          onClick={() => {
                            setTorqueVal(geom.ratedTorqueNm);
                            setTorqueFrom('Nm');
                          }}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          Use Rated ({geom.ratedTorqueNm} N·m)
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center font-mono text-xs">
                        {/* Input Value */}
                        <div className="sm:col-span-2 flex items-center gap-1.5">
                          <input
                            type="number"
                            value={torqueVal}
                            onChange={(e) => setTorqueVal(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-400 focus:outline-none"
                          />
                          <select
                            value={torqueFrom}
                            onChange={(e) => setTorqueFrom(e.target.value as TorqueUnit)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 font-mono focus:outline-none"
                          >
                            <option value="Nm">N·m</option>
                            <option value="lbf_ft">lbf·ft</option>
                            <option value="lbf_in">lbf·in</option>
                            <option value="kNm">kN·m</option>
                            <option value="oz_in">oz·in</option>
                          </select>
                        </div>

                        {/* Equals */}
                        <div className="text-center text-slate-400 font-sans text-xs sm:col-span-1">
                          <ArrowRightLeft className="w-3.5 h-3.5 inline text-amber-400" />
                        </div>

                        {/* Output */}
                        <div className="sm:col-span-2 flex items-center gap-1.5">
                          <div className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-amber-300 font-mono font-bold select-all truncate">
                            {convertedTorque.toFixed(2)}
                          </div>
                          <select
                            value={torqueTo}
                            onChange={(e) => setTorqueTo(e.target.value as TorqueUnit)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 font-mono focus:outline-none"
                          >
                            <option value="lbf_ft">lbf·ft</option>
                            <option value="Nm">N·m</option>
                            <option value="lbf_in">lbf·in</option>
                            <option value="kNm">kN·m</option>
                            <option value="oz_in">oz·in</option>
                          </select>
                        </div>
                      </div>

                      {/* Inject Torque to Power */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-800/80 text-[11px]">
                        <span className="text-slate-400 font-mono mr-1">Apply to Rated Power:</span>
                        <button
                          onClick={() => {
                            const inNm = convertTorque(torqueVal, torqueFrom, 'Nm');
                            // Pn = Tn * omega = Tn * (2*pi*nr / 60) [W]
                            const ratedSpeed = geom.ratedSpeedRpm || 1450;
                            const newPowerKw = Number(((inNm * (2 * Math.PI * ratedSpeed / 60)) / 1000).toFixed(1));
                            onUpdateSpecs({ powerKw: newPowerKw });
                            triggerAppliedFeedback(`Updated Power to ${newPowerKw} kW for ${inNm.toFixed(1)} N·m @ ${ratedSpeed} rpm`);
                          }}
                          className="px-2 py-1 rounded bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 font-mono transition-colors"
                        >
                          Derive Power at {geom.ratedSpeedRpm} RPM ({((convertTorque(torqueVal, torqueFrom, 'Nm') * (2 * Math.PI * (geom.ratedSpeedRpm || 1450) / 60)) / 1000).toFixed(1)} kW)
                        </button>
                      </div>
                    </div>

                    {/* 3. Density & Material Reference */}
                    <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-blue-400" />
                          Material Density Reference & Conversions (Steel, Copper, NdFeB)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center font-mono text-xs">
                        <div className="sm:col-span-2 flex items-center gap-1.5">
                          <input
                            type="number"
                            value={densityVal}
                            onChange={(e) => setDensityVal(parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-400 focus:outline-none"
                          />
                          <select
                            value={densityFrom}
                            onChange={(e) => setDensityFrom(e.target.value as DensityUnit)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 font-mono focus:outline-none"
                          >
                            <option value="kg_m3">kg/m³</option>
                            <option value="g_cm3">g/cm³</option>
                            <option value="lb_in3">lb/in³</option>
                            <option value="lb_ft3">lb/ft³</option>
                          </select>
                        </div>

                        <div className="text-center text-slate-400 font-sans text-xs sm:col-span-1">
                          <ArrowRightLeft className="w-3.5 h-3.5 inline text-blue-400" />
                        </div>

                        <div className="sm:col-span-2 flex items-center gap-1.5">
                          <div className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-blue-300 font-mono font-bold select-all truncate">
                            {convertedDensity.toFixed(4)}
                          </div>
                          <select
                            value={densityTo}
                            onChange={(e) => setDensityTo(e.target.value as DensityUnit)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-200 font-mono focus:outline-none"
                          >
                            <option value="lb_in3">lb/in³</option>
                            <option value="kg_m3">kg/m³</option>
                            <option value="g_cm3">g/cm³</option>
                            <option value="lb_ft3">lb/ft³</option>
                          </select>
                        </div>
                      </div>

                      {/* Quick preset buttons */}
                      <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-800/80 text-[10px] font-mono">
                        {MATERIAL_DENSITY_PRESETS.map((mat) => (
                          <button
                            key={mat.id}
                            onClick={() => {
                              setDensityVal(mat.densityKgM3);
                              setDensityFrom('kg_m3');
                            }}
                            className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                          >
                            {mat.name.split(' ')[0]}: {mat.densityKgM3} kg/m³ ({mat.densityLbIn3} lb/in³)
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 4. Power & Electric Loading Conversions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Power: kW to HP */}
                      <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5 text-emerald-400" />
                          Mechanical Power (kW ⟷ HP)
                        </span>
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <input
                            type="number"
                            value={powerVal}
                            onChange={(e) => setPowerVal(parseFloat(e.target.value) || 0)}
                            className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none"
                          />
                          <select
                            value={powerFrom}
                            onChange={(e) => setPowerFrom(e.target.value as PowerUnit)}
                            className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-200"
                          >
                            <option value="kW">kW</option>
                            <option value="HP">HP</option>
                            <option value="W">W</option>
                          </select>
                          <span className="text-slate-400">=</span>
                          <span className="font-bold text-emerald-400 flex-1 truncate">
                            {convertedPower.toFixed(2)} {powerTo}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const inKw = convertPower(powerVal, powerFrom, 'kW');
                            onUpdateSpecs({ powerKw: inKw });
                            triggerAppliedFeedback(`Set Power to ${inKw} kW`);
                          }}
                          className="w-full py-1 text-[11px] font-mono rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800"
                        >
                          Apply {convertPower(powerVal, powerFrom, 'kW').toFixed(1)} kW to Design
                        </button>
                      </div>

                      {/* Electric Loading ac & J */}
                      <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-cyan-400" />
                          Electric Loading (ac) & Density (J)
                        </span>
                        <div className="text-[11px] font-mono text-slate-300 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-slate-400">ac = {specs.specificElectricLoading.toLocaleString()} A/m:</span>
                            <span className="text-cyan-300">
                              {(specs.specificElectricLoading * 0.0254).toFixed(0)} A/inch
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">J = {specs.currentDensityA_mm2} A/mm²:</span>
                            <span className="text-cyan-300">
                              {(specs.currentDensityA_mm2 * 645.16).toFixed(0)} A/in² ({(1000 / specs.currentDensityA_mm2 * 1.9735e-3).toFixed(0)} kcmil/A)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: AWG / SWG MAGNET WIRE & SLOT FILL TOOL */}
                {activeTab === 'wire' && (
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Standard copper magnet wire table and slot packing feasibility:</span>
                      <span className="font-mono text-cyan-400">Slot Area: {geom.slotAreaMm2} mm²</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
                      <div className="space-y-1.5">
                        <label className="text-[11px] text-slate-400 font-sans block">
                          Select Magnet Wire Gauge:
                        </label>
                        <select
                          value={selectedAwg}
                          onChange={(e) => setSelectedAwg(parseInt(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-400"
                        >
                          {AWG_WIRE_TABLE.map((w) => (
                            <option key={w.awg} value={w.awg}>
                              AWG {w.awg} (SWG {w.swgEquivalent}) — ⌀{w.bareDiameterMm} mm ({w.bareDiameterIn} in)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] text-slate-400 font-sans block">
                          Parallel Strands in Conductor Bundle:
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="1"
                            max="8"
                            value={parallelStrands}
                            onChange={(e) => setParallelStrands(parseInt(e.target.value))}
                            className="flex-1 accent-cyan-400"
                          />
                          <span className="font-bold text-white w-8 text-right">{parallelStrands}x</span>
                        </div>
                      </div>
                    </div>

                    {/* Wire Specifications Matrix */}
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5 font-mono text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
                        <div>
                          <span className="text-[10px] text-slate-500 block">Bare Wire Diameter:</span>
                          <span className="font-bold text-white">{wireEntry.bareDiameterMm} mm</span>{' '}
                          <span className="text-[10px] text-slate-400">({wireEntry.bareDiameterIn} in)</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Single Wire Area:</span>
                          <span className="font-bold text-white">{wireEntry.copperAreaMm2} mm²</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Bundle Copper Area:</span>
                          <span className="font-bold text-cyan-300">
                            {(wireEntry.copperAreaMm2 * parallelStrands).toFixed(3)} mm²
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 block">Resistance (20°C):</span>
                          <span className="font-bold text-white">
                            {(wireEntry.nominalResistanceOhmPerM / parallelStrands).toFixed(4)} Ω/m
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-900 grid grid-cols-2 gap-3 items-center">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-sans">
                            Resulting Slot Fill Factor (Zs = {geom.conductorsPerSlot}):
                          </span>
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`text-xl font-bold ${
                                wireSlotFill > 0.45
                                  ? 'text-rose-400'
                                  : wireSlotFill > 0.40
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              k_fill = {wireSlotFill}
                            </span>
                            <span className="text-[10px] text-slate-500 font-sans">
                              {wireSlotFill > 0.45 ? 'Too tight to wind!' : wireSlotFill >= 0.35 ? 'Optimal pack' : 'Loose slot'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <button
                            onClick={() => {
                              onUpdateSpecs({ slotFillFactor: Math.min(0.48, Math.max(0.30, wireSlotFill)) });
                              triggerAppliedFeedback(`Updated Slot Fill Target to ${wireSlotFill}`);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors"
                          >
                            Apply Wire Sizing to Slot
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: MAXWELL STRESS TENSOR & UNBALANCED MAGNETIC PULL */}
                {activeTab === 'maxwell' && (
                  <div className="space-y-3.5">
                    <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Magnet className="w-3.5 h-3.5 text-cyan-400" />
                        Airgap Radial Maxwell Stress Tensor & Eccentricity Pull
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans">
                        The radial magnetic pressure pulling the stator teeth towards the rotor is given by{' '}
                        <code className="text-cyan-300 font-mono">σ_m = B² / (2·μ₀)</code>. Dynamic rotor eccentricity produces an Unbalanced Magnetic Pull (UMP) that directly stresses shaft bearings.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                      {/* Radial Magnetic Pressure */}
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                        <span className="text-[10px] text-slate-400 block font-sans uppercase">
                          Peak Radial Magnetic Stress (σ_m)
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-white">{maxwellStressKPa}</span>
                          <span className="text-xs text-slate-400 font-sans">kPa</span>
                          <span className="text-xs text-cyan-400 ml-auto">({maxwellStressPsi} psi)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-sans">
                          Calculated for peak airgap flux density B_peak = {peakAirgapB.toFixed(2)} T.
                        </p>
                      </div>

                      {/* Unbalanced Magnetic Pull */}
                      <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                        <span className="text-[10px] text-slate-400 block font-sans uppercase">
                          Unbalanced Magnetic Pull (10% Eccentricity)
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-amber-400">{umpForceN.toLocaleString()}</span>
                          <span className="text-xs text-slate-400 font-sans">N</span>
                          <span className="text-xs text-amber-300 ml-auto">({umpForceLbf} lbf)</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-sans">
                          Net static side-pull on shaft bearings for ε = 0.10·g (g = {geom.airgapLengthMm} mm).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 4: FRAME THERMAL HEAT FLUX */}
                {activeTab === 'thermal' && (
                  <div className="space-y-3.5">
                    <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-rose-400" />
                        Stator Frame Convective Heat Dissipation & Temperature Rise
                      </h4>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans">
                        Validates if active total motor losses ({geom.totalLossW} W) can be expelled across the stator outer frame cylindrical surface without exceeding insulation class limits.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Dissipation Area:</span>
                        <span className="text-base font-bold text-white">{totalCoolingAreaM2} m²</span>
                        <span className="text-[10px] text-slate-400 block font-sans">({totalCoolingAreaSqFt} sq.ft)</span>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Surface Heat Flux:</span>
                        <span className="text-base font-bold text-rose-400">{heatFluxW_m2} W/m²</span>
                        <span className="text-[10px] text-slate-400 block font-sans">({heatFluxW_in2} W/in²)</span>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Est. Frame Rise ΔT:</span>
                        <span className="text-base font-bold text-amber-400">+{estimatedFrameDeltaT} °C</span>
                        <span className="text-[10px] text-slate-400 block font-sans">h = {h_conv} W/m²K</span>
                      </div>

                      <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <span className="text-[10px] text-slate-500 block">Hot-Spot Temp:</span>
                        <span className="text-base font-bold text-white">{geom.copperTemperatureC} °C</span>
                        <span className="text-[10px] text-emerald-400 block font-sans">Insulation: {materialConfig.insulation.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 5: DESIGN SNAPSHOTS & REVISION COMPARISON */}
                {activeTab === 'snapshots' && (
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">
                        Capture design milestones to compare deltas or restore previous parameters:
                      </span>
                      <button
                        onClick={handleTakeSnapshot}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center gap-1 transition-colors"
                      >
                        <Bookmark className="w-3.5 h-3.5" /> Snapshot Active Design
                      </button>
                    </div>

                    {snapshots.length === 0 ? (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
                        No snapshots captured yet. Click &quot;Snapshot Active Design&quot; to save the current motor geometry state.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {snapshots.map((snap) => {
                          const deltaEff = Number((geom.calculatedEfficiency - snap.geom.calculatedEfficiency).toFixed(2));
                          const deltaTorque = Number((geom.ratedTorqueNm - snap.geom.ratedTorqueNm).toFixed(1));
                          return (
                            <div
                              key={snap.id}
                              className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-3 text-xs font-mono"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white">{snap.name}</span>
                                  <span className="text-[10px] text-slate-500">{snap.timestamp}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-3">
                                  <span>D = {snap.geom.statorBoreDiameterMm}mm</span>
                                  <span>L = {snap.geom.coreLengthMm}mm</span>
                                  <span>η = {snap.geom.calculatedEfficiency}%</span>
                                  <span>Tn = {snap.geom.ratedTorqueNm} N·m</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <div className="text-right text-[11px]">
                                  <span className="text-slate-500 block">Delta vs Active:</span>
                                  <span className={deltaEff >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                    Δη: {deltaEff >= 0 ? `+${deltaEff}` : deltaEff}%
                                  </span>
                                </div>

                                <button
                                  onClick={() => handleRestoreSnapshot(snap)}
                                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 text-xs font-sans transition-colors"
                                >
                                  Restore
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
