/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MotorSpecs, MaterialLimitsConfig } from './types/motor';
import { MOTOR_PRESETS } from './utils/presets';
import { calculateMotorGeometry } from './utils/motorCalculations';
import { evaluateMaterialLimits } from './utils/materialLimits';
import { Header } from './components/Header';
import { GeometrySpreadsheet } from './components/GeometrySpreadsheet';
import { MotorCadView } from './components/MotorCadView';
import { WindingAnalysisView } from './components/WindingAnalysisView';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { SystemAnalysisView } from './components/SystemAnalysisView';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { FloatingEngineeringHud } from './components/FloatingEngineeringHud';
import { generateMotorDesignPdf } from './utils/pdfExport';
import { initAuth, googleSignIn, logout } from './utils/auth';
import { User } from 'firebase/auth';
import {
  Compass,
  Sliders,
  Cpu,
  Zap,
  Gauge,
  Thermometer,
  Magnet,
  AlertTriangle,
  AlertOctagon,
  ShieldCheck,
} from 'lucide-react';

export default function App() {
  const [currentSpecs, setCurrentSpecs] = useState<MotorSpecs>(MOTOR_PRESETS[0]);
  const [activeTab, setActiveTab] = useState<'spreadsheet' | 'cad' | 'winding' | 'performance' | 'system'>('spreadsheet');

  // Material Limits Configuration state
  const [materialConfig, setMaterialConfig] = useState<MaterialLimitsConfig>({
    cooling: 'ic411_tefc',
    insulation: 'class_f_155',
    steelGrade: 'm400_50a',
  });

  // Firebase Google Auth State
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);

  // Initialize auth state listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, token) => {
        setUser(authedUser);
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleSignIn = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
      }
    } catch (err) {
      console.error('Sign-in failed:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
    } catch (err) {
      console.error('Sign-out failed:', err);
    }
  };

  // Synchronous, reactive D²L calculations with material configuration
  const calculatedGeometry = calculateMotorGeometry(currentSpecs, materialConfig);

  // Material-specific validation
  const validation = evaluateMaterialLimits(
    calculatedGeometry.actualCurrentDensityA_mm2,
    calculatedGeometry.toothFluxDensityTesla,
    calculatedGeometry.yokeFluxDensityTesla,
    materialConfig
  );

  const handleUpdateSpecs = (updated: Partial<MotorSpecs>) => {
    setCurrentSpecs((prev) => ({ ...prev, ...updated }));
  };

  const handleSelectPreset = (preset: MotorSpecs) => {
    setCurrentSpecs(preset);
  };

  const handleResetToDefault = () => {
    const original = MOTOR_PRESETS.find((p) => p.id === currentSpecs.id) ?? MOTOR_PRESETS[0];
    setCurrentSpecs(original);
  };

  const handleExportPdf = () => {
    setIsPdfExporting(true);
    setTimeout(() => {
      try {
        generateMotorDesignPdf(currentSpecs, calculatedGeometry);
      } catch (err) {
        console.error('PDF export error:', err);
      } finally {
        setIsPdfExporting(false);
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Navigation */}
      <Header
        currentSpecs={currentSpecs}
        onSelectPreset={handleSelectPreset}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onExportPdf={handleExportPdf}
        onOpenGoogleSheetsModal={() => setIsSheetsModalOpen(true)}
        user={user}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        isPdfExporting={isPdfExporting}
      />

      {/* Synchronized Main KPI Strip with Thermal & Saturation Warning Badges */}
      <div className="border-b border-slate-800 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Stator Bore */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                Stator Bore (D)
              </span>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                {calculatedGeometry.statorBoreDiameterMm}{' '}
                <span className="text-xs font-normal text-slate-400">mm</span>
              </div>
            </div>

            {/* Core Stack Length */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                Core Stack (L)
              </span>
              <div className="text-base font-bold font-mono text-white mt-0.5">
                {calculatedGeometry.coreLengthMm}{' '}
                <span className="text-xs font-normal text-slate-400">mm</span>
              </div>
            </div>

            {/* Stator Current Density (J) with Live Material Thermal Warning Status */}
            <div
              className={`rounded-lg p-2.5 border transition-all ${
                validation.thermalStatus === 'exceeded'
                  ? 'bg-rose-950/40 border-rose-600 shadow-md shadow-rose-950/50'
                  : validation.thermalStatus === 'caution'
                  ? 'bg-amber-950/30 border-amber-600/80'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium flex items-center gap-1 text-slate-300">
                  <Thermometer
                    className={`w-3.5 h-3.5 ${
                      validation.thermalStatus === 'exceeded'
                        ? 'text-rose-400 animate-pulse'
                        : validation.thermalStatus === 'caution'
                        ? 'text-amber-400'
                        : 'text-cyan-400'
                    }`}
                  />
                  Current Dens (J)
                </span>
                {validation.thermalStatus === 'exceeded' && (
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                )}
                {validation.thermalStatus === 'caution' && (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <div className="text-base font-bold font-mono mt-0.5 flex items-baseline justify-between">
                <span
                  className={
                    validation.thermalStatus === 'exceeded'
                      ? 'text-rose-300'
                      : validation.thermalStatus === 'caution'
                      ? 'text-amber-300'
                      : 'text-white'
                  }
                >
                  {calculatedGeometry.actualCurrentDensityA_mm2}{' '}
                  <span className="text-xs font-normal text-slate-400">A/mm²</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {validation.currentDensityUtilizationPct}%
                </span>
              </div>
            </div>

            {/* Stator Tooth Flux Density (Bts) with Live Saturation Knee Warning Status */}
            <div
              className={`rounded-lg p-2.5 border transition-all ${
                validation.toothMagneticStatus === 'exceeded'
                  ? 'bg-rose-950/40 border-rose-600 shadow-md shadow-rose-950/50'
                  : validation.toothMagneticStatus === 'caution'
                  ? 'bg-amber-950/30 border-amber-600/80'
                  : 'bg-slate-900/80 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium flex items-center gap-1 text-slate-300">
                  <Magnet
                    className={`w-3.5 h-3.5 ${
                      validation.toothMagneticStatus === 'exceeded'
                        ? 'text-rose-400 animate-pulse'
                        : validation.toothMagneticStatus === 'caution'
                        ? 'text-amber-400'
                        : 'text-cyan-400'
                    }`}
                  />
                  Tooth Flux (Bts)
                </span>
                {validation.toothMagneticStatus === 'exceeded' && (
                  <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                )}
                {validation.toothMagneticStatus === 'caution' && (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <div className="text-base font-bold font-mono mt-0.5 flex items-baseline justify-between">
                <span
                  className={
                    validation.toothMagneticStatus === 'exceeded'
                      ? 'text-rose-300'
                      : validation.toothMagneticStatus === 'caution'
                      ? 'text-amber-300'
                      : 'text-white'
                  }
                >
                  {calculatedGeometry.toothFluxDensityTesla}{' '}
                  <span className="text-xs font-normal text-slate-400">T</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {validation.toothFluxUtilizationPct}%
                </span>
              </div>
            </div>

            {/* Rated Torque */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                Rated Torque (Tn)
              </span>
              <div className="text-base font-bold font-mono text-cyan-400 mt-0.5">
                {calculatedGeometry.ratedTorqueNm}{' '}
                <span className="text-xs font-normal text-slate-400">N·m</span>
              </div>
            </div>

            {/* Active Efficiency */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                Active Efficiency
              </span>
              <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                {calculatedGeometry.calculatedEfficiency}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Workspace Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'spreadsheet' && (
          <GeometrySpreadsheet
            specs={currentSpecs}
            geom={calculatedGeometry}
            onUpdateSpecs={handleUpdateSpecs}
            onResetToDefault={handleResetToDefault}
          />
        )}

        {activeTab === 'cad' && (
          <div className="min-h-[740px] flex flex-col">
            <MotorCadView
              specs={currentSpecs}
              geom={calculatedGeometry}
              materialConfig={materialConfig}
            />
          </div>
        )}

        {activeTab === 'winding' && (
          <WindingAnalysisView
            specs={currentSpecs}
            geom={calculatedGeometry}
            onUpdateCoilPitch={(pitch) => handleUpdateSpecs({ coilPitchSlots: pitch })}
          />
        )}

        {activeTab === 'performance' && (
          <PerformanceDashboard
            specs={currentSpecs}
            geom={calculatedGeometry}
            onApplyOptimizedSpecs={(opt) => setCurrentSpecs(opt)}
            materialConfig={materialConfig}
            onChangeMaterialConfig={setMaterialConfig}
          />
        )}

        {activeTab === 'system' && (
          <SystemAnalysisView
            specs={currentSpecs}
            geom={calculatedGeometry}
            materialConfig={materialConfig}
            onExportPdf={handleExportPdf}
          />
        )}
      </main>

      {/* Floating Engineering Utilities HUD & Unit Converter */}
      <FloatingEngineeringHud
        specs={currentSpecs}
        geom={calculatedGeometry}
        onUpdateSpecs={handleUpdateSpecs}
        materialConfig={materialConfig}
      />

      {/* Google Sheets Export Modal */}
      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        specs={currentSpecs}
        geom={calculatedGeometry}
        user={user}
        onSignIn={handleSignIn}
        accessToken={accessToken}
      />

      {/* Technical Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-4 sm:px-6 lg:px-8 text-xs text-slate-500 font-mono flex flex-wrap items-center justify-between gap-4">
        <div>
          D²L Sizing Method · Classical Formulation (Sawhney / Pyrhönen / Boldea / Zhu)
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>Induction</span>
          <span>·</span>
          <span>PMSM (SPM/IPM)</span>
          <span>·</span>
          <span>Vernier PM</span>
          <span>·</span>
          <span>Wound Field</span>
        </div>
      </footer>
    </div>
  );
}
