/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Check, AlertTriangle, Eye, RefreshCw } from 'lucide-react';
import { INITIAL_REELS } from './data/mockReels';
import { CalibrationData, DeviceOrientation, FeedMode, GazeData, GazeSettings, ReelItem } from './types';
import { gazeTracker } from './services/gazeTracker';
import { audioFeedback, triggerHaptic } from './utils/audioFeedback';
import { ShortsPlayer } from './components/ShortsPlayer';
import { YouTubeShortsFeed } from './components/YouTubeShortsFeed';
import { GazePipOverlay } from './components/GazePipOverlay';
import { OrientationSetupModal } from './components/OrientationSetupModal';
import { GazeCalibrationModal } from './components/GazeCalibrationModal';
import { SettingsModal } from './components/SettingsModal';
import { VirtualGazeStick } from './components/VirtualGazeStick';
import { NativeAppExplainerModal } from './components/NativeAppExplainerModal';

export default function App() {
  const [feedMode, setFeedMode] = useState<FeedMode>('curated');
  const [reels] = useState<ReelItem[]>(INITIAL_REELS);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [gazeData, setGazeData] = useState<GazeData | null>(null);
  const [settings, setSettings] = useState<GazeSettings>(gazeTracker.getSettings());
  const [isPausedByGaze, setIsPausedByGaze] = useState<boolean>(false);

  // Camera Permission state
  const [cameraState, setCameraState] = useState<'prompt' | 'active' | 'denied' | 'simulated'>('prompt');
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);

  // Modals state: On first launch, open orientation setup as requested by user!
  const [isOrientationSetupOpen, setIsOrientationSetupOpen] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('gazeflow_orientation_configured');
    } catch {
      return true;
    }
  });
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isExplainerOpen, setIsExplainerOpen] = useState<boolean>(false);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  // Reference for index in listeners
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;

  const reelsCount = reels.length;

  const navigateTo = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < reelsCount) {
      setCurrentIndex(newIndex);
    }
  }, [reelsCount]);

  // Subscribe to GazeTracker events
  useEffect(() => {
    // 1. Gaze coordinate and status stream
    const unsubscribeGaze = gazeTracker.addGazeListener((data) => {
      setGazeData(data);
    });

    // 2. Scroll trigger (Look Up -> Next Short, Look Down -> Prev Short)
    const unsubscribeScroll = gazeTracker.addScrollListener((direction) => {
      const cur = currentIndexRef.current;
      const currentSettings = gazeTracker.getSettings();
      const isLookUpNext = (currentSettings.scrollTriggerDirection || 'look-up') === 'look-up';
      const isNext = (isLookUpNext && direction === 'up') || (!isLookUpNext && direction === 'down');

      if (isNext) {
        if (cur < reelsCount - 1) {
          navigateTo(cur + 1);
          audioFeedback.playScrollDown();
          triggerHaptic(50);
        }
      } else {
        if (cur > 0) {
          navigateTo(cur - 1);
          audioFeedback.playScrollUp();
          triggerHaptic(40);
        }
      }
    });

    // 3. Playback pause / resume listener (Look Away -> Pause)
    const unsubscribePlayback = gazeTracker.addPlaybackListener((shouldPause) => {
      setIsPausedByGaze(shouldPause);
      if (shouldPause) {
        audioFeedback.playLookAwayPause();
        triggerHaptic(30);
      } else {
        audioFeedback.playResume();
      }
    });

    // Start tracker if orientation was previously configured
    if (!isOrientationSetupOpen) {
      gazeTracker.start().then((success) => {
        if (success && !gazeTracker.getSettings().simulationMode) {
          setCameraState('active');
          setVideoEl(gazeTracker.getVideoElement());
        } else {
          setCameraState('simulated');
        }
      });
    }

    return () => {
      unsubscribeGaze();
      unsubscribeScroll();
      unsubscribePlayback();
      gazeTracker.stop();
    };
  }, [isOrientationSetupOpen, navigateTo, reelsCount]);

  // Explicitly prompt user for Camera Permission
  const handleRequestCamera = async () => {
    setCameraNotice('Requesting camera access...');
    const res = await gazeTracker.enableCamera();
    if (res.success) {
      setCameraState('active');
      setVideoEl(gazeTracker.getVideoElement());
      setSettings(gazeTracker.getSettings());
      setCameraNotice('Camera Active: Eye tracking enabled!');
      setTimeout(() => setCameraNotice(null), 3000);
    } else {
      setCameraState('denied');
      setCameraNotice(res.error || 'Camera blocked. Please check browser permission.');
      setTimeout(() => setCameraNotice(null), 5000);
    }
  };

  // Handle Orientation Setup Confirmation
  const handleOrientationConfirm = async (
    orientation: DeviceOrientation,
    startWithCalibration: boolean
  ) => {
    const updated = { ...settings, orientation, simulationMode: false };
    setSettings(updated);
    gazeTracker.saveSettings(updated);
    try {
      localStorage.setItem('gazeflow_orientation_configured', 'true');
    } catch {
      // Ignored
    }
    setIsOrientationSetupOpen(false);

    // Prompt for camera
    const res = await gazeTracker.enableCamera();
    if (res.success) {
      setCameraState('active');
      setVideoEl(gazeTracker.getVideoElement());
    } else {
      setCameraState('denied');
      setCameraNotice('Camera access was not granted. Running in virtual mode.');
      setTimeout(() => setCameraNotice(null), 4000);
    }

    if (startWithCalibration) {
      setIsCalibrationOpen(true);
    }
  };

  // Handle Simulation Mode fallback
  const handleUseSimulation = async () => {
    const updated = { ...settings, simulationMode: true };
    setSettings(updated);
    gazeTracker.saveSettings(updated);
    try {
      localStorage.setItem('gazeflow_orientation_configured', 'true');
    } catch {
      // Ignored
    }
    setIsOrientationSetupOpen(false);
    setCameraState('simulated');
    await gazeTracker.start();
  };

  const handleUpdateSettings = (newSettings: Partial<GazeSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    gazeTracker.saveSettings(updated);
    audioFeedback.setMuted(!updated.soundFeedback);
  };

  const handleCalibrationComplete = (calibData: Partial<CalibrationData>) => {
    gazeTracker.updateCalibration(calibData);
    setIsCalibrationOpen(false);
  };

  const handleResetCalibration = () => {
    gazeTracker.resetCalibration();
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-neutral-950 text-neutral-100 flex items-center justify-center font-sans">
      {/* CAMERA PERMISSION STATUS NOTIFIER */}
      {cameraNotice && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-neutral-900 border border-neutral-700 shadow-2xl text-xs flex items-center gap-2 animate-fade-in">
          {cameraState === 'active' ? (
            <Check className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          )}
          <span className="font-medium text-white">{cameraNotice}</span>
        </div>
      )}

      {/* Grant Camera Prompt Banner if running in simulation */}
      {cameraState !== 'active' && !isOrientationSetupOpen && !cameraNotice && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 px-3.5 py-1.5 rounded-full bg-neutral-900/90 border border-amber-500/40 shadow-xl backdrop-blur-md text-[11px] flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-amber-300">
            <Camera className="w-3.5 h-3.5" />
            <span>Virtual Mode Active</span>
          </div>
          <button
            type="button"
            onClick={handleRequestCamera}
            className="px-2.5 py-0.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-semibold transition-colors flex items-center gap-1"
          >
            <span>Grant Camera Permission</span>
          </button>
        </div>
      )}

      {/* Central Short-form Video Feed Player (Curated vs Real YouTube Shorts) */}
      {feedMode === 'youtube' ? (
        <YouTubeShortsFeed
          gazeData={gazeData}
          settings={settings}
          isPausedByGaze={isPausedByGaze}
          onNavigateNext={() => {
            audioFeedback.playScrollDown();
            triggerHaptic(50);
          }}
          onNavigatePrev={() => {
            audioFeedback.playScrollUp();
            triggerHaptic(40);
          }}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenOrientationSetup={() => setIsOrientationSetupOpen(true)}
          onOpenExplainer={() => setIsExplainerOpen(true)}
          onSwitchToCurated={() => setFeedMode('curated')}
          onSelectOrientation={(ori) => handleUpdateSettings({ orientation: ori })}
        />
      ) : (
        <ShortsPlayer
          reels={reels}
          currentIndex={currentIndex}
          gazeData={gazeData}
          settings={settings}
          isPausedByGaze={isPausedByGaze}
          onNavigate={navigateTo}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenOrientationSetup={() => setIsOrientationSetupOpen(true)}
          onOpenCalibration={() => setIsCalibrationOpen(true)}
          onSwitchToYouTube={() => setFeedMode('youtube')}
          onOpenExplainer={() => setIsExplainerOpen(true)}
          onSelectOrientation={(ori) => handleUpdateSettings({ orientation: ori })}
        />
      )}

      {/* Picture-in-Picture Webcam Gaze HUD */}
      <GazePipOverlay
        gazeData={gazeData}
        videoElement={videoEl}
        settings={settings}
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onTogglePip={() => handleUpdateSettings({ showPip: !settings.showPip })}
      />

      {/* Virtual Gaze Stick (Touch Joystick + Keyboard shortcuts helper) */}
      <VirtualGazeStick
        isSimulationActive={settings.simulationMode}
        onToggleSimulation={() => handleUpdateSettings({ simulationMode: !settings.simulationMode })}
      />

      {/* Device Orientation Setup Modal (Prompts user on start) */}
      <OrientationSetupModal
        isOpen={isOrientationSetupOpen}
        currentSettings={settings}
        onConfirm={handleOrientationConfirm}
        onUseSimulation={handleUseSimulation}
        onClose={() => setIsOrientationSetupOpen(false)}
      />

      {/* Gaze Calibration Wizard Modal */}
      <GazeCalibrationModal
        isOpen={isCalibrationOpen}
        lastGazeData={gazeData}
        onComplete={handleCalibrationComplete}
        onSkip={() => setIsCalibrationOpen(false)}
      />

      {/* Settings & Tuning Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onOpenCalibration={() => setIsCalibrationOpen(true)}
        onResetCalibration={handleResetCalibration}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Native App Explainer & Architecture Guide Modal */}
      <NativeAppExplainerModal
        isOpen={isExplainerOpen}
        onClose={() => setIsExplainerOpen(false)}
        onSwitchToYouTubeMode={() => {
          setIsExplainerOpen(false);
          setFeedMode('youtube');
        }}
      />
    </div>
  );
}
