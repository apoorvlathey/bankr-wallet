"use client";

import { useEffect, useState } from "react";
import { Box, usePrefersReducedMotion } from "@chakra-ui/react";
import { SwapBridgeScreen } from "./SwapBridgeScreens";
import { warmMockup } from "./design";

const preserve3d = { transformStyle: "preserve-3d" } as const;
const FACE_RADIUS = 238;
const frames = ["bridge-entry", "bridge-confirm", "swap-entry", "swap-confirm"] as const;
type Frame = (typeof frames)[number];

export function SwapBridgePreview() {
  const [rotationStep, setRotationStep] = useState(0);
  const [isPressing, setIsPressing] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const activeFrameIndex = rotationStep % frames.length;

  useEffect(() => {
    if (prefersReducedMotion) return;

    setIsPressing(false);
    const pressTimer = window.setTimeout(() => setIsPressing(true), 2140);
    const advanceTimer = window.setTimeout(() => {
      setIsPressing(false);
      setRotationStep((step) => step + 1);
    }, 2600);

    return () => {
      window.clearTimeout(pressTimer);
      window.clearTimeout(advanceTimer);
    };
  }, [prefersReducedMotion, rotationStep]);

  return (
    <Box
      bg={warmMockup.base}
      color={warmMockup.text}
      minH="680px"
      borderRadius="22px"
      overflow="visible"
      position="relative"
      sx={{ ...preserve3d, perspective: "1100px" }}
    >
      <Box
        position="absolute"
        inset={0}
        transform={`translateZ(-${FACE_RADIUS}px) rotateY(${-rotationStep * 90}deg)`}
        transition={
          prefersReducedMotion
            ? "none"
            : "transform 0.82s cubic-bezier(0.22, 1, 0.36, 1)"
        }
        willChange="transform"
        sx={{
          ...preserve3d,
          transformOrigin: "center center",
          backfaceVisibility: "hidden",
        }}
      >
        {frames.map((frame, index) => {
          const distance = getFaceDistance(index, activeFrameIndex);
          const isActive = distance === 0;

          return (
            <Box
              key={frame}
              position="absolute"
              inset={0}
              pointerEvents={isActive ? "auto" : "none"}
              sx={{
                ...preserve3d,
                backfaceVisibility: "hidden",
                transform: `rotateY(${index * 90}deg) translateZ(${FACE_RADIUS}px)`,
              }}
            >
              <SwapBridgeScreen
                mode={frame.startsWith("bridge") ? "bridge" : "swap"}
                screen={frame.endsWith("confirm") ? "confirm" : "entry"}
                isPressing={isPressing && index === activeFrameIndex}
              />
              {!isActive && <InactiveFaceShade distance={distance} />}
            </Box>
          );
        })}
      </Box>
      <AmbientSideFog side="left" />
      <AmbientSideFog side="right" />
    </Box>
  );
}

function getFaceDistance(index: number, activeIndex: number) {
  const forward = (index - activeIndex + frames.length) % frames.length;
  const backward = (activeIndex - index + frames.length) % frames.length;
  return Math.min(forward, backward);
}

function InactiveFaceShade({ distance }: { distance: number }) {
  return (
    <Box
      pointerEvents="none"
      position="absolute"
      inset="-18px"
      borderRadius="32px"
      bg={distance === 1 ? "rgba(5,7,12,0.7)" : "rgba(5,7,12,0.9)"}
      boxShadow={
        distance === 1
          ? "inset 0 0 140px rgba(0,0,0,0.72), 0 42px 110px rgba(0,0,0,0.68)"
          : "inset 0 0 180px rgba(0,0,0,0.86), 0 54px 130px rgba(0,0,0,0.78)"
      }
      transform="translateZ(2px)"
      sx={{ backfaceVisibility: "hidden" }}
    />
  );
}

function AmbientSideFog({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";

  return (
    <Box
      pointerEvents="none"
      position="absolute"
      top="-40px"
      bottom="-40px"
      left={isLeft ? "-170px" : undefined}
      right={isLeft ? undefined : "-260px"}
      w={isLeft ? "190px" : "280px"}
      zIndex={2}
      bg={
        isLeft
          ? "linear-gradient(90deg, rgba(5,7,12,0) 0%, rgba(5,7,12,0.42) 54%, rgba(5,7,12,0.88) 100%)"
          : "linear-gradient(270deg, rgba(5,7,12,0) 0%, rgba(5,7,12,0.56) 46%, rgba(5,7,12,0.94) 100%)"
      }
      backdropFilter="blur(4px)"
      boxShadow={isLeft ? "48px 0 90px rgba(0,0,0,0.42)" : "-48px 0 90px rgba(0,0,0,0.42)"}
      sx={{
        WebkitMaskImage: isLeft
          ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.22) 42%, #000 100%)"
          : "linear-gradient(270deg, transparent 0%, rgba(0,0,0,0.3) 38%, #000 100%)",
        maskImage: isLeft
          ? "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.22) 42%, #000 100%)"
          : "linear-gradient(270deg, transparent 0%, rgba(0,0,0,0.3) 38%, #000 100%)",
      }}
    />
  );
}
