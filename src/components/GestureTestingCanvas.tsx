import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
  X, 
  RotateCcw, 
  Hand, 
  ShieldAlert, 
  Trash2, 
  Palette, 
  Sliders, 
  Sparkles, 
  ArrowLeft,
  CheckCircle,
  Eye,
  Camera,
  Activity
} from 'lucide-react';
import { GazeData, GazeSettings } from '../types';
import { gazeTracker } from '../services/gazeTracker';

interface GestureTestingCanvasProps {
  settings: GazeSettings;
  onUpdateSettings: (newSettings: Partial<GazeSettings>) => void;
  onBackToSettings: () => void;
  onClose: () => void;
}

interface StrokePoint {
  x: number;
  y: number;
  color: string;
  size: number;
  alpha: number;
}

export const GestureTestingCanvas: React.FC<GestureTestingCanvasProps> = ({
  settings,
  onUpdateSettings,
  onBackToSettings,
  onClose,
}) => {
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gazeData, setGazeData] = useState<GazeData | null>(null);
  const [lastTriggerAction, setLastTriggerAction] = useState<{ text: string; time: number } | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('#38bdf8');
  const [brushSize, setBrushSize] = useState<number>(6);
  const [trailMode, setTrailMode] = useState<'persistent' | 'fading'>('persistent');

  // Drawing state
  const prevPointRef = useRef<{ x: number; y: number } | null>(null);
  const fadingStrokesRef = useRef<StrokePoint[]>([]);

  const colors = [
    { label: 'Cyan', hex: '#38bdf8' },
    { label: 'Emerald', hex: '#10b981' },
    { label: 'Violet', hex: '#c084fc' },
    { label: 'Amber', hex: '#f59e0b' },
    { label: 'Pink', hex: '#f43f5e' },
    { label: 'White', hex: '#ffffff' },
  ];

  // Subscribe to gaze and scroll events
  useEffect(() => {
    const unsubGaze = gazeTracker.addGazeListener((data) => {
      setGazeData(data);
    });

    const unsubScroll = gazeTracker.addScrollListener((direction) => {
      const isUp = direction === 'up';
      setLastTriggerAction({
        text: isUp ? '⬆️ UPWARD FLICK: NEXT SHORT' : '⬇️ DOWNWARD FLICK: PREV SHORT',
        time: Date.now(),
      });
      setTimeout(() => {
        setLastTriggerAction((prev) => (prev && Date.now() - prev.time > 1800 ? null : prev));
      }, 2000);
    });

    return () => {
      unsubGaze();
      unsubScroll();
    };
  }, []);

  // Clear draw canvas
  const handleClearCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fadingStrokesRef.current = [];
    prevPointRef.current = null;
  }, []);

  // 1. Render Left Video & Landmark Canvas
  useEffect(() => {
    const canvas = videoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const renderVideoHud = () => {
      const w = canvas.width;
      const h = canvas.height;
      const video = gazeTracker.getVideoElement();

      ctx.clearRect(0, 0, w, h);

      if (video && video.readyState >= 2) {
        // Draw video mirrored horizontally
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();

        // Dark tint for contrast
        ctx.fillStyle = 'rgba(10, 10, 14, 0.4)';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Camera stream standby...', w / 2, h / 2);
      }

      // Draw Spatial Mask Exclusion Zone (Center Head Mask)
      const maskRatio = Math.max(0.15, Math.min(0.70, settings.faceExclusionZoneWidth ?? 0.38));
      const maskW = w * maskRatio;
      const maskX = (w - maskW) / 2;

      // Center exclusion tint with diagonal stripes
      ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
      ctx.fillRect(maskX, 0, maskW, h);

      // Exclusion boundary lines
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(maskX, 0);
      ctx.lineTo(maskX, h);
      ctx.moveTo(maskX + maskW, 0);
      ctx.lineTo(maskX + maskW, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Exclusion Zone Top Header
      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.fillRect(maskX, 0, maskW, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`🚫 HEAD EXCLUSION ZONE (${Math.round(maskRatio * 100)}%)`, maskX + maskW / 2, 14);

      // Active Peripheral Zone labels
      ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.fillRect(4, 4, maskX - 8, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✋ LEFT HAND ZONE', maskX / 2, 16);

      const rightZoneStart = maskX + maskW;
      const rightZoneW = w - rightZoneStart;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.fillRect(rightZoneStart + 4, 4, rightZoneW - 8, 18);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('✋ RIGHT HAND ZONE', rightZoneStart + rightZoneW / 2, 16);

      // Head motion inside mask indicator
      if (gazeData?.handDebug?.headInMaskDetected) {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.9)';
        ctx.fillRect(maskX + 10, h / 2 - 14, maskW - 20, 28);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('👤 Head Motion Ignored By Mask', maskX + maskW / 2, h / 2 + 4);
      }

      // Draw Hand Landmark Detection Box
      if (gazeData?.handDebug?.activeHandDetected) {
        const hx = gazeData.handDebug.handCentroidX * w;
        const hy = gazeData.handDebug.handCentroidY * h;
        const boxSize = 42;

        // Bounding box
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(hx - boxSize / 2, hy - boxSize / 2, boxSize, boxSize);

        // Corner brackets
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 3;
        const bl = 8;
        // Top-left
        ctx.beginPath(); ctx.moveTo(hx - boxSize/2, hy - boxSize/2 + bl); ctx.lineTo(hx - boxSize/2, hy - boxSize/2); ctx.lineTo(hx - boxSize/2 + bl, hy - boxSize/2); ctx.stroke();
        // Top-right
        ctx.beginPath(); ctx.moveTo(hx + boxSize/2 - bl, hy - boxSize/2); ctx.lineTo(hx + boxSize/2, hy - boxSize/2); ctx.lineTo(hx + boxSize/2, hy - boxSize/2 + bl); ctx.stroke();
        // Bottom-left
        ctx.beginPath(); ctx.moveTo(hx - boxSize/2, hy + boxSize/2 - bl); ctx.lineTo(hx - boxSize/2, hy + boxSize/2); ctx.lineTo(hx - boxSize/2 + bl, hy + boxSize/2); ctx.stroke();
        // Bottom-right
        ctx.beginPath(); ctx.moveTo(hx + boxSize/2 - bl, hy + boxSize/2); ctx.lineTo(hx + boxSize/2, hy + boxSize/2); ctx.lineTo(hx + boxSize/2, hy + boxSize/2 - bl); ctx.stroke();

        // Centroid point
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(hx, hy, 4, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`HAND [${gazeData.handDebug.isLeftZone ? 'LEFT' : 'RIGHT'}]`, hx, hy - boxSize / 2 - 5);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Energy: ${gazeData.handDebug.motionEnergy}`, hx, hy + boxSize / 2 + 12);
      }

      animId = requestAnimationFrame(renderVideoHud);
    };

    animId = requestAnimationFrame(renderVideoHud);
    return () => cancelAnimationFrame(animId);
  }, [settings.faceExclusionZoneWidth, gazeData]);

  // 2. Render Right Touch-less Air Drawing Canvas
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const renderDrawLoop = () => {
      const w = canvas.width;
      const h = canvas.height;

      // Handle fading mode
      if (trailMode === 'fading') {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.15)';
        ctx.fillRect(0, 0, w, h);
      }

      const maskRatio = Math.max(0.15, Math.min(0.70, settings.faceExclusionZoneWidth ?? 0.38));
      const maskStart = 0.5 - maskRatio / 2;
      const maskEnd = 0.5 + maskRatio / 2;

      const hand = gazeData?.handDebug;

      if (hand && hand.activeHandDetected) {
        const curX = hand.handCentroidX * w;
        const curY = hand.handCentroidY * h;

        // Check if hand is inside exclusion zone
        const inMask = hand.handCentroidX >= maskStart && hand.handCentroidX <= maskEnd;

        if (!inMask) {
          if (prevPointRef.current) {
            ctx.strokeStyle = selectedColor;
            ctx.lineWidth = brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowColor = selectedColor;
            ctx.shadowBlur = 10;

            ctx.beginPath();
            ctx.moveTo(prevPointRef.current.x, prevPointRef.current.y);
            ctx.lineTo(curX, curY);
            ctx.stroke();
            ctx.shadowBlur = 0;
          }
          prevPointRef.current = { x: curX, y: curY };
        } else {
          // Inside mask: break stroke
          prevPointRef.current = null;
        }
      } else {
        prevPointRef.current = null;
      }

      animId = requestAnimationFrame(renderDrawLoop);
    };

    animId = requestAnimationFrame(renderDrawLoop);
    return () => cancelAnimationFrame(animId);
  }, [gazeData, selectedColor, brushSize, trailMode, settings.faceExclusionZoneWidth]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-neutral-900 border border-neutral-800 rounded-3xl p-5 text-neutral-100 shadow-2xl space-y-4">
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToSettings}
              className="p-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-lg text-white">Gesture Testing Canvas</h3>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Activity className="w-3 h-3 animate-pulse" />
              Real-time Touch-less Air Brush
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Trigger Banner */}
        {lastTriggerAction && (
          <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 animate-bounce">
            <CheckCircle className="w-4 h-4" />
            <span>{lastTriggerAction.text}</span>
          </div>
        )}

        {/* Split-Screen Main Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Left Side: Raw Video Input & Landmark Visualization */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <span className="font-semibold flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-cyan-400" />
                Raw Video & Spatial Mask HUD
              </span>
              <span className="text-[11px] text-neutral-400">
                Orientation: <span className="text-white capitalize">{settings.orientation}</span>
              </span>
            </div>
            
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-neutral-950 border border-neutral-800 shadow-inner flex items-center justify-center">
              <canvas
                ref={videoCanvasRef}
                width={480}
                height={270}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
              <span>Center head motion is ignored</span>
              <span className="font-mono text-cyan-400">
                Energy: {gazeData?.handDebug?.motionEnergy ?? 0}
              </span>
            </div>
          </div>

          {/* Right Side: Touch-less Air Drawing Canvas */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-300">
              <span className="font-semibold flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-emerald-400" />
                Touch-less Air-Drawing Canvas
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTrailMode(trailMode === 'persistent' ? 'fading' : 'persistent')}
                  className="px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] text-neutral-300 transition-colors"
                >
                  Mode: <span className="font-semibold capitalize text-white">{trailMode}</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearCanvas}
                  className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition-colors"
                  title="Clear Canvas"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                </button>
              </div>
            </div>

            <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-neutral-800 shadow-inner flex items-center justify-center">
              <canvas
                ref={drawCanvasRef}
                width={480}
                height={270}
                className="w-full h-full object-cover"
              />

              {/* Real-time Air Finger Reticle */}
              {gazeData?.handDebug?.activeHandDetected && (
                <div
                  className="absolute pointer-events-none transition-transform duration-75"
                  style={{
                    left: `${gazeData.handDebug.handCentroidX * 100}%`,
                    top: `${gazeData.handDebug.handCentroidY * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 animate-ping"
                    style={{ borderColor: selectedColor }}
                  />
                  <div
                    className="w-2.5 h-2.5 rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ backgroundColor: selectedColor }}
                  />
                </div>
              )}
            </div>

            {/* Drawing Color Selector Bar */}
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1.5">
                {colors.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => setSelectedColor(c.hex)}
                    className={`w-5 h-5 rounded-full transition-transform ${
                      selectedColor === c.hex ? 'scale-125 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.hex }}
                    title={c.label}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                <span>Brush:</span>
                <input
                  type="range"
                  min={2}
                  max={14}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-16 accent-emerald-400 h-1 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Threshold & Mask Refinement Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-neutral-800/80">
          {/* Hand Gesture Sensitivity Slider */}
          <div className="p-3 rounded-2xl bg-neutral-800/40 border border-neutral-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <Hand className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold text-neutral-200">Hand Gesture Sensitivity</span>
              </div>
              <span className="font-mono text-cyan-400 font-bold">
                Level {settings.handGestureSensitivity ?? 6} / 10
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={settings.handGestureSensitivity ?? 6}
              onChange={(e) => onUpdateSettings({ handGestureSensitivity: Number(e.target.value) })}
              className="w-full accent-cyan-400 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>Firm / Close</span>
              <span>Balanced</span>
              <span>Ultra Light / Distance</span>
            </div>
          </div>

          {/* Spatial Mask Slider */}
          <div className="p-3 rounded-2xl bg-neutral-800/40 border border-neutral-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span className="font-semibold text-neutral-200">Head Exclusion Mask</span>
              </div>
              <span className="font-mono text-rose-400 font-bold">
                Center {Math.round((settings.faceExclusionZoneWidth ?? 0.38) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={70}
              step={1}
              value={Math.round((settings.faceExclusionZoneWidth ?? 0.38) * 100)}
              onChange={(e) => onUpdateSettings({ faceExclusionZoneWidth: Number(e.target.value) / 100 })}
              className="w-full accent-rose-400 bg-neutral-800 h-1.5 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-neutral-400">
              <span>Narrow (15%)</span>
              <span>Standard (38%)</span>
              <span>Wide (70%)</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
