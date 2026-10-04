import React, { useState, useRef, useEffect } from 'react';
import { 
  Heart, 
  MessageCircle, 
  Share2, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  Music2, 
  ChevronUp, 
  ChevronDown, 
  Eye, 
  Sparkles,
  Bookmark,
  Check,
  RotateCcw,
  Smartphone,
  SlidersHorizontal,
  Compass,
  Tv,
  HelpCircle
} from 'lucide-react';
import { DeviceOrientation, GazeData, GazeSettings, ReelItem } from '../types';
import { CanvasVideoFallback } from './CanvasVideoFallback';
import { CommentsDrawer } from './CommentsDrawer';

interface Props {
  reels: ReelItem[];
  currentIndex: number;
  gazeData: GazeData | null;
  settings: GazeSettings;
  isPausedByGaze: boolean;
  onNavigate: (index: number) => void;
  onOpenSettings: () => void;
  onOpenOrientationSetup: () => void;
  onOpenCalibration: () => void;
  onSwitchToYouTube: () => void;
  onOpenExplainer: () => void;
  onSelectOrientation?: (orientation: DeviceOrientation) => void;
}

export const ShortsPlayer: React.FC<Props> = ({
  reels,
  currentIndex,
  gazeData,
  settings,
  isPausedByGaze,
  onNavigate,
  onOpenSettings,
  onOpenOrientationSetup,
  onOpenCalibration,
  onSwitchToYouTube,
  onOpenExplainer,
  onSelectOrientation,
}) => {
  const currentReel = reels[currentIndex] || reels[0];

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0);
  const [likesState, setLikesState] = useState<Record<string, { count: number; isLiked: boolean }>>({});
  const [savedState, setSavedState] = useState<Record<string, boolean>>({});
  const [followedState, setFollowedState] = useState<Record<string, boolean>>({});
  const [isCommentsOpen, setIsCommentsOpen] = useState<boolean>(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [showHeartBurst, setShowHeartBurst] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStartY = useRef<number>(0);

  // Initialize or update likes state
  useEffect(() => {
    setLikesState((prev) => {
      const next = { ...prev };
      reels.forEach((r) => {
        if (!next[r.id]) {
          next[r.id] = { count: r.metrics.likes, isLiked: !!r.metrics.isLiked };
        }
      });
      return next;
    });
  }, [reels]);

  // Handle video element play / pause according to user or gaze pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPausedByGaze || !isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {
        // Autoplay may need muted
        video.muted = true;
        setIsMuted(true);
        video.play().catch(() => {});
      });
    }
  }, [isPausedByGaze, isPlaying, currentIndex]);

  // Video time tracking
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    setProgress((video.currentTime / video.duration) * 100);
  };

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const handleLike = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLikesState((prev) => {
      const cur = prev[currentReel.id] || { count: currentReel.metrics.likes, isLiked: false };
      const nextLiked = !cur.isLiked;
      return {
        ...prev,
        [currentReel.id]: {
          count: nextLiked ? cur.count + 1 : cur.count - 1,
          isLiked: nextLiked,
        },
      };
    });
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 800);
  };

  const toggleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedState((prev) => ({
      ...prev,
      [currentReel.id]: !prev[currentReel.id],
    }));
  };

  const toggleFollow = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFollowedState((prev) => ({
      ...prev,
      [currentReel.author.handle]: !prev[currentReel.author.handle],
    }));
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({
        title: currentReel.title,
        text: `Watch ${currentReel.title} on GazeFlow Hands-Free Shorts!`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
      setShareToast('Link copied to clipboard!');
      setTimeout(() => setShareToast(null), 2500);
    }
  };

  // Wheel scrolling with cooldown
  const lastWheelTime = useRef<number>(0);
  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 450) return;
    if (Math.abs(e.deltaY) > 25) {
      lastWheelTime.current = now;
      if (e.deltaY > 0 && currentIndex < reels.length - 1) {
        onNavigate(currentIndex + 1);
      } else if (e.deltaY < 0 && currentIndex > 0) {
        onNavigate(currentIndex - 1);
      }
    }
  };

  // Keyboard navigation for desktop & mobile keyboards
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        if (currentIndex < reels.length - 1) onNavigate(currentIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        if (currentIndex > 0) onNavigate(currentIndex - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, reels.length, onNavigate]);

  // Touch Swipe Handlers for touch devices (responsive threshold)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(diff) > 35) {
      if (diff > 0 && currentIndex < reels.length - 1) {
        onNavigate(currentIndex + 1);
      } else if (diff < 0 && currentIndex > 0) {
        onNavigate(currentIndex - 1);
      }
    }
  };

  const currentLikes = likesState[currentReel.id] || { count: currentReel.metrics.likes, isLiked: false };
  const isSaved = !!savedState[currentReel.id];
  const isFollowed = !!followedState[currentReel.author.handle];

  return (
    <div 
      className="relative w-full h-full flex items-center justify-center bg-neutral-950 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* 9:16 Vertical Reel Container */}
      <div className="relative w-full max-w-[440px] h-full max-h-[920px] bg-black sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between border-x sm:border border-neutral-900 select-none">
        
        {/* Background Video Player */}
        <div 
          onClick={togglePlay}
          className="absolute inset-0 z-0 bg-neutral-950 flex items-center justify-center cursor-pointer"
        >
          {/* Fallback procedural canvas animates if video fails or while buffering */}
          <div className={`absolute inset-0 transition-opacity duration-500 ${videoError ? 'opacity-100' : 'opacity-0'}`}>
            <CanvasVideoFallback
              type={currentReel.fallbackType}
              isPlaying={isPlaying && !isPausedByGaze}
            />
          </div>

          <video
            ref={videoRef}
            key={currentReel.id}
            src={currentReel.videoUrl}
            playsInline
            loop
            muted={isMuted}
            autoPlay
            onTimeUpdate={handleTimeUpdate}
            onError={() => setVideoError(true)}
            onLoadedData={() => setVideoError(false)}
            className="w-full h-full object-cover"
          />

          {/* Vignette Gradients for readability */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/90 pointer-events-none" />
        </div>

        {/* Double-tap / Like Animated Heart Burst */}
        {showHeartBurst && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <Heart className="w-24 h-24 text-rose-500 fill-rose-500 animate-ping opacity-90" />
          </div>
        )}

        {/* LOOK-AWAY ACCESSIBILITY AUTO-PAUSE OVERLAY */}
        {isPausedByGaze && (
          <div className="absolute inset-0 z-30 bg-black/65 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 mb-3 shadow-lg shadow-amber-500/20 animate-pulse">
              <Eye className="w-8 h-8" />
            </div>
            <span className="text-xs uppercase tracking-widest text-amber-400 font-mono font-semibold mb-1">
              Accessibility Auto-Pause
            </span>
            <h3 className="text-xl font-bold text-white mb-2">You looked away from the screen</h3>
            <p className="text-xs text-neutral-300 max-w-xs leading-relaxed">
              Playback is automatically paused so you won't miss anything. Look back at the screen to resume!
            </p>
            <div className="mt-4 px-3 py-1.5 rounded-full bg-neutral-900/90 border border-neutral-700 text-[11px] text-neutral-400 flex items-center gap-1.5 font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Gaze off-screen: Left/Right</span>
            </div>
          </div>
        )}

        {/* Manual Pause Icon indicator */}
        {!isPlaying && !isPausedByGaze && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white">
              <Play className="w-8 h-8 fill-white translate-x-0.5" />
            </div>
          </div>
        )}

        {/* GAZE DWELL TRIGGER INDICATORS */}
        {/* Look UP Scroll Dwell Ring */}
        {gazeData?.dwellTarget === 'up' && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-none animate-bounce">
            <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/90 text-neutral-950 font-bold text-xs flex items-center gap-2 shadow-xl shadow-emerald-500/30">
              <ChevronUp className="w-4 h-4 stroke-[3]" />
              <span>{settings.scrollTriggerDirection === 'look-up' ? 'Next Short' : 'Previous Short'}</span>
              <span className="font-mono text-[11px]">
                {Math.round((gazeData.dwellProgress || 0) * 100)}%
              </span>
            </div>
            <div className="w-32 h-1.5 bg-neutral-900/80 rounded-full overflow-hidden border border-emerald-400/40">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${(gazeData.dwellProgress || 0) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Look DOWN Scroll Dwell Ring */}
        {gazeData?.dwellTarget === 'down' && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-none animate-bounce">
            <div className="px-3.5 py-1.5 rounded-full bg-emerald-500/90 text-neutral-950 font-bold text-xs flex items-center gap-2 shadow-xl shadow-emerald-500/30">
              <ChevronDown className="w-4 h-4 stroke-[3]" />
              <span>{settings.scrollTriggerDirection === 'look-up' ? 'Previous Short' : 'Next Short'}</span>
              <span className="font-mono text-[11px]">
                {Math.round((gazeData.dwellProgress || 0) * 100)}%
              </span>
            </div>
            {/* Horizontal progress bar */}
            <div className="w-32 h-1.5 bg-neutral-900/80 rounded-full overflow-hidden border border-emerald-400/40">
              <div
                className="h-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${(gazeData.dwellProgress || 0) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* TOP BAR CONTRACT: Minimal, transparent overlay */}
        <header className="relative z-20 flex items-center justify-between px-4 pt-4 pb-2">
          {/* Brand Wordmark & Mode Switcher */}
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-white font-display flex items-center gap-1.5 drop-shadow-md">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span>GazeFlow</span>
            </span>
            <button
              type="button"
              onClick={onSwitchToYouTube}
              className="text-[10px] text-rose-300 hover:text-white px-2 py-0.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 flex items-center gap-1 transition-colors"
              title="Switch to Real YouTube Shorts Feed"
            >
              <Tv className="w-3 h-3 text-rose-400" />
              <span>YouTube Mode</span>
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5">
            {/* Guide Explainer Button */}
            <button
              type="button"
              onClick={onOpenExplainer}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-emerald-400 hover:text-emerald-300 backdrop-blur-md border border-emerald-500/30 transition-colors"
              title="How this connects to your YouTube / Snapchat app"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Orientation Button */}
            <button
              type="button"
              onClick={onOpenOrientationSetup}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md border border-white/10 transition-colors"
              title="Change Device Orientation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Mute / Unmute Button */}
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md border border-white/10 transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 rounded-full bg-black/40 hover:bg-black/60 text-white backdrop-blur-md border border-white/10 transition-colors"
              title="Settings"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* QUICK ORIENTATION SWITCHER BAR (Always visible!) */}
        <div className="relative z-20 px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-black/30 backdrop-blur-xs border-b border-white/5">
          <span className="text-[10px] text-neutral-400 font-mono shrink-0">Hold:</span>
          <button
            type="button"
            onClick={() => onSelectOrientation?.('portrait')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 flex items-center gap-1 ${
              settings.orientation === 'portrait'
                ? 'bg-emerald-500 text-neutral-950 font-bold shadow-md shadow-emerald-500/20'
                : 'bg-black/50 text-neutral-300 hover:text-white border border-white/10'
            }`}
          >
            <span>📱 Vertical</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectOrientation?.('landscape-left')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 flex items-center gap-1 ${
              settings.orientation === 'landscape-left'
                ? 'bg-emerald-500 text-neutral-950 font-bold shadow-md shadow-emerald-500/20'
                : 'bg-black/50 text-neutral-300 hover:text-white border border-white/10'
            }`}
            title="Phone rotated 90° anti-clockwise with camera on your left"
          >
            <span>🔄 90° ACW (Cam Left)</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectOrientation?.('landscape-right')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 flex items-center gap-1 ${
              settings.orientation === 'landscape-right'
                ? 'bg-emerald-500 text-neutral-950 font-bold shadow-md shadow-emerald-500/20'
                : 'bg-black/50 text-neutral-300 hover:text-white border border-white/10'
            }`}
          >
            <span>🔄 90° CW (Cam Right)</span>
          </button>
        </div>

        {/* ON-SCREEN SCROLL BUTTONS (Always clickable on touch & desktop) */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 pointer-events-auto">
          <button
            type="button"
            disabled={currentIndex === 0}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(currentIndex - 1);
            }}
            className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all backdrop-blur-md shadow-lg"
            title="Previous Short (↑)"
          >
            <ChevronUp className="w-5 h-5 stroke-[2.5]" />
          </button>
          <button
            type="button"
            disabled={currentIndex === reels.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(currentIndex + 1);
            }}
            className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all backdrop-blur-md shadow-lg"
            title="Next Short (↓)"
          >
            <ChevronDown className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* RIGHT ACTION RAIL (Shorts / Reels icons) */}
        <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-4.5">
          {/* Like Button */}
          <button
            type="button"
            onClick={handleLike}
            className="flex flex-col items-center gap-1 text-white active:scale-90 transition-transform"
          >
            <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
              currentLikes.isLiked 
                ? 'bg-rose-500/20 border-rose-500 text-rose-500' 
                : 'bg-black/40 border-white/15 text-white hover:bg-black/60'
            }`}>
              <Heart className={`w-5 h-5 ${currentLikes.isLiked ? 'fill-rose-500' : ''}`} />
            </div>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow">
              {currentLikes.count >= 1000 ? `${(currentLikes.count / 1000).toFixed(1)}K` : currentLikes.count}
            </span>
          </button>

          {/* Comments Button */}
          <button
            type="button"
            onClick={() => setIsCommentsOpen(true)}
            className="flex flex-col items-center gap-1 text-white active:scale-90 transition-transform"
          >
            <div className="w-11 h-11 rounded-full bg-black/40 hover:bg-black/60 border border-white/15 flex items-center justify-center backdrop-blur-md transition-colors">
              <MessageCircle className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold tabular-nums drop-shadow">
              {currentReel.metrics.comments >= 1000
                ? `${(currentReel.metrics.comments / 1000).toFixed(1)}K`
                : currentReel.metrics.comments}
            </span>
          </button>

          {/* Save / Bookmark Button */}
          <button
            type="button"
            onClick={toggleSave}
            className="flex flex-col items-center gap-1 text-white active:scale-90 transition-transform"
          >
            <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md border transition-colors ${
              isSaved
                ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                : 'bg-black/40 border-white/15 text-white hover:bg-black/60'
            }`}>
              <Bookmark className={`w-5 h-5 ${isSaved ? 'fill-amber-400' : ''}`} />
            </div>
            <span className="text-[11px] font-semibold drop-shadow">Save</span>
          </button>

          {/* Share Button */}
          <button
            type="button"
            onClick={handleShare}
            className="flex flex-col items-center gap-1 text-white active:scale-90 transition-transform"
          >
            <div className="w-11 h-11 rounded-full bg-black/40 hover:bg-black/60 border border-white/15 flex items-center justify-center backdrop-blur-md transition-colors">
              <Share2 className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold drop-shadow">Share</span>
          </button>

          {/* Spinning Audio Track Disc */}
          <div className="relative pt-1">
            <div className={`w-10 h-10 rounded-full border-2 border-neutral-700 bg-neutral-900 flex items-center justify-center shadow-lg ${isPlaying && !isPausedByGaze ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }}>
              <div className="w-4 h-4 rounded-full bg-emerald-500/40 border border-emerald-400 flex items-center justify-center">
                <Music2 className="w-2.5 h-2.5 text-emerald-300" />
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM METADATA OVERLAY (Profile, Title, Audio) */}
        <div className="relative z-20 px-4 pb-4 pt-10 text-white space-y-2.5">
          {/* Author info + Follow */}
          <div className="flex items-center gap-2.5">
            <img
              src={currentReel.author.avatar}
              alt={currentReel.author.name}
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-full object-cover border-2 border-emerald-400 shrink-0"
            />
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-sm truncate drop-shadow">
                @{currentReel.author.handle}
              </span>
              {currentReel.author.isVerified && (
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center text-[9px] font-bold shrink-0">
                  ✓
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={toggleFollow}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                isFollowed
                  ? 'bg-neutral-800/80 text-neutral-300 border border-neutral-700'
                  : 'bg-white text-neutral-950 hover:bg-neutral-200'
              }`}
            >
              {isFollowed ? 'Following' : 'Follow'}
            </button>
          </div>

          {/* Caption / Title */}
          <p className="text-xs text-neutral-200 line-clamp-2 leading-relaxed drop-shadow-sm pr-14">
            {currentReel.caption}
          </p>

          {/* Tags */}
          <div className="flex items-center gap-2 text-[11px] text-emerald-300 font-medium overflow-hidden whitespace-nowrap">
            {currentReel.tags.slice(0, 3).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>

          {/* Audio Track Ticker */}
          <div className="flex items-center gap-2 text-xs text-neutral-300 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full w-fit max-w-[260px] border border-white/10">
            <Music2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate text-[11px] font-medium">
              {currentReel.audioTrack.title} · {currentReel.audioTrack.artist}
            </span>
          </div>

          {/* Scrubbable Progress Bar */}
          <div className="w-full bg-white/20 h-1 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-emerald-400 transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Share Toast */}
        {shareToast && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-emerald-500 text-neutral-950 font-semibold text-xs shadow-xl animate-fade-in flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            <span>{shareToast}</span>
          </div>
        )}

        {/* Comments Drawer */}
        <CommentsDrawer
          isOpen={isCommentsOpen}
          comments={currentReel.comments}
          onClose={() => setIsCommentsOpen(false)}
          onAddComment={(text) => {
            const newComment = {
              id: `c-${Date.now()}`,
              author: 'You',
              avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
              text,
              timeAgo: 'Just now',
              likes: 0,
            };
            currentReel.comments.unshift(newComment);
            currentReel.metrics.comments++;
          }}
          onLikeComment={(cId) => {
            const comment = currentReel.comments.find((c) => c.id === cId);
            if (comment) {
              comment.isLiked = !comment.isLiked;
              comment.likes += comment.isLiked ? 1 : -1;
            }
          }}
        />
      </div>

      {/* Desktop / Large Screen Side Navigation Chevrons */}
      <div className="hidden lg:flex flex-col items-center gap-3 absolute right-8 z-30">
        <button
          type="button"
          disabled={currentIndex === 0}
          onClick={() => onNavigate(currentIndex - 1)}
          className="p-3 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-xl"
          title="Previous Short (or Look Up)"
        >
          <ChevronUp className="w-6 h-6" />
        </button>
        <span className="text-xs font-mono text-neutral-400">
          {currentIndex + 1} / {reels.length}
        </span>
        <button
          type="button"
          disabled={currentIndex === reels.length - 1}
          onClick={() => onNavigate(currentIndex + 1)}
          className="p-3 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:pointer-events-none transition-all shadow-xl"
          title="Next Short (or Look Down)"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
