// @ts-nocheck

"use client";

import React, { useRef, useEffect } from "react";

export default function InteractiveGrayParticleMemoize() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const isTouchingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const updateCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight / 2;
    };

    updateCanvasSize();

    let particles: {
      x: number;
      y: number;
      baseX: number;
      baseY: number;
      size: number;
      color: string;
      life: number;
    }[] = [];

    let textImageData: ImageData | null = null;

    function createTextImage() {
      if (!ctx || !canvas) return;
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const fontSize = Math.min(canvas.width / 8, canvas.height / 4);
      ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;

      const yPosition = canvas.height / 2;

      ctx.fillText("MEMOIZE", canvas.width / 2, yPosition);

      textImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function createParticle() {
      if (!ctx || !canvas || !textImageData) return null;

      const data = textImageData.data;
      const particleGap = 2;

      for (let attempt = 0; attempt < 100; attempt++) {
        const x = Math.floor(Math.random() * canvas.width);
        const y = Math.floor(Math.random() * canvas.height);

        if (data[(y * canvas.width + x) * 4 + 3] > 128) {
          const gray = Math.floor(Math.random() * 100 + 100);
          return {
            x: x + Math.random() * particleGap - particleGap / 2,
            y: y + Math.random() * particleGap - particleGap / 2,
            baseX: x,
            baseY: y,
            size: Math.random() * 1 + 0.5,
            color: `rgb(${gray}, ${gray}, ${gray})`,
            life: Math.random() * 100 + 50,
          };
        }
      }

      return null;
    }

    function createInitialParticles() {
      const particleCount = Math.floor((canvas.width * canvas.height) / 400);
      for (let i = 0; i < particleCount; i++) {
        const particle = createParticle();
        if (particle) particles.push(particle);
      }
    }

    let animationFrameId: number;

    function animate() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#00000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const { x: mouseX, y: mouseY } = mousePositionRef.current;
      const maxDistance = 240;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (
          distance < maxDistance &&
          (isTouchingRef.current || !("ontouchstart" in window))
        ) {
          const force = (maxDistance - distance) / maxDistance;
          const angle = Math.atan2(dy, dx);
          const moveX = Math.cos(angle) * force * 60;
          const moveY = Math.sin(angle) * force * 60;
          p.x = p.baseX - moveX;
          p.y = p.baseY - moveY;
        } else {
          p.x += (p.baseX - p.x) * 0.1;
          p.y += (p.baseY - p.y) * 0.1;
        }

        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);

        p.life--;
        if (p.life <= 0) {
          const newParticle = createParticle();
          if (newParticle) {
            particles[i] = newParticle;
          } else {
            particles.splice(i, 1);
            i--;
          }
        }
      }

      while (
        particles.length < Math.floor((canvas.width * canvas.height) / 400)
      ) {
        const newParticle = createParticle();
        if (newParticle) particles.push(newParticle);
      }

      animationFrameId = requestAnimationFrame(animate);
    }

    createTextImage();
    createInitialParticles();
    animate();

    const handleResize = () => {
      updateCanvasSize();
      createTextImage();
      particles = [];
      createInitialParticles();
    };

    const handleMove = (x: number, y: number) => {
      mousePositionRef.current = { x, y };
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleTouchStart = () => {
      isTouchingRef.current = true;
    };

    const handleTouchEnd = () => {
      isTouchingRef.current = false;
      mousePositionRef.current = { x: 0, y: 0 };
    };

    const handleMouseLeave = () => {
      if (!("ontouchstart" in window)) {
        mousePositionRef.current = { x: 0, y: 0 };
      }
    };

    window.addEventListener("resize", handleResize);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("touchstart", handleTouchStart);
    canvas.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("resize", handleResize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchend", handleTouchEnd);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-full h-[50dvh] bg-background">
      <canvas
        ref={canvasRef}
        className="w-full h-[50dvh] touch-none"
        aria-label="Interactive particle effect displaying the word MEMOIZE"
      />
    </div>
  );
}
