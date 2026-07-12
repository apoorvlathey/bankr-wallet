"use client";

import { Box } from "@chakra-ui/react";
import { FinalCta } from "./EcosystemSections";
import { HeroStorySection } from "./HeroStorySection";
import { StatBar } from "./SectionPrimitives";
import { palette } from "./design";

export default function HomeV2Content() {
  return (
    <Box bg={palette.ink} color={palette.white} minH="100vh" overflowX="clip">
      <HeroStorySection />
      <StatBar />
      <FinalCta />
    </Box>
  );
}
