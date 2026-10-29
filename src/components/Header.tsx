/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MotorSpecs, MotorTopology } from '../types/motor';
import { MOTOR_PRESETS } from '../utils/presets';
import { User } from 'firebase/auth';
import {
  FileDown,
  Sheet,
  Sparkles,
  Zap,
  RotateCcw,
  Sliders,
  Compass,
  Activity,
  Layers,
} from 'lucide-react';

interface HeaderProps {
  currentSpecs: MotorSpecs;
  onSelectPreset: (preset: MotorSpecs) => void;
  activeTab: 'spreadsheet' | 'cad' | 'winding' | 'performance';
  setActiveTab: (tab: 'spreadsheet' | 'cad' | 'winding' | 'performance') => void;
  onExportPdf: () => void;
  onOpenGoogleSheetsModal: () => void;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  isPdfExporting: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentSpecs,
  onSelectPreset,
  activeTab,
  setActiveTab,
  onExportPdf,
  onOpenGoogleSheetsModal,
  user,
  onSignIn,
  onSignOut,
  isPdfExporting,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur-md sticky top-0 z-40">
      {/* Strict Top Bar Contract: Brand | Navigation Links | Primary Actions */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold text-lg">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              D²L Machine Studio
            </span>
            <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
              Motor Geometry Sizing & Optimization
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-800/70 p-1 rounded-lg border border-slate-700/60">
          <button
            onClick={() => setActiveTab('spreadsheet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'spreadsheet'
                ? 'bg-cyan-500 text-slate-950 shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Sizing Sheet</span>
          </button>

          <button
            onClick={() => setActiveTab('cad')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'cad'
                ? 'bg-cyan-500 text-slate-950 shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>2D CAD Geometry</span>
          </button>

          <button
            onClick={() => setActiveTab('winding')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'winding'
                ? 'bg-cyan-500 text-slate-950 shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Winding Function</span>
          </button>

          <button
            onClick={() => setActiveTab('performance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap shrink-0 ${
              activeTab === 'performance'
                ? 'bg-cyan-500 text-slate-950 shadow-sm font-semibold'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Torque & Losses</span>
          </button>
        </nav>

        {/* Zone 3: Export & Workspace Integration Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onOpenGoogleSheetsModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 rounded-lg transition-colors whitespace-nowrap shrink-0"
            title="Export full calculation sheet to Google Sheets"
          >
            <Sheet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Google Sheets</span>
          </button>

          <button
            onClick={onExportPdf}
            disabled={isPdfExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-900 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-lg shadow-sm shadow-cyan-500/20 transition-colors whitespace-nowrap shrink-0"
            title="Export comprehensive technical PDF report"
          >
            <FileDown className="w-3.5 h-3.5 text-slate-900" />
            <span>{isPdfExporting ? 'Generating...' : 'Export PDF'}</span>
          </button>

          {user ? (
            <div className="flex items-center gap-2 pl-1 border-l border-slate-700">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName ?? 'User'}
                  className="w-7 h-7 rounded-full border border-slate-600"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center text-xs font-bold">
                  {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              <button
                onClick={onSignOut}
                className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="text-xs text-slate-300 hover:text-white px-2 py-1 transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* Topology & Preset Secondary Bar */}
      <div className="bg-slate-950/70 border-t border-slate-800/80 px-4 sm:px-6 lg:px-8 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Active Preset:</span>
            <select
              value={currentSpecs.id}
              onChange={(e) => {
                const found = MOTOR_PRESETS.find((p) => p.id === e.target.value);
                if (found) onSelectPreset(found);
              }}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded-md px-2.5 py-1 text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
            >
              {MOTOR_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.topology.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-4 text-slate-400 font-mono text-[11px]">
            <span>Topology: <strong className="text-cyan-400 uppercase">{currentSpecs.topology.replace('_', ' ')}</strong></span>
            <span>·</span>
            <span>Power: <strong className="text-slate-200">{currentSpecs.powerKw} kW</strong></span>
            <span>·</span>
            <span>Voltage: <strong className="text-slate-200">{currentSpecs.voltageV} V</strong></span>
            <span>·</span>
            <span>Poles: <strong className="text-slate-200">{currentSpecs.poles}P</strong></span>
          </div>
        </div>
      </div>
    </header>
  );
};
