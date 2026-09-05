"use client";

import React, { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface CardPreviewHoverProps {
  cardName: string;
  imageUri?: string | null;
  children: React.ReactNode;
  className?: string;
}

export function CardPreviewHover({
  cardName,
  imageUri,
  children,
  className,
}: CardPreviewHoverProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e: React.MouseEvent) => {
    setIsHovered(true);
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <span
      className={cn("relative inline-block cursor-pointer", className)}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isHovered && imageUri && (
        <div
          className="fixed z-[100] pointer-events-none transition-opacity duration-150 ease-out"
          style={{
            left: `${Math.min(mousePos.x + 20, window.innerWidth - 260)}px`,
            top: `${Math.max(10, Math.min(mousePos.y - 150, window.innerHeight - 360))}px`,
          }}
        >
          <div className="w-[240px] rounded-xl overflow-hidden border border-amber-500/40 shadow-2xl shadow-black/80 bg-slate-950 p-1 foil-card-effect">
            <img
              src={imageUri}
              alt={cardName}
              className="w-full h-auto rounded-lg object-cover"
              loading="eager"
            />
          </div>
        </div>
      )}
    </span>
  );
}
