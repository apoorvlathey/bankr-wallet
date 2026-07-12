"use client";

import { Box } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

const mockupYaw = keyframes`
  0%, 100% {
    transform: rotateX(2deg) rotateY(-10deg) translate3d(0, 0, 0);
  }
  50% {
    transform: rotateX(2deg) rotateY(6deg) translate3d(0, 0, 16px);
  }
`;

const shadowDrift = keyframes`
  0%, 100% {
    opacity: 0.44;
    transform: translate3d(30px, 36px, -70px) rotateX(70deg) scaleX(0.92) scaleY(0.86);
  }
  50% {
    opacity: 0.32;
    transform: translate3d(-8px, 36px, -70px) rotateX(70deg) scaleX(0.82) scaleY(0.86);
  }
`;

export function Mockup3DStage({ children }: { children: any }) {
  return (
    <Box
      position="relative"
      sx={{
        perspective: "1200px",
        perspectiveOrigin: "48% 38%",
        transformStyle: "preserve-3d",
        "@media (prefers-reduced-motion: reduce)": {
          ".mockup-3d-plane, .mockup-3d-shadow": {
            animation: "none",
          },
          ".mockup-3d-plane": {
            transform: "rotateX(2deg) rotateY(-6deg)",
          },
        },
      }}
    >
      <Box
        className="mockup-3d-shadow"
        position="absolute"
        left="10%"
        right="4%"
        top="7%"
        bottom="6%"
        borderRadius="36px"
        bg="rgba(0,0,0,0.58)"
        filter="blur(34px)"
        pointerEvents="none"
        animation={`${shadowDrift} 8s ease-in-out infinite`}
      />
      <Box
        className="mockup-3d-plane"
        position="relative"
        sx={{
          transformStyle: "preserve-3d",
          transformOrigin: "center center",
          backfaceVisibility: "hidden",
          willChange: "transform",
        }}
        animation={`${mockupYaw} 8s ease-in-out infinite`}
      >
        {children}
      </Box>
    </Box>
  );
}
