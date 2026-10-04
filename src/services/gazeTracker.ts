/**
 * GazeTracker Service
 * Real-time client-side gaze estimation and orientation-aware gesture engine.
 * 100% Free, runs entirely in the user's browser with zero external API costs.
 */

import { CalibrationData, DeviceOrientation, GazeData, GazeDirection, GazeSettings } from '../types';

export type GazeListener = (data: GazeData) => void;
export type ScrollTriggerListener = (direction: 'down' | 'up') => void;
export type PlaybackStateListener = (shouldPause: boolean, reason: 'looked_away' | 'resumed' | 'no_face') => void;

const DEFAULT_CALIBRATION: CalibrationData = {
  centerPitch: 0,
  centerYaw: 0,
  pitchThresholdDown: 0.18, // Pitch threshold to trigger scroll down
  pitchThresholdUp: -0.16,  // Pitch threshold to trigger scroll up
  yawThresholdAway: 0.28,   // Yaw threshold for looking away from screen
  calibratedAt: null,
};

export class GazeTrackerService {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  
  private listeners: Set<GazeListener> = new Set();
  private scrollListeners: Set<ScrollTriggerListener> = new Set();
  private playbackListeners: Set<PlaybackStateListener> = new Set();

  private settings: GazeSettings = {
    orientation: 'portrait',
    scrollTriggerDirection: 'look-up', // Look UP to scroll to next short
    sensitivity: 3,
    handGestureSensitivity: 6,
    faceExclusionZoneWidth: 0.38,
    dwellTimeMs: 550,
    cooldownMs: 1200,
    soundFeedback: true,
    hapticFeedback: true,
    showPip: true,
    visionDebugOverlay: false,
    simulationMode: false,
    autoPlayAudio: false,
  };

  private calibration: CalibrationData = { ...DEFAULT_CALIBRATION };

  // Tracking state
  private isRunning: boolean = false;
  private isManualPaused: boolean = false;
  private lastTimestamp: number = 0;
  private dwellProgress: number = 0;
  private dwellTarget: 'down' | 'up' | null = null;
  private cooldownUntil: number = 0;
  private isCurrentlyPaused: boolean = false;
  private consecutiveAwayFrames: number = 0;
  private consecutiveCenterFrames: number = 0;

  // Filtered values (exponential smoothing)
  private smoothX: number = 0;
  private smoothY: number = 0;
  private lastFaceDetected: boolean = false;

  // MediaPipe FaceMesh instance if loaded
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private faceMesh: any = null;
  private useMediaPipe: boolean = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private lastFaceMeshLandmarks: any[] | null = null;

  // Hand gesture state with spatial mask
  private prevHandLuma: Uint8Array | null = null;
  private prevHandCentroidY: number = -1;
  private lastHandTriggerTime: number = 0;
  private palmSteadyFrames: number = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private currentHandDebug: any = null;

  constructor() {
    this.loadSavedSettings();
  }

  private loadSavedSettings() {
    try {
      const saved = localStorage.getItem('gazeflow_settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
      const savedCalib = localStorage.getItem('gazeflow_calibration');
      if (savedCalib) {
        this.calibration = { ...this.calibration, ...JSON.parse(savedCalib) };
      }
    } catch {
      // Local storage not available
    }
  }

  public saveSettings(newSettings: Partial<GazeSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem('gazeflow_settings', JSON.stringify(this.settings));
    } catch {
      // Ignored
    }
  }

  public getSettings(): GazeSettings {
    return { ...this.settings };
  }

  public getCalibration(): CalibrationData {
    return { ...this.calibration };
  }

  public updateCalibration(calib: Partial<CalibrationData>) {
    this.calibration = { ...this.calibration, ...calib, calibratedAt: Date.now() };
    try {
      localStorage.setItem('gazeflow_calibration', JSON.stringify(this.calibration));
    } catch {
      // Ignored
    }
  }

  public resetCalibration() {
    this.calibration = { ...DEFAULT_CALIBRATION };
    try {
      localStorage.removeItem('gazeflow_calibration');
    } catch {
      // Ignored
    }
  }

  public toggleManualPause(): boolean {
    this.isManualPaused = !this.isManualPaused;
    if (this.isManualPaused) {
      this.dwellProgress = 0;
      this.dwellTarget = null;
    }
    return this.isManualPaused;
  }

