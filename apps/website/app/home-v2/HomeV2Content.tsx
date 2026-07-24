"use client";

import { useEffect } from "react";
import { Box } from "@chakra-ui/react";
import { FinalCta } from "./EcosystemSections";
import { HeroStorySection } from "./HeroStorySection";
import { TestimonialsSection } from "./TestimonialsSection";
import { WchanSection } from "./WchanSection";
import { palette } from "./design";

export default function HomeV2Content() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootBackground = root.style.backgroundColor;
    const previousBodyBackground = body.style.backgroundColor;

    root.style.backgroundColor = palette.ink;
    body.style.backgroundColor = palette.ink;

    return () => {
      root.style.backgroundColor = previousRootBackground;
      body.style.backgroundColor = previousBodyBackground;
    };
  }, []);

  return (
    <Box
      bg={palette.ink}
      color={palette.white}
      minH="100vh"
      overflowX="clip"
      fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    >
      <HeroStorySection />
      <TestimonialsSection />
      <WchanSection />
      <FinalCta />
    </Box>
  );
}
