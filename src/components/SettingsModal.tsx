import React from 'react';
import { 
  X, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Vibrate, 
  Eye, 
  Sliders, 
  Smartphone, 
  Camera, 
  Keyboard, 
  Check,
  Target
} from 'lucide-react';
import { DeviceOrientation, GazeSettings } from '../types';

interface Props {
  isOpen: boolean;
  settings: GazeSettings;
  onUpdateSettings: (newSettings: Partial<GazeSettings>) => void;
  onOpenCalibration: () => void;
  onResetCalibration: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  settings,
  onUpdateSettings,
  onOpenCalibration,
  onResetCalibration,
  onClose,
}) => {
  const [isResetDone, setIsResetDone] = React.useState(false);

  const handleReset = () => {
    onResetCalibration();
    setIsResetDone(true);
    setTimeout(() => setIsResetDone(false), 2000);
  };

  const orientations: { id: DeviceOrientation; label: string; desc: string }[] = [
    { id: 'portrait', label: 'Vertical (Phone)', desc: 'Camera at top' },
    { id: 'landscape-left', label: 'Landscape (Left Cam · 90° ACW)', desc: 'Rotated 90° anti-clockwise' },
    { id: 'landscape-right', label: 'Landscape (Right Cam)', desc: 'Rotated 90° clockwise' },
    { id: 'desktop', label: 'Desktop / Laptop', desc: 'Webcam above screen' },
    { id: 'portrait-inverted', label: 'Upside Down', desc: 'Camera at bottom' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-neutral-100 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-lg text-white">GazeFlow Settings</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Orientation Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
            Device Holding Position & Camera
          </label>
          <div className="grid grid-cols-1 gap-2">
            {orientations.map((item) => {
              const active = settings.orientation === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onUpdateSettings({ orientation: item.id })}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-left text-xs transition-all ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/10 text-white'
                      : 'border-neutral-800 bg-neutral-800/40 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  <div>
                    <span className="font-medium block">{item.label}</span>
                    <span className="text-[11px] text-neutral-400">{item.desc}</span>
                  </div>
                  {active && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scroll Trigger Direction Setting */}
        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
            Scroll Trigger Eye Movement
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => onUpdateSettings({ scrollTriggerDirection: 'look-up' })}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                settings.scrollTriggerDirection === 'look-up'
                  ? 'border-emerald-500 bg-emerald-500/15 text-white font-semibold'
                  : 'border-neutral-800 bg-neutral-800/40 text-neutral-400 hover:text-white'
              }`}
            >
              <span className="block text-emerald-400 font-bold mb-0.5">⬆️ Look Up</span>
              <span className="text-[10px] text-neutral-300">Scroll to Next (Default)</span>
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ scrollTriggerDirection: 'look-down' })}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                settings.scrollTriggerDirection === 'look-down'
                  ? 'border-emerald-500 bg-emerald-500/15 text-white font-semibold'
                  : 'border-neutral-800 bg-neutral-800/40 text-neutral-400 hover:text-white'
              }`}
            >
              <span className="block text-neutral-300 font-bold mb-0.5">⬇️ Look Down</span>
              <span className="text-[10px] text-neutral-400">Scroll to Next</span>
            </button>
          </div>
        </div>

        {/* Sensitivity & Dwell Sliders */}
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-300 font-medium">Eye Gaze Sensitivity</span>
              <span className="text-emerald-400 font-mono">Level {settings.sensitivity} / 5</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.sensitivity}
              onChange={(e) => onUpdateSettings({ sensitivity: Number(e.target.value) })}
              className="w-full accent-emerald-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>Gentle head tilt</span>
              <span>Subtle eye movement</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-300 font-medium">Scroll Trigger Dwell Time</span>
              <span className="text-emerald-400 font-mono">{settings.dwellTimeMs}ms</span>
            </div>
            <input
              type="range"
              min={300}
              max={1000}
              step={50}
              value={settings.dwellTimeMs}
              onChange={(e) => onUpdateSettings({ dwellTimeMs: Number(e.target.value) })}
              className="w-full accent-emerald-500 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>Fast (300ms)</span>
              <span>Relaxed (1s)</span>
            </div>
          </div>
        </div>

        {/* Feedback Toggles */}
        <div className="space-y-2 pt-2 border-t border-neutral-800">
          <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-800/30 border border-neutral-800 cursor-pointer">
            <div className="flex items-center gap-2.5 text-xs text-neutral-200">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>Audio Sound Chimes on Scroll & Pause</span>
            </div>
            <input
              type="checkbox"
              checked={settings.soundFeedback}
              onChange={(e) => onUpdateSettings({ soundFeedback: e.target.checked })}
              className="w-4 h-4 accent-emerald-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-800/30 border border-neutral-800 cursor-pointer">
            <div className="flex items-center gap-2.5 text-xs text-neutral-200">
              <Vibrate className="w-4 h-4 text-emerald-400" />
              <span>Haptic Vibration Feedback</span>
            </div>
            <input
              type="checkbox"
              checked={settings.hapticFeedback}
              onChange={(e) => onUpdateSettings({ hapticFeedback: e.target.checked })}
              className="w-4 h-4 accent-emerald-500 rounded"
            />
          </label>

          <label className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-800/30 border border-neutral-800 cursor-pointer">
            <div className="flex items-center gap-2.5 text-xs text-neutral-200">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>Show Webcam Picture-in-Picture PIP</span>
            </div>
            <input
              type="checkbox"
              checked={settings.showPip}
              onChange={(e) => onUpdateSettings({ showPip: e.target.checked })}
              className="w-4 h-4 accent-emerald-500 rounded"
            />
          </label>
        </div>

        {/* Quick Calibration Buttons */}
        <div className="pt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCalibration();
            }}
            className="flex-1 py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors border border-neutral-700"
          >
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            <span>Recalibrate Eyes</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="py-2.5 px-3 rounded-xl bg-neutral-800/60 hover:bg-neutral-800 text-xs text-neutral-400 hover:text-white flex items-center justify-center gap-1 transition-colors border border-neutral-800"
            title="Reset to default thresholds"
          >
            {isResetDone ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Reset</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </>
            )}
          </button>
        </div>

        {/* Keyboard Simulation Info */}
        <div className="p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/80 text-[11px] text-neutral-400 space-y-1">
          <div className="flex items-center gap-1 text-neutral-300 font-medium">
            <Keyboard className="w-3.5 h-3.5 text-emerald-400" />
            <span>Testing Shortcuts</span>
          </div>
          <p>
            Press <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 font-mono text-[10px]">↓</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 font-mono text-[10px]">↑</kbd> to simulate look down/up, or <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 font-mono text-[10px]">←</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-200 font-mono text-[10px]">→</kbd> to simulate looking away!
          </p>
        </div>
      </div>
    </div>
  );
};
