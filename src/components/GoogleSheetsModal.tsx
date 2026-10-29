/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MotorSpecs, CalculatedGeometry } from '../types/motor';
import { exportDesignToGoogleSheets, GoogleSheetExportResult } from '../utils/googleSheetsExport';
import { User } from 'firebase/auth';
import { Sheet, X, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  specs: MotorSpecs;
  geom: CalculatedGeometry;
  user: User | null;
  onSignIn: () => Promise<void>;
  accessToken: string | null;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  specs,
  geom,
  user,
  onSignIn,
  accessToken,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<GoogleSheetExportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    if (!accessToken) {
      setErrorMsg('Please sign in with Google first to authenticate with the Google Sheets API.');
      return;
    }

    setIsExporting(true);
    setErrorMsg(null);
    setExportResult(null);

    try {
      const result = await exportDesignToGoogleSheets(specs, geom, accessToken);
      setExportResult(result);
    } catch (err: unknown) {
      console.error('Google Sheets export failure:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to export to Google Sheets.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400">
            <Sheet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Export to Google Sheets</h3>
            <p className="text-xs text-slate-400">
              Generate a formatted, live calculation workbook in Google Drive.
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="space-y-4 py-2">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
            <div className="flex justify-between font-mono text-slate-300">
              <span>Target Machine:</span>
              <strong className="text-white">{specs.name}</strong>
            </div>
            <div className="flex justify-between font-mono text-slate-300">
              <span>Topology:</span>
              <strong className="text-cyan-400 uppercase">{specs.topology}</strong>
            </div>
            <div className="flex justify-between font-mono text-slate-300">
              <span>Worksheet Tabs:</span>
              <span className="text-slate-400">4 Tabs (Sizing, Core, Winding, Losses)</span>
            </div>
          </div>

          {/* User Authentication State */}
          {!user ? (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center space-y-3">
              <p className="text-xs text-slate-300">
                Sign in with your Google account to grant permission to create the spreadsheet in your Google Drive.
              </p>

              {/* Official Google Sign-In Button */}
              <button
                onClick={onSignIn}
                className="w-full inline-flex items-center justify-center gap-3 bg-white text-slate-700 hover:bg-slate-100 font-medium text-xs py-2 px-4 rounded-lg shadow transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </button>
            </div>
          ) : (
            <div className="bg-emerald-950/30 border border-emerald-700/40 rounded-xl p-3 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300">
                  Signed in as <strong>{user.email}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Success Message & Link */}
          {exportResult && (
            <div className="bg-emerald-950/60 border border-emerald-500 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Spreadsheet successfully created in Google Sheets!</span>
              </div>
              <a
                href={exportResult.spreadsheetUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors shadow-sm"
              >
                <span>Open in Google Sheets</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-rose-950/40 border border-rose-700/60 rounded-xl p-3 flex items-start gap-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Modal Action Footer */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800 mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Close
          </button>

          {user && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg transition-colors shadow-sm"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Sheets Workbook...</span>
                </>
              ) : (
                <>
                  <Sheet className="w-3.5 h-3.5" />
                  <span>Export to Google Sheets</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
