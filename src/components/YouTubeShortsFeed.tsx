import React, { useState, useEffect, useRef } from 'react';
import { 
  Tv, 
  ChevronUp, 
  ChevronDown, 
  Plus, 
  Search, 
  Sparkles, 
  RotateCcw, 
  SlidersHorizontal, 
  HelpCircle, 
  Eye, 
  ExternalLink,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Check
} from 'lucide-react';
import { DeviceOrientation, GazeData, GazeSettings, YouTubeShortItem } from '../types';
import { POPULAR_YOUTUBE_SHORTS, extractYouTubeId } from '../data/youtubeShorts';
import { gazeTracker } from '../services/gazeTracker';
import { audioFeedback, triggerHaptic } from '../utils/audioFeedback';

interface Props {
  gazeData: GazeData | null;
  settings: GazeSettings;
  isPausedByGaze: boolean;
  onNavigateNext: () => void;
  onNavigatePrev: () => void;
  onOpenSettings: () => void;
  onOpenOrientationSetup: () => void;
  onOpenExplainer: () => void;
  onSwitchToCurated: () => void;
  onSelectOrientation?: (orientation: DeviceOrientation) => void;
}

export const YouTubeShortsFeed: React.FC<Props> = ({
  gazeData,
  settings,
  isPausedByGaze,
  onOpenSettings,
  onOpenOrientationSetup,
  onOpenExplainer,
  onSwitchToCurated,
  onSelectOrientation,
}) => {
  const [shortsList, setShortsList] = useState<YouTubeShortItem[]>(POPULAR_YOUTUBE_SHORTS);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayerRef = useRef<any>(null);

  const activeShort = shortsList[currentIdx] || shortsList[0];

  // Handle gaze scroll trigger
  useEffect(() => {
    const unsub = gazeTracker.addScrollListener((direction) => {
      const isLookUpNext = (settings.scrollTriggerDirection || 'look-up') === 'look-up';
      const isNext = (isLookUpNext && direction === 'up') || (!isLookUpNext && direction === 'down');
      if (isNext) {
        setCurrentIdx((prev) => (prev < shortsList.length - 1 ? prev + 1 : prev));
        audioFeedback.playScrollDown();
        triggerHaptic(50);
      } else {
        setCurrentIdx((prev) => (prev > 0 ? prev - 1 : 0));
        audioFeedback.playScrollUp();
        triggerHaptic(40);
      }
    });
    return () => {
      unsub();
    };
  }, [settings.scrollTriggerDirection, shortsList.length]);

  // Load YouTube IFrame API
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    if (!win.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      document.body.appendChild(tag);
    }

    const initPlayer = () => {
      if (!win.YT || !win.YT.Player) return;

      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignored
        }
      }

      ytPlayerRef.current = new win.YT.Player('yt-shorts-iframe', {
        videoId: activeShort.id,
        playerVars: {
          autoplay: 1,
          controls: 1,
          loop: 1,
          playlist: activeShort.id,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            setIsPlayerReady(true);
            try {
              ytPlayerRef.current.playVideo();
            } catch {
              // Browser policy may require mute
              ytPlayerRef.current.mute();
              ytPlayerRef.current.playVideo();
            }
          },
        },
      });
    };

    if (win.YT && win.YT.Player) {
      initPlayer();
    } else {
      win.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.destroy();
        } catch {
          // Ignored
        }
      }
    };
  }, [activeShort.id]);

  // Handle Look-Away Auto-Pause & Resume
  useEffect(() => {
    if (!ytPlayerRef.current || !isPlayerReady) return;

    try {
      if (isPausedByGaze) {
        ytPlayerRef.current.pauseVideo();
      } else {
        ytPlayerRef.current.playVideo();
      }
    } catch {
      // Ignored
    }
  }, [isPausedByGaze, isPlayerReady]);

  // Handle Gaze Scroll Triggers
  const handleNext = () => {
    if (currentIdx < shortsList.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      setCurrentIdx((prev) => prev - 1);
    }
  };

  // Add custom user YouTube Short URL
  const handleAddCustomShort = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError(null);
    const id = extractYouTubeId(customUrlInput);
    if (!id) {
      setUrlError('Please enter a valid YouTube Shorts link or 11-char ID');
      return;
    }

    const newShort: YouTubeShortItem = {
      id,
      title: `Custom YouTube Short (${id})`,
      channelTitle: 'User Added',
      category: 'Custom',
    };

    setShortsList((prev) => [newShort, ...prev]);
    setCurrentIdx(0);
    setCustomUrlInput('');
  };

  const categories = ['All', 'Music', 'Action', 'Dance', 'Comedy', 'History'];
  const filteredShorts = selectedCategory === 'All' 
    ? shortsList 
    : shortsList.filter(s => s.category === selectedCategory || s.category === 'Custom');

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-neutral-950 overflow-hidden"
    >
      {/* 9:16 Vertical Reel Phone Frame */}
      <div className="relative w-full max-w-[440px] h-full max-h-[920px] bg-black sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between border-x sm:border border-neutral-900 select-none">
        
        {/* TOP BAR */}
        <header className="relative z-20 flex items-center justify-between px-4 pt-4 pb-2 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-white font-display flex items-center gap-1.5">
              <Tv className="w-4 h-4 text-rose-500" />
              <span>YouTube Shorts</span>
            </span>
            <button
              type="button"
              onClick={onSwitchToCurated}
              className="text-[10px] text-neutral-400 hover:text-white px-2 py-0.5 rounded-full bg-neutral-800/80 border border-neutral-700 transition-colors"
            >
              Switch to Offline Feed
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenExplainer}
              className="p-2 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-emerald-400 border border-emerald-500/30 transition-colors"
              title="How this connects to your YouTube app"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenOrientationSetup}
              className="p-2 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-white border border-neutral-800 transition-colors"
              title="Change Orientation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="p-2 rounded-full bg-neutral-900/90 hover:bg-neutral-800 text-white border border-neutral-800 transition-colors"
              title="Settings"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* QUICK ORIENTATION SWITCHER BAR (Always visible!) */}
        <div className="relative z-20 px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar bg-black/60 border-b border-neutral-800">
          <span className="text-[10px] text-neutral-400 font-mono shrink-0">Hold:</span>
          <button
            type="button"
            onClick={() => onSelectOrientation?.('portrait')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 flex items-center gap-1 ${
              settings.orientation === 'portrait'
                ? 'bg-rose-600 text-white font-bold shadow-md shadow-rose-600/30'
                : 'bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
            }`}
          >
            <span>📱 Vertical</span>
          </button>
          <button
            type="button"
            onClick={() => onSelectOrientation?.('landscape-left')}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 flex items-center gap-1 ${
              settings.orientation === 'landscape-left'
                ? 'bg-rose-600 text-white font-bold shadow-md shadow-rose-600/30'
                : 'bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
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
                ? 'bg-rose-600 text-white font-bold shadow-md shadow-rose-600/30'
                : 'bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
            }`}
          >
            <span>🔄 90° CW (Cam Right)</span>
          </button>
        </div>

        {/* ON-SCREEN SCROLL BUTTONS FOR TOUCH & DESKTOP */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2 pointer-events-auto">
          <button
            type="button"
            disabled={currentIdx === 0}
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white border border-neutral-700 flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all backdrop-blur-md shadow-lg"
            title="Previous YouTube Short (↑)"
          >
            <ChevronUp className="w-5 h-5 stroke-[2.5]" />
          </button>
          <button
            type="button"
            disabled={currentIdx === shortsList.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="w-9 h-9 rounded-full bg-black/70 hover:bg-black/90 text-white border border-neutral-700 flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all backdrop-blur-md shadow-lg"
            title="Next YouTube Short (↓)"
          >
            <ChevronDown className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Categories Bar */}
        <div className="relative z-20 px-4 py-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                const foundIdx = shortsList.findIndex(s => cat === 'All' || s.category === cat);
                if (foundIdx !== -1) setCurrentIdx(foundIdx);
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedCategory === cat
                  ? 'bg-rose-600 text-white'
                  : 'bg-neutral-900/80 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Central Iframe Container */}
        <div className="relative flex-1 w-full bg-neutral-950 flex items-center justify-center overflow-hidden">
          <div className="w-full h-full relative flex items-center justify-center">
            {/* The YouTube Player Embed */}
            <div id="yt-shorts-iframe" className="w-full h-full pointer-events-auto" />
          </div>

          {/* LOOK-AWAY ACCESSIBILITY AUTO-PAUSE OVERLAY */}
          {isPausedByGaze && (
            <div className="absolute inset-0 z-30 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 mb-3 shadow-lg shadow-amber-500/20 animate-pulse">
                <Eye className="w-8 h-8" />
              </div>
              <span className="text-xs uppercase tracking-widest text-amber-400 font-mono font-semibold mb-1">
                Accessibility Auto-Pause
              </span>
              <h3 className="text-xl font-bold text-white mb-2">Looked away from YouTube Short</h3>
              <p className="text-xs text-neutral-300 max-w-xs leading-relaxed">
                Video paused automatically so you don&apos;t miss the action. Look back at the screen to resume!
              </p>
            </div>
          )}

          {/* Dwell Trigger Indicators */}
          {gazeData?.dwellTarget === 'up' && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-none animate-bounce">
              <div className="px-3.5 py-1.5 rounded-full bg-rose-500/90 text-white font-bold text-xs flex items-center gap-2 shadow-xl shadow-rose-500/30">
                <ChevronUp className="w-4 h-4 stroke-[3]" />
                <span>{settings.scrollTriggerDirection === 'look-up' ? 'Next YouTube Short' : 'Previous YouTube Short'}</span>
                <span className="font-mono text-[11px]">
                  {Math.round((gazeData.dwellProgress || 0) * 100)}%
                </span>
              </div>
            </div>
          )}

          {gazeData?.dwellTarget === 'down' && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-none animate-bounce">
              <div className="px-3.5 py-1.5 rounded-full bg-rose-500/90 text-white font-bold text-xs flex items-center gap-2 shadow-xl shadow-rose-500/30">
                <ChevronDown className="w-4 h-4 stroke-[3]" />
                <span>{settings.scrollTriggerDirection === 'look-up' ? 'Previous YouTube Short' : 'Next YouTube Short'}</span>
                <span className="font-mono text-[11px]">
                  {Math.round((gazeData.dwellProgress || 0) * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM METADATA & CUSTOM URL PASTE BAR */}
        <div className="relative z-20 px-4 py-3 bg-neutral-950/90 border-t border-neutral-800 space-y-2.5">
          {/* Active Title */}
          <div className="flex items-center justify-between text-xs">
            <div className="min-w-0 flex-1">
              <span className="font-bold text-white block truncate">{activeShort.title}</span>
              <span className="text-[11px] text-neutral-400">{activeShort.channelTitle}</span>
            </div>
            <a
              href={`https://www.youtube.com/shorts/${activeShort.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium ml-2 shrink-0"
            >
              <span>Open in App</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Paste Any YouTube Short Link */}
          <form onSubmit={handleAddCustomShort} className="flex items-center gap-1.5">
            <input
              type="text"
              value={customUrlInput}
              onChange={(e) => setCustomUrlInput(e.target.value)}
              placeholder="Paste any YouTube Short URL..."
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
            />
            <button
              type="submit"
              className="py-1.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Load</span>
            </button>
          </form>

          {urlError && (
            <p className="text-[10px] text-rose-400">{urlError}</p>
          )}

          {/* Navigation & Explainer Trigger */}
          <div className="flex items-center justify-between pt-1 text-[11px] text-neutral-400">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentIdx === 0}
                className="hover:text-white disabled:opacity-30 transition-colors"
              >
                ↑ Prev
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={handleNext}
                disabled={currentIdx === shortsList.length - 1}
                className="hover:text-white disabled:opacity-30 transition-colors"
              >
                ↓ Next
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenExplainer}
              className="text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>How to use over native app</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Chevrons */}
      <div className="hidden lg:flex flex-col items-center gap-3 absolute right-8 z-30">
        <button
          type="button"
          disabled={currentIdx === 0}
          onClick={handlePrev}
          className="p-3 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition-all shadow-xl"
          title="Previous Short (or Look Up)"
        >
          <ChevronUp className="w-6 h-6" />
        </button>
        <span className="text-xs font-mono text-neutral-400">
          {currentIdx + 1} / {shortsList.length}
        </span>
        <button
          type="button"
          disabled={currentIdx === shortsList.length - 1}
          onClick={handleNext}
          className="p-3 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 transition-all shadow-xl"
          title="Next Short (or Look Down)"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
