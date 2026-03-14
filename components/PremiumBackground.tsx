"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

interface PremiumBackgroundProps {
  imageUrl: string;
}

export function PremiumBackground({ imageUrl }: PremiumBackgroundProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <>
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.05] dark:opacity-[0.15] transition-opacity duration-1000 grayscale-[0.5] dark:grayscale-0"
        style={{
          backgroundImage: `url("${imageUrl}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          zIndex: -100
        }}
      />
    </>,
    document.body
  );
}
