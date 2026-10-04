export type DeviceOrientation = 
  | 'portrait'           // Camera at top (standard phone)
  | 'portrait-inverted'  // Camera at bottom
  | 'landscape-left'     // Phone rotated left, camera on left
  | 'landscape-right'    // Phone rotated right, camera on right
  | 'desktop';           // Laptop/Monitor with camera at top

export type GazeDirection = 'center' | 'down' | 'up' | 'left' | 'right' | 'away' | 'none';

export interface GazeData {
  direction: GazeDirection;
  normalizedX: number; // -1 (left) to +1 (right)
  normalizedY: number; // -1 (up) to +1 (down)
  confidence: number;
  faceDetected: boolean;
  isBlinking: boolean;
  isLookingAway: boolean;
  isManualPaused: boolean;
  dwellProgress: number; // 0 to 1
  dwellTarget: 'down' | 'up' | null;
  rawPitch?: number;
  rawYaw?: number;
  handDebug?: {
    activeHandDetected: boolean;
    handCentroidX: number; // 0 to 1 in normalized screen coordinates
    handCentroidY: number; // 0 to 1 in normalized screen coordinates
    isLeftZone: boolean;
    activePixels: number;
    motionEnergy: number;
    headInMaskDetected: boolean;
    spatialMask: {
      startRatio: number;
      endRatio: number;
      widthRatio: number;
    };
  };
}

export interface GazeSettings {
  orientation: DeviceOrientation;
  scrollTriggerDirection: 'look-up' | 'look-down'; // 'look-up' (default) to scroll next short
  sensitivity: number; // 1 to 5 (default 3)
  handGestureSensitivity?: number; // 1 to 10 (default 6) - threshold for hand & finger triggers across lighting and distances
  faceExclusionZoneWidth?: number; // 0.15 to 0.70 (default 0.38) - spatial mask ignoring central region where head is located
  dwellTimeMs: number; // e.g. 500ms
  cooldownMs: number; // e.g. 1200ms
  soundFeedback: boolean;
  hapticFeedback: boolean;
  showPip: boolean;
  visionDebugOverlay?: boolean; // Real-time detection boxes for hand landmarks and spatial mask
  simulationMode: boolean;
  autoPlayAudio: boolean;
}

export interface CalibrationData {
  centerPitch: number;
  centerYaw: number;
  pitchThresholdDown: number;
  pitchThresholdUp: number;
  yawThresholdAway: number;
  calibratedAt: number | null;
}

export type FeedMode = 'curated' | 'youtube';

export interface YouTubeShortItem {
  id: string; // YouTube video ID
  title: string;
  channelTitle: string;
  category: string;
}

export interface CommentItem {
  id: string;
  author: string;
  avatar: string;
  text: string;
  timeAgo: string;
  likes: number;
  isLiked?: boolean;
}

export interface ReelItem {
  id: string;
  title: string;
  caption: string;
  author: {
    name: string;
    handle: string;
    avatar: string;
    isVerified?: boolean;
    isFollowing?: boolean;
  };
  videoUrl: string;
  fallbackType: 'nature' | 'urban' | 'cyberpunk' | 'culinary' | 'space' | 'dance';
  audioTrack: {
    title: string;
    artist: string;
    coverUrl?: string;
  };
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    isLiked?: boolean;
    isSaved?: boolean;
  };
  tags: string[];
  comments: CommentItem[];
}
