import React, { useState, useEffect, useRef } from 'react';
import { Check, Sparkles, X, Target } from 'lucide-react';
import { CalibrationData, GazeData } from '../types';
import { audioFeedback } from '../utils/audioFeedback';

interface Props {
  isOpen: boolean;
  onComplete: (data: Partial<CalibrationData>) => void;
  onSkip: () => void;
  lastGazeData: GazeData | null;
}

type CalibrationStep = 'center' | 'down' | 'up' | 'away' | 'complete';

export const GazeCalibrationModal: React.FC<Props> = ({
  isOpen,
  onComplete,
  onSkip,
  lastGazeData,
}) => {
  const [currentStep, setCurrentStep] = useState<CalibrationStep>('center');
  const [progress, setProgress] = useState(0);

  // Collected samples
  const samplesRef = useRef<{ pitch: number[]; yaw: number[] }>({ pitch: [], yaw: [] });
  const recordedDataRef = useRef<{
    centerPitch: number;
    centerYaw: number;
    pitchDown: number;
    pitchUp: number;
    yawAway: number;
  }>({
    centerPitch: 0,
    centerYaw: 0,
    pitchDown: 0.18,
    pitchUp: -0.16,
    yawAway: 0.28,
  });

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('center');
      setProgress(0);
      samplesRef.current = { pitch: [], yaw: [] };
      return;
    }
  }, [isOpen]);

  // Collect gaze samples during step
  useEffect(() => {
    if (!isOpen || currentStep === 'complete' || !lastGazeData) return;

    if (lastGazeData.rawPitch !== undefined && lastGazeData.rawYaw !== undefined) {
      samplesRef.current.pitch.push(lastGazeData.rawPitch);
      samplesRef.current.yaw.push(lastGazeData.rawYaw);
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 5;
        if (next >= 100) {
          // Process collected step
          handleStepFinish();
          return 0;
        }
        return next;
      });
    }, 60);

    return () => clearInterval(interval);
  }, [isOpen, currentStep, lastGazeData]);

  const handleStepFinish = () => {
    const pSamples = samplesRef.current.pitch;
    const ySamples = samplesRef.current.yaw;

    const avgPitch = pSamples.length > 0 ? pSamples.reduce((a, b) => a + b, 0) / pSamples.length : 0;
    const avgYaw = ySamples.length > 0 ? ySamples.reduce((a, b) => a + b, 0) / ySamples.length : 0;

    audioFeedback.playCalibrationPoint();

    if (currentStep === 'center') {
      recordedDataRef.current.centerPitch = avgPitch;
      recordedDataRef.current.centerYaw = avgYaw;
      samplesRef.current = { pitch: [], yaw: [] };
      setCurrentStep('down');
    } else if (currentStep === 'down') {
      const diff = avgPitch - recordedDataRef.current.centerPitch;
      recordedDataRef.current.pitchDown = Math.max(0.12, Math.abs(diff) * 0.7);
      samplesRef.current = { pitch: [], yaw: [] };
      setCurrentStep('up');
    } else if (currentStep === 'up') {
      const diff = avgPitch - recordedDataRef.current.centerPitch;
      recordedDataRef.current.pitchUp = -Math.max(0.12, Math.abs(diff) * 0.7);
      samplesRef.current = { pitch: [], yaw: [] };
      setCurrentStep('away');
    } else if (currentStep === 'away') {
      const diff = avgYaw - recordedDataRef.current.centerYaw;
      recordedDataRef.current.yawAway = Math.max(0.2, Math.abs(diff) * 0.75);
      setCurrentStep('complete');
      setTimeout(() => {
        onComplete({
          centerPitch: recordedDataRef.current.centerPitch,
          centerYaw: recordedDataRef.current.centerYaw,
          pitchThresholdDown: recordedDataRef.current.pitchDown,
          pitchThresholdUp: recordedDataRef.current.pitchUp,
          yawThresholdAway: recordedDataRef.current.yawAway,
        });
      }, 900);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 text-neutral-100 shadow-2xl text-center space-y-6">
        <button
          type="button"
          onClick={onSkip}
          className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          title="Skip calibration"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 pt-2">
          {(['center', 'down', 'up', 'away'] as const).map((step, idx) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                currentStep === step
                  ? 'w-8 bg-emerald-400'
                  : currentStep === 'complete' || (['center', 'down', 'up', 'away'].indexOf(currentStep) > idx)
                  ? 'w-4 bg-emerald-600'
                  : 'w-4 bg-neutral-800'
              }`}
            />
          ))}
        </div>

        {/* Content per Step */}
        <div className="space-y-3 min-h-[160px] flex flex-col items-center justify-center">
          {currentStep === 'center' && (
            <>
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-ping" />
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400">
                  <Target className="w-6 h-6 animate-pulse" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white">Look at Center</h3>
              <p className="text-xs text-neutral-400 max-w-xs">
                Look naturally at this dot to set your neutral gaze baseline.
              </p>
            </>
          )}

          {currentStep === 'down' && (
            <>
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 translate-y-3 transition-transform">
                  <span className="text-lg font-bold">⬇️</span>
                </div>
              </div>
              <h3 className="text-xl font-bold text-white">Look Down</h3>
              <p className="text-xs text-neutral-400 max-w-xs">
                Look towards the bottom edge of your screen. This triggers scroll to next short.
              </p>
            </>
          )}

          {currentStep === 'up' && (
            <>
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 -translate-y-3 transition-transform">
                  <span className="text-lg font-bold">⬆️</span>
                </div>
              </div>
              <h3 className="text-xl font-bold text-white">Look Up</h3>
              <p className="text-xs text-neutral-400 max-w-xs">
                Look towards the top of your screen to trigger scroll to previous short.
              </p>
            </>
          )}

          {currentStep === 'away' && (
            <>
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400">
                  <span className="text-lg font-bold">👀</span>
                </div>
              </div>
              <h3 className="text-xl font-bold text-white">Look Away</h3>
              <p className="text-xs text-neutral-400 max-w-xs">
                Glance off-screen to the left or right. This automatically pauses playback!
              </p>
            </>
          )}

          {currentStep === 'complete' && (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>
              <h3 className="text-xl font-bold text-white">Eyes Calibrated!</h3>
              <p className="text-xs text-emerald-400">
                Custom eye thresholds saved successfully. Enjoy hands-free viewing!
              </p>
            </>
          )}
        </div>

        {/* Circular / Linear Progress Bar */}
        {currentStep !== 'complete' && (
          <div className="space-y-1.5">
            <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-75"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] text-neutral-400 font-mono">
              Calibrating... {Math.round(progress)}%
            </span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors py-2 px-3"
          >
            Skip (Use Defaults)
          </button>
          <span className="text-[11px] text-neutral-400 font-mono">
            {lastGazeData?.faceDetected ? 'Face Tracking Active' : 'Align face in camera'}
          </span>
        </div>
      </div>
    </div>
  );
};