  public setManualPaused(paused: boolean) {
    this.isManualPaused = paused;
    if (this.isManualPaused) {
      this.dwellProgress = 0;
      this.dwellTarget = null;
    }
  }

  public getIsManualPaused(): boolean {
    return this.isManualPaused;
  }

  public addGazeListener(listener: GazeListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public addScrollListener(listener: ScrollTriggerListener) {
    this.scrollListeners.add(listener);
    return () => {
      this.scrollListeners.delete(listener);
    };
  }

  public addPlaybackListener(listener: PlaybackStateListener) {
    this.playbackListeners.add(listener);
    return () => {
      this.playbackListeners.delete(listener);
    };
  }

  /**
   * Explicitly requests camera permission and starts the camera stream
   */
  public async enableCamera(videoEl?: HTMLVideoElement): Promise<{ success: boolean; error?: string }> {
    this.settings.simulationMode = false;
    this.saveSettings({ simulationMode: false });

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    try {
      if (videoEl) {
        this.videoElement = videoEl;
      } else if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', 'true');
        this.videoElement.setAttribute('muted', 'true');
      }

      this.canvasElement = document.createElement('canvas');
      this.canvasElement.width = 160;
      this.canvasElement.height = 120;
      this.canvasCtx = this.canvasElement.getContext('2d', { willReadFrequently: true });

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this.isRunning = true;
      this.tryInitMediaPipe();
      this.startLoop();
      return { success: true };
    } catch (err: any) {
      console.warn('Camera permission request failed:', err);
      const errMsg = err?.name === 'NotAllowedError' 
        ? 'Permission denied by user or browser' 
        : err?.name === 'NotFoundError' 
        ? 'No camera found on this device' 
        : 'Could not access camera';
      return { success: false, error: errMsg };
    }
  }

