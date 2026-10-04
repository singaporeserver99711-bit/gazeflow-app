import React, { useState } from 'react';
import { 
  Smartphone, 
  RotateCcw, 
  Laptop, 
  Eye, 
  ArrowDown, 
  ArrowUp, 
  PauseCircle, 
  Check, 
  Camera, 
  Sparkles,
  Sliders
} from 'lucide-react';
import { DeviceOrientation, GazeSettings } from '../types';

interface Props {
  isOpen: boolean;
  currentSettings: GazeSettings;
  onConfirm: (orientation: DeviceOrientation, startWithCalibration: boolean) => void;
  onUseSimulation: () => void;
  onClose?: () => void;
}

export const OrientationSetupModal: React.FC<Props> = ({
  isOpen,
  currentSettings,
  onConfirm,
  onUseSimulation,
  onClose,
}) => {
  const [selectedOrientation, setSelectedOrientation] = useState<DeviceOrientation>(
    currentSettings.orientation || 'portrait'
  );
  const [calibrateFirst, setCalibrateFirst] = useState<boolean>(true);

  if (!isOpen) return null;

  const orientationOptions: {
    id: DeviceOrientation;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    cameraBadge: string;
  }[] = [
    {
      id: 'portrait',
      title: 'Vertical / Portrait',
      subtitle: 'Standard phone holding position',
      cameraBadge: 'Camera at TOP',
      icon: (
        <div className="relative w-12 h-16 border-2 border-neutral-400 rounded-xl flex flex-col items-center justify-between p-1 bg-neutral-900/60">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40 animate-pulse" />
          <div className="w-6 h-1 rounded-full bg-neutral-600" />
        </div>
      ),
    },
    {
      id: 'landscape-left',
      title: 'Horizontal (Left Cam · 90° ACW)',
      subtitle: 'Rotated 90° anti-clockwise with camera on your left',
      cameraBadge: 'Camera on LEFT (90° ACW)',
      icon: (
        <div className="relative w-16 h-12 border-2 border-neutral-400 rounded-xl flex items-center justify-between p-1 bg-neutral-900/60">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40 animate-pulse" />
          <div className="w-1 h-6 rounded-full bg-neutral-600" />
        </div>
      ),
    },
    {
      id: 'landscape-right',
      title: 'Horizontal (Right Cam)',
      subtitle: 'Landscape with camera on your right',
      cameraBadge: 'Camera on RIGHT',
      icon: (
        <div className="relative w-16 h-12 border-2 border-neutral-400 rounded-xl flex items-center justify-between p-1 bg-neutral-900/60">
          <div className="w-1 h-6 rounded-full bg-neutral-600" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40 animate-pulse" />
        </div>
      ),
    },
    {
      id: 'desktop',
      title: 'Laptop / Monitor',
      subtitle: 'Desktop webcam above the display',
      cameraBadge: 'Webcam at TOP',
      icon: (
        <div className="relative w-16 h-12 border-2 border-neutral-400 rounded-t-lg flex flex-col items-center justify-between p-1 bg-neutral-900/60">
          <div className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-500/40" />
          <div className="w-12 h-0.5 bg-neutral-500 mt-auto" />
        </div>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-7 text-neutral-100 shadow-2xl space-y-5 my-auto">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors z-10"
            title="Close"
          >
            ✕
          </button>
        )}

        {/* Header */}
        <div className="space-y-2 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-1">
            <Eye className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight font-display text-white">
            Device Orientation Setup
          </h2>
          <p className="text-sm text-neutral-400 max-w-md mx-auto">
            How are you holding your device right now? This aligns camera tracking with your screen for smooth eye scrolling.
          </p>
        </div>

        {/* Orientation Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {orientationOptions.map((opt) => {
            const isSelected = selectedOrientation === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSelectedOrientation(opt.id)}
                className={`relative flex items-center gap-3.5 p-3.5 rounded-2xl text-left border transition-all ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                    : 'border-neutral-800 bg-neutral-800/40 hover:bg-neutral-800/70 hover:border-neutral-700'
                }`}
              >
                <div className="shrink-0">{opt.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-white truncate">
                      {opt.title}
                    </span>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center shrink-0 ml-1">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-emerald-400/90 font-mono block mt-0.5">
                    {opt.cameraBadge}
                  </span>
                  <span className="text-xs text-neutral-400 block truncate mt-0.5">
                    {opt.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Eye Action Mapping Preview */}
        <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-2xl p-4 space-y-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
            Gaze Gestures Configuration
          </span>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-neutral-900/80 p-2.5 rounded-xl border border-neutral-800 flex flex-col items-center gap-1">
              <ArrowUp className="w-4 h-4 text-emerald-400" />
              <span className="font-medium text-neutral-200">Look Up</span>
              <span className="text-[10px] text-emerald-400 font-semibold">Next Short</span>
            </div>
            <div className="bg-neutral-900/80 p-2.5 rounded-xl border border-neutral-800 flex flex-col items-center gap-1">
              <ArrowDown className="w-4 h-4 text-neutral-400" />
              <span className="font-medium text-neutral-200">Look Down</span>
              <span className="text-[10px] text-neutral-400">Previous Short</span>
            </div>
            <div className="bg-neutral-900/80 p-2.5 rounded-xl border border-neutral-800 flex flex-col items-center gap-1">
              <PauseCircle className="w-4 h-4 text-amber-400" />
              <span className="font-medium text-neutral-200">Look Away</span>
              <span className="text-[10px] text-neutral-400">Auto-Pause</span>
            </div>
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed pt-1 text-center">
            Zero API costs: 100% processed on-device in your browser. Video streams never leave your device.
          </p>
        </div>

        {/* Calibration Option Checkbox */}
        <label className="flex items-center gap-3 p-3 bg-neutral-800/30 border border-neutral-800 rounded-xl cursor-pointer hover:bg-neutral-800/50 transition-colors">
          <input
            type="checkbox"
            checked={calibrateFirst}
            onChange={(e) => setCalibrateFirst(e.target.checked)}
            className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
          />
          <div className="text-xs">
            <span className="font-medium text-neutral-200 block">Quick 15-second Eye Calibration</span>
            <span className="text-neutral-400">Learns your personal neutral eye position for accurate scrolling.</span>
          </div>
        </label>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            onClick={() => onConfirm(selectedOrientation, calibrateFirst)}
            className="flex-1 py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-neutral-950 font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <Camera className="w-4 h-4" />
            <span>Enable Camera & Begin</span>
          </button>

          <button
            type="button"
            onClick={onUseSimulation}
            className="py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:scale-[0.99] text-neutral-300 hover:text-white font-medium text-xs transition-all flex items-center justify-center gap-1.5 whitespace-nowrap border border-neutral-700"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Virtual Mode (No Cam)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
