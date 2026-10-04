import React, { useRef, useEffect } from 'react';

interface Props {
  type: 'cyberpunk' | 'space' | 'culinary' | 'nature' | 'urban' | 'dance';
  isPlaying: boolean;
}

export const CanvasVideoFallback: React.FC<Props> = ({ type, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let frame = 0;

    // Particle array for procedural ambiance
    const particles = Array.from({ length: 45 }, () => ({
      x: Math.random() * 400,
      y: Math.random() * 700,
      radius: Math.random() * 3 + 1,
      speedY: Math.random() * 1.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.8,
      hue: Math.random() * 60,
    }));

    const render = () => {
      if (isPlaying) {
        frame++;
      }

      const w = canvas.width;
      const h = canvas.height;

      // Draw background gradient based on theme
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      if (type === 'cyberpunk') {
        grad.addColorStop(0, '#09090b');
        grad.addColorStop(0.5, '#2e1065');
        grad.addColorStop(1, '#022c22');
      } else if (type === 'space') {
        grad.addColorStop(0, '#030712');
        grad.addColorStop(0.5, '#0c4a6e');
        grad.addColorStop(1, '#064e3b');
      } else if (type === 'culinary') {
        grad.addColorStop(0, '#1c1917');
        grad.addColorStop(0.5, '#78350f');
        grad.addColorStop(1, '#451a03');
      } else if (type === 'nature') {
        grad.addColorStop(0, '#022c22');
        grad.addColorStop(0.5, '#064e3b');
        grad.addColorStop(1, '#0f172a');
      } else {
        grad.addColorStop(0, '#18181b');
        grad.addColorStop(0.5, '#3b0764');
        grad.addColorStop(1, '#111827');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Cyberpunk Grid / Waves
      if (type === 'cyberpunk' || type === 'urban') {
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.25)';
        ctx.lineWidth = 1.5;
        const horizon = h * 0.65;
        for (let i = -10; i < 20; i++) {
          ctx.beginPath();
          ctx.moveTo(w / 2, horizon);
          ctx.lineTo(w / 2 + i * 40, h);
          ctx.stroke();
        }

        const offset = (frame * 1.2) % 30;
        for (let y = horizon; y < h; y += 22) {
          ctx.beginPath();
          ctx.moveTo(0, y + offset);
          ctx.lineTo(w, y + offset);
          ctx.stroke();
        }
      }

      // Bioluminescent or snow particles
      particles.forEach((p) => {
        if (isPlaying) {
          p.y -= p.speedY;
          p.x += p.speedX + Math.sin(frame * 0.02 + p.y * 0.01) * 0.4;
          if (p.y < -10) p.y = h + 10;
          if (p.x < -10) p.x = w + 10;
          if (p.x > w + 10) p.x = -10;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        if (type === 'space') {
          ctx.fillStyle = `rgba(56, 189, 248, ${0.4 + Math.sin(frame * 0.05 + p.x) * 0.3})`;
        } else if (type === 'culinary') {
          ctx.fillStyle = `rgba(251, 146, 60, ${0.4 + Math.sin(frame * 0.05 + p.x) * 0.3})`;
        } else if (type === 'nature') {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + Math.sin(frame * 0.05 + p.x) * 0.3})`;
        } else {
          ctx.fillStyle = `rgba(52, 211, 153, ${0.5 + Math.sin(frame * 0.05 + p.x) * 0.3})`;
        }
        ctx.fill();
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [type, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={700}
      className="w-full h-full object-cover"
    />
  );
};
