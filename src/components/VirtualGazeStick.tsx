import React, { useState, useEffect, useRef } from 'react';
import { Gamepad2, ArrowDown, ArrowUp, Pause, Play, Eye } from 'lucide-react';
import { gazeTracker } from '../services/gazeTracker';

interface Props {
  isSimulationActive: boolean;
  onToggleSimulation: () => void;
}

export const VirtualGazeStick: React.FC<Props> = ({
  isSimulationActive,
  onToggleSimulation,
}) => {
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const padRef = useRef<HTMLDivElement | null>(null);

  // Keyboard shortcut listener for gaze simulation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setKnobPos({ x: 0, y: 35 });
        gazeTracker.simulateGaze(0, 0.45);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setKnobPos({ x: 0, y: -35 });
        gazeTracker.simulateGaze(0, -0.45);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setKnobPos({ x: -40, y: 0 });
        gazeTracker.simulateGaze(-0.6, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setKnobPos({ x: 40, y: 0 });
        gazeTracker.simulateGaze(0.6, 0);
      } else if (e.key === ' ' || e.key === 'Enter') {
        // Center gaze
        setKnobPos({ x: 0, y: 0 });
        gazeTracker.simulateGaze(0, 0);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        setTimeout(() => {
          setKnobPos({ x: 0, y: 0 });
          gazeTracker.simulateGaze(0, 0);
        }, 300);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    handlePointerMove(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!padRef.current) return;
    const rect = padRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const maxRadius = rect.width / 2 - 12;
    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobPos({ x: dx, y: dy });

    // Normalize to -1 to 1
    const normX = dx / maxRadius;
    const normY = dy / maxRadius;
    gazeTracker.simulateGaze(normX * 0.8, normY * 0.8);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    setKnobPos({ x: 0, y: 0 });
    gazeTracker.simulateGaze(0, 0);
  };

  if (!isSimulationActive) {
    return (
      <button
        type="button"
        onClick={onToggleSimulation}
        className="fixed bottom-20 left-4 z-40 p-2.5 rounded-full bg-neutral-900/90 border border-neutral-800 text-neutral-400 hover:text-emerald-400 hover:bg-neutral-800 shadow-xl backdrop-blur-sm transition-all"
        title="Open Virtual Gaze Stick"
      >
        <Gamepad2 className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 left-4 z-40 bg-neutral-900/95 border border-neutral-800 rounded-3xl p-3 shadow-2xl backdrop-blur-md space-y-2 select-none">
      <div className="flex items-center justify-between text-[11px] font-medium text-neutral-300 pb-1 border-b border-neutral-800">
        <div className="flex items-center gap-1.5">
          <Gamepad2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Gaze Simulator</span>
        </div>
        <button
          type="button"
          onClick={onToggleSimulation}
          className="text-neutral-500 hover:text-neutral-300 text-xs px-1"
        >
          ✕
        </button>
      </div>

      {/* Joystick Area */}
      <div
        ref={padRef}
        onPointerDown={handlePointerDown}
        onPointerMove={isDragging ? handlePointerMove : undefined}
        onPointerUp={handlePointerUp}
        onPointerLeave={isDragging ? handlePointerUp : undefined}
        className="relative w-28 h-28 mx-auto rounded-full bg-neutral-950 border border-neutral-800 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
      >
        {/* Crosshair guide lines */}
        <div className="absolute w-full h-[1px] bg-neutral-800/60 pointer-events-none" />
        <div className="absolute h-full w-[1px] bg-neutral-800/60 pointer-events-none" />

        {/* Direction indicators */}
        <span className="absolute top-1 text-[8px] text-neutral-500 uppercase font-mono">Up</span>
        <span className="absolute bottom-1 text-[8px] text-neutral-500 uppercase font-mono">Down</span>
        <span className="absolute left-1 text-[8px] text-neutral-500 uppercase font-mono">Away</span>
        <span className="absolute right-1 text-[8px] text-neutral-500 uppercase font-mono">Away</span>

        {/* Knob */}
        <div
          className="w-10 h-10 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-500/30 transition-transform pointer-events-none"
          style={{
            transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
          }}
        >
          <Eye className="w-4 h-4" />
        </div>
      </div>

      {/* Quick Action Pills */}
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <button
          type="button"
          onClick={() => {
            setKnobPos({ x: 0, y: 35 });
            gazeTracker.simulateGaze(0, 0.5);
            setTimeout(() => {
              setKnobPos({ x: 0, y: 0 });
              gazeTracker.simulateGaze(0, 0);
            }, 600);
          }}
          className="py-1 px-2 rounded-lg bg-neutral-800/80 hover:bg-neutral-800 text-neutral-200 flex items-center justify-center gap-1 border border-neutral-700/60"
        >
          <ArrowDown className="w-2.5 h-2.5 text-emerald-400" />
          <span>Look Down</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setKnobPos({ x: 0, y: -35 });
            gazeTracker.simulateGaze(0, -0.5);
            setTimeout(() => {
              setKnobPos({ x: 0, y: 0 });
              gazeTracker.simulateGaze(0, 0);
            }, 600);
          }}
          className="py-1 px-2 rounded-lg bg-neutral-800/80 hover:bg-neutral-800 text-neutral-200 flex items-center justify-center gap-1 border border-neutral-700/60"
        >
          <ArrowUp className="w-2.5 h-2.5 text-emerald-400" />
          <span>Look Up</span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          setKnobPos({ x: 40, y: 0 });
          gazeTracker.simulateGaze(0.6, 0);
          setTimeout(() => {
            setKnobPos({ x: 0, y: 0 });
            gazeTracker.simulateGaze(0, 0);
          }, 1200);
        }}
        className="w-full py-1 px-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[10px] flex items-center justify-center gap-1 border border-amber-500/30"
      >
        <Pause className="w-2.5 h-2.5" />
        <span>Look Away (Auto-Pause)</span>
      </button>
    </div>
  );
};
