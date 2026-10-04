import React, { useRef, useEffect, useState } from 'react';
import { 
  Eye, 
  EyeOff,
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Target, 
  Camera, 
  SlidersHorizontal,
  Pause,
  Play,
  ArrowDown,
  ArrowUp,
  Power,
  Hand
} from 'lucide-react';
import { GazeData, GazeSettings } from '../types';
import { gazeTracker } from '../services/gazeTracker';
import { triggerHaptic } from '../utils/audioFeedback';

interface Props {
  gazeData: GazeData | null;
  videoElement: HTMLVideoElement | null;
  settings: GazeSettings;
  onOpenCalibration: () => void;
  onOpenSettings: () => void;
  onTogglePip: () => void;
  onToggleManualPause?: () => void;
}

export const GazePipOverlay: React.FC<Props> = ({
  gazeData,
  videoElement,
  settings,
  onOpenCalibration,
  onOpenSettings,
  onTogglePip,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const isManualPaused = gazeData?.isManualPaused ?? false;

  const handleTogglePause = (e: React.MouseEvent) => {
    e.stopPropagation();
    gazeTracker.toggleManualPause();
    triggerHaptic(40);
  };

  // Render eye overlay HUD on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isMinimized) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const renderHud = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (videoElement && videoElement.readyState >= 2) {
        // Draw video mirrored horizontally
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, 0, 0, w, h);
        ctx.restore();

        // Dark tint
        ctx.fillStyle = 'rgba(10, 10, 12, 0.35)';
        ctx.fillRect(0, 0, w, h);

        // Draw Spatial Mask Exclusion Zone (Center Head Mask)
        const maskRatio = Math.max(0.15, Math.min(0.70, settings.faceExclusionZoneWidth ?? 0.38));
        const maskW = w * maskRatio;
        const maskX = (w - maskW) / 2;

        const isVisionDebug = Boolean(settings.visionDebugOverlay);

        // Faint red exclusion tint (more prominent in debug mode)
        ctx.fillStyle = isVisionDebug ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0.12)';
        ctx.fillRect(maskX, 0, maskW, h);

        // Dashed border lines
        ctx.strokeStyle = isVisionDebug ? '#ef4444' : 'rgba(239, 68, 68, 0.45)';
        ctx.lineWidth = isVisionDebug ? 2 : 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(maskX, 0);
        ctx.lineTo(maskX, h);
        ctx.moveTo(maskX + maskW, 0);
        ctx.lineTo(maskX + maskW, h);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isVisionDebug) {
          // Label inside head exclusion zone
          ctx.fillStyle = '#f87171';
          ctx.font = 'bold 9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('HEAD EXCLUSION (IGNORED)', maskX + maskW / 2, 12);

          if (gazeData?.handDebug?.headInMaskDetected) {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
            ctx.fillText('👤 Head Motion Muted', maskX + maskW / 2, h / 2);
          }

          // Side Zone Labels
          ctx.fillStyle = '#38bdf8';
          ctx.font = '8px sans-serif';
          ctx.fillText('LEFT ZONE', maskX / 2, 12);
          ctx.fillText('RIGHT ZONE', maskX + maskW + (w - (maskX + maskW)) / 2, 12);

          // Draw Real-time Hand Detection Box
          if (gazeData?.handDebug?.activeHandDetected) {
            const hx = gazeData.handDebug.handCentroidX * w;
            const hy = gazeData.handDebug.handCentroidY * h;
            const boxSize = 34;

            // Detection Box
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.strokeRect(hx - boxSize / 2, hy - boxSize / 2, boxSize, boxSize);

            // Corner brackets
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 2.5;
            const bl = 6;
            // Top-left
            ctx.beginPath(); ctx.moveTo(hx - boxSize/2, hy - boxSize/2 + bl); ctx.lineTo(hx - boxSize/2, hy - boxSize/2); ctx.lineTo(hx - boxSize/2 + bl, hy - boxSize/2); ctx.stroke();
            // Top-right
            ctx.beginPath(); ctx.moveTo(hx + boxSize/2 - bl, hy - boxSize/2); ctx.lineTo(hx + boxSize/2, hy - boxSize/2); ctx.lineTo(hx + boxSize/2, hy - boxSize/2 + bl); ctx.stroke();
            // Bottom-left
            ctx.beginPath(); ctx.moveTo(hx - boxSize/2, hy + boxSize/2 - bl); ctx.lineTo(hx - boxSize/2, hy + boxSize/2); ctx.lineTo(hx - boxSize/2 + bl, hy + boxSize/2); ctx.stroke();
            // Bottom-right
            ctx.beginPath(); ctx.moveTo(hx + boxSize/2 - bl, hy + boxSize/2); ctx.lineTo(hx + boxSize/2, hy + boxSize/2); ctx.lineTo(hx + boxSize/2, hy + boxSize/2 - bl); ctx.stroke();

            // Centroid Dot
            ctx.fillStyle = '#10b981';
            ctx.beginPath();
            ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.fillStyle = '#10b981';
            ctx.font = 'bold 8px monospace';
            ctx.fillText('HAND DETECTED', hx, hy - boxSize / 2 - 3);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`E:${gazeData.handDebug.motionEnergy}`, hx, hy + boxSize / 2 + 9);
          }
        }
      } else {
        // Simulation or waiting screen
        ctx.fillStyle = '#171717';
        ctx.fillRect(0, 0, w, h);
      }

      if (gazeData && gazeData.faceDetected) {
        // Draw Eye / Gaze Crosshair and vector
        const centerX = w / 2;
        const centerY = h / 2;

        // Current gaze point in HUD coordinates
        // normalizedX: -1 (left) to 1 (right)
        // normalizedY: -1 (up) to 1 (down)
        const targetX = centerX + gazeData.normalizedX * (w * 0.38);
        const targetY = centerY + gazeData.normalizedY * (h * 0.38);

        // Center neutral anchor
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
        ctx.stroke();

        // Target Gaze Reticle
        const reticleColor = gazeData.isLookingAway
          ? '#f59e0b' // Amber for paused
          : gazeData.dwellTarget
          ? '#10b981' // Emerald for scrolling
          : '#38bdf8'; // Blue for centered

        // Gaze line vector
        ctx.strokeStyle = reticleColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();

        // Gaze Reticle Point
        ctx.fillStyle = reticleColor;
        ctx.beginPath();
        ctx.arc(targetX, targetY, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Dwell Progress Ring if user is looking down/up
        if (gazeData.dwellProgress > 0) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(
            targetX,
            targetY,
            12,
            -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * gazeData.dwellProgress
          );
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(renderHud);
    };

    animId = requestAnimationFrame(renderHud);
    return () => cancelAnimationFrame(animId);
  }, [videoElement, gazeData, isMinimized]);

  if (!settings.showPip) return null;

  return (
    <div
      className={`fixed top-4 right-4 z-40 transition-all duration-300 ${
        isMinimized ? 'w-12 h-12' : (settings.visionDebugOverlay ? 'w-60 sm:w-72' : 'w-48 sm:w-56')
      }`}
    >
      <div className="relative overflow-hidden rounded-2xl bg-neutral-900/95 border border-neutral-800 shadow-2xl backdrop-blur-md">
        {/* Minimized Pill View */}
        {isMinimized ? (
          <div className="flex items-center">
            <button
              type="button"
              onClick={handleTogglePause}
              className={`w-12 h-12 flex flex-col items-center justify-center transition-colors ${
                isManualPaused
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  : 'text-emerald-400 hover:bg-neutral-800'
              }`}
              title={isManualPaused ? 'Eye-Scroll Paused (Tap to Resume)' : 'Eye-Scroll Active (Tap to Pause for Manual Scrolling)'}
            >
              {isManualPaused ? (
                <>
                  <Hand className="w-4 h-4 text-amber-400" />
                  <span className="text-[8px] font-mono font-bold mt-0.5">HOLD</span>
                </>
              ) : (
                <Eye className="w-5 h-5 animate-pulse" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="p-1 pr-2 text-neutral-400 hover:text-white"
              title="Expand Camera Preview"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div>
            {/* Top Toolbar */}
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-neutral-800 bg-neutral-950/80 text-xs">
              {/* Tap-to-Pause / Manual Mode Quick Switcher */}
              <button
                type="button"
                onClick={handleTogglePause}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium text-[10px] transition-colors border ${
                  isManualPaused
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                }`}
                title="Click to Pause Eye Tracking and scroll manually"
              >
                {isManualPaused ? (
                  <>
                    <Hand className="w-2.5 h-2.5 text-amber-400" />
                    <span>Paused (Manual)</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Eye Scroll ON</span>
                  </>
                )}
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onOpenCalibration}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                  title="Calibrate Eyes"
                >
                  <Target className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                  title="Orientation & Settings"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                  title="Minimize"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Video Canvas */}
            <div className="relative aspect-[4/3] bg-black">
              <canvas
                ref={canvasRef}
                width={200}
                height={150}
                className="w-full h-full object-cover"
              />

              {/* Status Badge Over Video */}
              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between px-2 py-1 rounded-lg bg-black/85 backdrop-blur-sm border border-neutral-800/80 text-[10px] font-mono">
                {isManualPaused ? (
                  <div className="flex items-center gap-1 text-amber-400">
                    <Hand className="w-2.5 h-2.5 text-amber-400" />
                    <span>Manual Mode (Tap to Run)</span>
                  </div>
                ) : gazeData?.isLookingAway ? (
                  <div className="flex items-center gap-1 text-amber-400">
                    <Pause className="w-2.5 h-2.5 fill-amber-400" />
                    <span>Looked Away (Paused)</span>
                  </div>
                ) : gazeData?.dwellTarget === 'up' ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <ArrowUp className="w-2.5 h-2.5 animate-bounce" />
                    <span>
                      {settings.scrollTriggerDirection === 'look-up' ? 'Next Short' : 'Prev Short'} {Math.round((gazeData.dwellProgress || 0) * 100)}%
                    </span>
                  </div>
                ) : gazeData?.dwellTarget === 'down' ? (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <ArrowDown className="w-2.5 h-2.5 animate-bounce" />
                    <span>
                      {settings.scrollTriggerDirection === 'look-up' ? 'Prev Short' : 'Next Short'} {Math.round((gazeData.dwellProgress || 0) * 100)}%
                    </span>
                  </div>
                ) : gazeData?.faceDetected ? (
                  <div className="flex items-center gap-1 text-neutral-300">
                    <Eye className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Eyes Centered</span>
                  </div>
                ) : (
                  <span className="text-neutral-400">Finding eyes...</span>
                )}

                <span className="text-neutral-500 uppercase text-[9px]">
                  {settings.orientation.replace('-', ' ')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