  /**
   * Initializes the video stream and begins tracking
   */
  public async start(videoEl?: HTMLVideoElement): Promise<boolean> {
    if (this.isRunning) return true;

    if (this.settings.simulationMode) {
      this.isRunning = true;
      this.startLoop();
      return true;
    }

    const res = await this.enableCamera(videoEl);
    if (!res.success) {
      this.settings.simulationMode = true;
      this.isRunning = true;
      this.startLoop();
      return false;
    }
    return true;
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  public getLastLandmarks() {
    return this.lastFaceMeshLandmarks;
  }

  /**
   * Attempts to load MediaPipe FaceMesh via CDN asynchronously.
   * If it fails or takes time, the built-in Optical Centroid tracker is already running!
   */
  private async tryInitMediaPipe() {
    if (typeof window === 'undefined') return;
    try {
      // Check if already on window or load script
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      if (!win.FaceMesh) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
        script.async = true;
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      if (win.FaceMesh) {
        this.faceMesh = new win.FaceMesh({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        this.faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true, // includes iris landmarks!
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.faceMesh.onResults((results: any) => {
          if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            this.lastFaceMeshLandmarks = results.multiFaceLandmarks[0];
          } else {
            this.lastFaceMeshLandmarks = null;
          }
        });

        this.useMediaPipe = true;
      }
    } catch {
      // MediaPipe failed or offline; Optical Centroid fallback runs cleanly
      this.useMediaPipe = false;
    }
  }

  /**
   * Main tracking loop running on requestAnimationFrame
   */
  private startLoop() {
    let lastMediaPipeSend = 0;

    const loop = (timestamp: number) => {
      if (!this.isRunning) return;

      const deltaTime = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 0.016;
      this.lastTimestamp = timestamp;

      let rawX = 0;
      let rawY = 0;
      let faceDetected = false;
      let isBlinking = false;
      let confidence = 0.8;

      if (this.settings.simulationMode) {
        // Simulation mode values are fed via simulateGaze()
        rawX = this.smoothX;
        rawY = this.smoothY;
        faceDetected = true;
      } else if (this.videoElement && this.videoElement.readyState >= 2) {
        // Feed frame to MediaPipe if available (throttled to ~30fps for CPU efficiency)
        if (this.useMediaPipe && this.faceMesh && timestamp - lastMediaPipeSend > 33) {
          lastMediaPipeSend = timestamp;
          this.faceMesh.send({ image: this.videoElement }).catch(() => {});
        }

        if (this.lastFaceMeshLandmarks && this.lastFaceMeshLandmarks.length > 468) {
          // Process 3D facial & iris landmarks
          const res = this.processMediaPipeLandmarks(this.lastFaceMeshLandmarks);
          rawX = res.yaw;
          rawY = res.pitch;
          faceDetected = true;
          isBlinking = res.isBlinking;
          confidence = 0.95;
        } else {
          // Process optical image centroid fallback
          const optical = this.processOpticalCentroid();
          rawX = optical.yaw;
          rawY = optical.pitch;
          faceDetected = optical.faceDetected;
          isBlinking = optical.isBlinking;
          confidence = optical.confidence;
        }
      }

      this.processGazeFrame(rawX, rawY, faceDetected, isBlinking, confidence, deltaTime, timestamp);

      // Process peripheral hand gestures with central head spatial mask
      if (this.videoElement && this.videoElement.readyState >= 2 && !this.settings.simulationMode) {
        this.processHandGesturesWithSpatialMask(timestamp);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Spatial Mask Gesture Engine:
   * Normalizes camera coordinates for landscape and portrait orientations before applying
   * the spatial exclusion mask, ensuring that the 'upward' scroll trigger remains consistent
   * regardless of device aspect ratio and camera orientation.
   */
  private processHandGesturesWithSpatialMask(timestamp: number) {
    if (!this.canvasCtx || !this.videoElement || !this.canvasElement) return;

    // Cooldown check
    const cooldown = this.settings.cooldownMs || 1000;
    if (timestamp - this.lastHandTriggerTime < cooldown) return;

    const w = this.canvasElement.width;
    const h = this.canvasElement.height;
    if (w === 0 || h === 0) return;

    const imgData = this.canvasCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Sample 24x24 low-res grid for fast, battery-efficient processing
    const sampleW = 24;
    const sampleH = 24;
    const stepX = Math.floor(w / sampleW);
    const stepY = Math.floor(h / sampleH);

    const currentLuma = new Uint8Array(sampleW * sampleH);
    let totalLuma = 0;

    for (let sy = 0; sy < sampleH; sy++) {
      for (let sx = 0; sx < sampleW; sx++) {
        const px = Math.min(w - 1, sx * stepX);
        const py = Math.min(h - 1, sy * stepY);
        const idx = (py * w + px) * 4;
        const luma = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
        currentLuma[sy * sampleW + sx] = luma;
        totalLuma += luma;
      }
    }

    if (!this.prevHandLuma) {
      this.prevHandLuma = currentLuma;
      return;
    }

    // Adaptive noise floor based on ambient lighting
    const avgAmbient = totalLuma / (sampleW * sampleH);
    const noiseFloor = Math.max(12, Math.floor(avgAmbient / 14));

    // Determine camera and screen orientation
    const orientation = this.settings.orientation;
    const isLandscape = orientation === 'landscape-left' || orientation === 'landscape-right' || (w > h && orientation === 'desktop');
    const aspectRatio = w / h;

    // Configurable Spatial Mask: defined in normalized device screen coordinates (0 to 1)
    const maskRatio = Math.max(0.15, Math.min(0.70, this.settings.faceExclusionZoneWidth ?? 0.38));
    const maskStart = 0.5 - maskRatio / 2;
    const maskEnd = 0.5 + maskRatio / 2;

    let leftDiff = 0;
    let leftWeightedY = 0;
    let rightDiff = 0;
    let rightWeightedY = 0;
    let headInMaskDiff = 0;
    let activeSidePixels = 0;

    for (let sy = 0; sy < sampleH; sy++) {
      for (let sx = 0; sx < sampleW; sx++) {
        // Raw normalized camera coordinate (0 to 1)
        const rawNormX = sx / (sampleW - 1);
        const rawNormY = sy / (sampleH - 1);

        // 1. Transform raw camera coordinates to Normalized Device Screen Space
        let screenX = rawNormX;
        let screenY = rawNormY;

        switch (orientation) {
          case 'portrait':
            screenX = 1 - rawNormX; // Mirrored horizontally for natural hand interaction
            screenY = rawNormY;
            break;
          case 'portrait-inverted':
            screenX = rawNormX;
            screenY = 1 - rawNormY;
            break;
          case 'landscape-left':
            // Rotated 90° anti-clockwise (camera on left):
            // Camera Y maps to screen X, inverted camera X maps to screen Y
            screenX = rawNormY;
            screenY = 1 - rawNormX;
            break;
          case 'landscape-right':
            // Rotated 90° clockwise (camera on right):
            screenX = 1 - rawNormY;
            screenY = rawNormX;
            break;
          case 'desktop':
          default:
            screenX = 1 - rawNormX;
            screenY = rawNormY;
            break;
        }

        const diff = Math.abs(currentLuma[sy * sampleW + sx] - this.prevHandLuma[sy * sampleW + sx]);

        // 2. Apply Spatial Exclusion Mask in Normalized Screen Space
        // Central region (where head and torso are positioned) is ignored
        if (screenX >= maskStart && screenX <= maskEnd) {
          if (diff > noiseFloor) {
            headInMaskDiff += diff;
          }
          continue;
        }

        if (diff > noiseFloor) {
          activeSidePixels++;
          if (screenX < maskStart) {
            // Left Peripheral Hand Zone
            leftDiff += diff;
            leftWeightedY += (screenY * diff);
          } else {
            // Right Peripheral Hand Zone
            rightDiff += diff;
            rightWeightedY += (screenY * diff);
          }
        }
      }
    }
    this.prevHandLuma = currentLuma;

    const dominantDiff = Math.max(leftDiff, rightDiff);
    const isLeft = leftDiff > rightDiff;
    const dominantWeightedY = isLeft ? leftWeightedY : rightWeightedY;

    // Sensitivity threshold mapping (Level 1 to 10)
    const sensLevel = this.settings.handGestureSensitivity ?? 6;
    const minEnergy = Math.max(85, 300 - (sensLevel * 20));

    // Update vision debug snapshot
    const activeHand = dominantDiff >= minEnergy;
    const handX = isLeft ? (maskStart * 0.5) : (maskEnd + (1.0 - maskEnd) * 0.5);
    const handY = dominantDiff > 0 ? (dominantWeightedY / dominantDiff) : 0.5;

    this.currentHandDebug = {
      activeHandDetected: activeHand,
      handCentroidX: handX,
      handCentroidY: handY,
      isLeftZone: isLeft,
      activePixels: activeSidePixels,
      motionEnergy: Math.round(dominantDiff),
      headInMaskDetected: headInMaskDiff > 40,
      spatialMask: {
        startRatio: maskStart,
        endRatio: maskEnd,
        widthRatio: maskRatio,
      },
    };

    if (dominantDiff < minEnergy) {
      this.palmSteadyFrames = Math.max(0, this.palmSteadyFrames - 1);
      this.prevHandCentroidY = -1;
      return;
    }

    // 1. Palm Pause Detection (Coverage in active side zone + steady dwell)
    if (activeSidePixels > 24) {
      this.palmSteadyFrames++;
      if (this.palmSteadyFrames >= 3) {
        this.palmSteadyFrames = 0;
        this.prevHandCentroidY = -1;
        this.lastHandTriggerTime = timestamp;
        this.toggleManualPause();
        return;
      }
    } else {
      this.palmSteadyFrames = Math.max(0, this.palmSteadyFrames - 1);
    }

    // 2. Trajectory Flick (Up / Down) in Normalized Screen Space
    // screenY: 0 is TOP of physical screen, 1 is BOTTOM of physical screen
    const currentCentroidY = dominantWeightedY / dominantDiff;

    if (this.prevHandCentroidY < 0) {
      this.prevHandCentroidY = currentCentroidY;
      return;
    }

    // Moving UP in physical space results in positive deltaY
    const deltaY = this.prevHandCentroidY - currentCentroidY;

    // Aspect-ratio normalized flick threshold:
    // In landscape orientation, vertical screen height is shorter relative to width,
    // so we scale the threshold by aspect ratio factor to keep physical gesture distance uniform.
    const baseThreshold = Math.max(0.08, 0.22 - (sensLevel * 0.014));
    const aspectCompensation = isLandscape ? Math.min(1.4, Math.max(1.1, aspectRatio * 0.75)) : 1.0;
    const flickThreshold = baseThreshold * aspectCompensation;

    if (Math.abs(deltaY) > flickThreshold) {
      this.lastHandTriggerTime = timestamp;
      this.prevHandCentroidY = -1;

      if (deltaY > 0) {
        // Hand flicked UP -> Trigger Next Short
        this.triggerScroll('up', timestamp);
      } else {
        // Hand flicked DOWN -> Trigger Prev Short
        this.triggerScroll('down', timestamp);
      }
    }
  }

  /**
   * Helper to retrieve current spatial mask boundaries for UI overlays
   */
  public getSpatialMaskBounds() {
    const maskRatio = Math.max(0.15, Math.min(0.70, this.settings.faceExclusionZoneWidth ?? 0.38));
    return {
      startRatio: 0.5 - maskRatio / 2,
      endRatio: 0.5 + maskRatio / 2,
      widthRatio: maskRatio,
    };
  }

  /**
   * Processes high-precision MediaPipe Face Landmarks + Iris
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processMediaPipeLandmarks(landmarks: any[]) {
    // Landmark indices:
    // Left eye inner: 133, outer: 33, top lid: 159, bottom lid: 145, iris center: 468
    // Right eye inner: 362, outer: 263, top lid: 386, bottom lid: 374, iris center: 473
    // Nose tip: 1, Chin: 152, Forehead: 10
    const nose = landmarks[1];
    const forehead = landmarks[10];
    const chin = landmarks[152];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];

    // Head Pitch (Vertical head angle relative to screen)
    // Distance from forehead to nose vs nose to chin
    const upperDist = Math.abs(forehead.y - nose.y);
    const lowerDist = Math.abs(nose.y - chin.y) || 0.001;
    const facePitchRatio = (upperDist / lowerDist) - 1.0;

    // Head Yaw (Horizontal turn)
    const leftCheekDist = Math.abs(nose.x - leftCheek.x);
    const rightCheekDist = Math.abs(rightCheek.x - nose.x) || 0.001;
    const faceYawRatio = (leftCheekDist / rightCheekDist) - 1.0;

    // Iris relative position within eye boundaries (fine gaze)
    let irisPitch = 0;
    let irisYaw = 0;

    if (landmarks.length >= 478) {
      const leftIris = landmarks[468];
      const leftEyeTop = landmarks[159];
      const leftEyeBottom = landmarks[145];
      const leftEyeInner = landmarks[133];
      const leftEyeOuter = landmarks[33];

      const leftEyeHeight = Math.abs(leftEyeBottom.y - leftEyeTop.y) || 0.001;
      const leftEyeWidth = Math.abs(leftEyeOuter.x - leftEyeInner.x) || 0.001;

      // Iris vertical: 0.5 is center, >0.5 looking down, <0.5 looking up
      const leftIrisY = (leftIris.y - leftEyeTop.y) / leftEyeHeight - 0.5;
      const leftIrisX = (leftIris.x - leftEyeOuter.x) / leftEyeWidth - 0.5;

      irisPitch = leftIrisY * 0.8;
      irisYaw = leftIrisX * 0.8;
    }

    // Blink detection: EAR (Eye Aspect Ratio)
    const leftTop = landmarks[159];
    const leftBottom = landmarks[145];
    const leftOuter = landmarks[33];
    const leftInner = landmarks[133];
    const eyeOpenness = Math.abs(leftBottom.y - leftTop.y) / (Math.abs(leftInner.x - leftOuter.x) || 0.001);
    const isBlinking = eyeOpenness < 0.16;

    // Fused pitch and yaw (Head pose + Iris movement)
    const combinedPitch = facePitchRatio * 0.65 + irisPitch * 0.35;
    const combinedYaw = faceYawRatio * 0.7 + irisYaw * 0.3;

    return {
      pitch: combinedPitch,
      yaw: combinedYaw,
      isBlinking,
    };
  }

  /**
   * Fast, zero-dependency Optical Centroid Tracker running on HTML5 Canvas
   * Analyzes facial luminance, eye region darkness centroid and head motion.
   */
  private processOpticalCentroid() {
    if (!this.canvasCtx || !this.videoElement || !this.canvasElement) {
      return { pitch: 0, yaw: 0, faceDetected: false, isBlinking: false, confidence: 0 };
    }

    const w = this.canvasElement.width;
    const h = this.canvasElement.height;

    this.canvasCtx.drawImage(this.videoElement, 0, 0, w, h);
    const imgData = this.canvasCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Scan for face-like skin luminance in central ROI
    let skinPixels = 0;
    let sumX = 0;
    let sumY = 0;

    // Eye ROI search in upper half
    let eyeDarknessSumX = 0;
    let eyeDarknessSumY = 0;
    let eyeDarknessCount = 0;

    for (let y = 15; y < h - 15; y += 2) {
      for (let x = 20; x < w - 20; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Simple skin luminance heuristic
        const isSkin = r > 60 && g > 40 && b > 20 && r > g && r > b && (r - g) > 10;
        if (isSkin) {
          skinPixels++;
          sumX += x;
          sumY += y;

          // Upper region where eyes typically sit
          if (y < h * 0.55 && y > h * 0.25) {
            const brightness = (r + g + b) / 3;
            // Eyes/eyeballs/pupils are notably darker than surrounding skin
            if (brightness < 85) {
              eyeDarknessSumX += x;
              eyeDarknessSumY += y;
              eyeDarknessCount++;
            }
          }
        }
      }
    }

    const faceDetected = skinPixels > 250;
    if (!faceDetected) {
      return { pitch: 0, yaw: 0, faceDetected: false, isBlinking: false, confidence: 0 };
    }

    const faceCenterX = sumX / skinPixels;
    const faceCenterY = sumY / skinPixels;

    // Relative to canvas center (-1 to 1)
    const normFaceX = (faceCenterX - w / 2) / (w / 2);
    const normFaceY = (faceCenterY - h / 2) / (h / 2);

    // Eye displacement relative to face center
    let eyeOffsetPitch = 0;
    if (eyeDarknessCount > 20) {
      const eyeCenterY = eyeDarknessSumY / eyeDarknessCount;
      const expectedEyeY = faceCenterY - h * 0.12;
      eyeOffsetPitch = (eyeCenterY - expectedEyeY) / (h * 0.15);
    }

    // Pitch: positive is looking down, negative is looking up
    const pitch = normFaceY * 0.6 + eyeOffsetPitch * 0.4;
    // Yaw: positive is looking right, negative looking left
    const yaw = normFaceX * 0.8;

    return {
      pitch,
      yaw,
      faceDetected: true,
      isBlinking: false,
      confidence: 0.75,
    };
  }

  /**
   * Applies device orientation mapping, calibration offsets, dwell timing, and fires events
   */
  private processGazeFrame(
    rawX: number,
    rawY: number,
    faceDetected: boolean,
    isBlinking: boolean,
    confidence: number,
    deltaTime: number,
    now: number
  ) {
    // 1. Apply calibration offsets
    const calibratedPitch = rawY - this.calibration.centerPitch;
    const calibratedYaw = rawX - this.calibration.centerYaw;

    // 2. Transform axes based on holding orientation!
    // This answers the user's primary requirement: mapping camera position (portrait, landscape-left, etc.)
    let orientedPitch = calibratedPitch;
    let orientedYaw = calibratedYaw;

    switch (this.settings.orientation) {
      case 'portrait':
        // Standard: Camera at top
        orientedPitch = calibratedPitch;
        orientedYaw = calibratedYaw;
        break;
      case 'portrait-inverted':
        // Phone held upside down: Camera at bottom
        orientedPitch = -calibratedPitch;
        orientedYaw = -calibratedYaw;
        break;
      case 'landscape-left':
        // Rotated counter-clockwise: Camera is on user's LEFT side
        // Screen vertical axis corresponds to camera horizontal axis
        orientedPitch = calibratedYaw;
        orientedYaw = -calibratedPitch;
        break;
      case 'landscape-right':
        // Rotated clockwise: Camera is on user's RIGHT side
        orientedPitch = -calibratedYaw;
        orientedYaw = calibratedPitch;
        break;
      case 'desktop':
        // Laptop/Desktop monitor: Camera at top
        orientedPitch = calibratedPitch * 1.1;
        orientedYaw = calibratedYaw * 1.1;
        break;
    }

    // 3. Sensitivity multiplier (1 = low, 3 = normal, 5 = high)
    const sensFactor = 0.6 + (this.settings.sensitivity * 0.2);
    const scaledPitch = orientedPitch * sensFactor;
    const scaledYaw = orientedYaw * sensFactor;

    // 4. Smooth values via Exponential Moving Average (EMA)
    const smoothingAlpha = 0.35;
    this.smoothX = this.smoothX + (scaledYaw - this.smoothX) * smoothingAlpha;
    this.smoothY = this.smoothY + (scaledPitch - this.smoothY) * smoothingAlpha;

    // 5. Evaluate state & direction
    const isLookingAway = 
      !faceDetected ||
      Math.abs(this.smoothX) > this.calibration.yawThresholdAway;

    let direction: GazeDirection = 'center';
    if (!faceDetected) {
      direction = 'none';
    } else if (isLookingAway) {
      direction = this.smoothX > 0 ? 'right' : 'left';
    } else if (this.smoothY > this.calibration.pitchThresholdDown) {
      direction = 'down';
    } else if (this.smoothY < this.calibration.pitchThresholdUp) {
      direction = 'up';
    }

    // 6. Handle Look-Away Auto-Pause & Resume
    if (isLookingAway) {
      this.consecutiveAwayFrames++;
      this.consecutiveCenterFrames = 0;
      // Require 3 consecutive frames to prevent momentary jitter
      if (this.consecutiveAwayFrames >= 3 && !this.isCurrentlyPaused) {
        this.isCurrentlyPaused = true;
        this.notifyPlayback(true, faceDetected ? 'looked_away' : 'no_face');
      }
      // Reset dwell when looking away
      this.dwellProgress = 0;
      this.dwellTarget = null;
    } else {
      this.consecutiveCenterFrames++;
      this.consecutiveAwayFrames = 0;
      if (this.consecutiveCenterFrames >= 3 && this.isCurrentlyPaused) {
        this.isCurrentlyPaused = false;
        this.notifyPlayback(false, 'resumed');
      }
    }

    // 7. Handle Gaze Dwell for Scroll (Ignore during manual pause, blinks, or cooldown)
    const inCooldown = now < this.cooldownUntil;

    if (!this.isManualPaused && !isLookingAway && !isBlinking && !inCooldown) {
      if (direction === 'up' || direction === 'down') {
        this.dwellTarget = direction;
        const progressRate = (deltaTime * 1000) / this.settings.dwellTimeMs;
        this.dwellProgress = Math.min(1, this.dwellProgress + progressRate);

        if (this.dwellProgress >= 1) {
          // Trigger Scroll!
          this.triggerScroll(direction, now);
          this.dwellProgress = 0;
          this.dwellTarget = null;
        }
      } else {
        // Gaze is centered: quickly decay dwell progress
        this.dwellProgress = Math.max(0, this.dwellProgress - deltaTime * 3);
        if (this.dwellProgress === 0) {
          this.dwellTarget = null;
        }
      }
    } else {
      this.dwellProgress = 0;
      this.dwellTarget = null;
    }

    this.lastFaceDetected = faceDetected;

    // 8. Emit GazeData to listeners
    const gazeData: GazeData = {
      direction,
      normalizedX: Math.max(-1, Math.min(1, this.smoothX)),
      normalizedY: Math.max(-1, Math.min(1, this.smoothY)),
      confidence,
      faceDetected,
      isBlinking,
      isLookingAway,
      isManualPaused: this.isManualPaused,
      dwellProgress: this.dwellProgress,
      dwellTarget: this.dwellTarget,
      rawPitch: rawY,
      rawYaw: rawX,
      handDebug: this.currentHandDebug,
    };

    this.listeners.forEach((listener) => {
      try {
        listener(gazeData);
      } catch (err) {
        console.error('Error in gaze listener:', err);
      }
    });
  }

  private triggerScroll(direction: 'down' | 'up', now: number) {
    this.cooldownUntil = now + this.settings.cooldownMs;
    this.scrollListeners.forEach((listener) => {
      try {
        listener(direction);
      } catch (err) {
        console.error('Error in scroll listener:', err);
      }
    });
  }

  private notifyPlayback(shouldPause: boolean, reason: 'looked_away' | 'resumed' | 'no_face') {
    this.playbackListeners.forEach((listener) => {
      try {
        listener(shouldPause, reason);
      } catch (err) {
        console.error('Error in playback listener:', err);
      }
    });
  }

  /**
   * Manual Gaze Simulation for testing without a webcam or with keyboard
   */
  public simulateGaze(x: number, y: number) {
    this.smoothX = x;
    this.smoothY = y;
  }
}

export const gazeTracker = new GazeTrackerService();
