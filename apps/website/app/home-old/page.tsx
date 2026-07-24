"use client";

import { Box } from "@chakra-ui/react";
import {
  Navigation,
  TokenBanner,
  Hero,
  StatsBar,
  Features,
  TokenSection,
  InstallGuide,
  Screenshots,
  TweetGrid,
  FinalCTA,
  Footer,
} from "../components";

export default function HomeOldPage() {
  return (
    <Box as="main" minH="100vh" bg="bauhaus.background">
      <Navigation />
      <TokenBanner />
      <Hero />
      <StatsBar />
      <TweetGrid />
      <Box borderBottom="4px solid" borderColor="bauhaus.border" />
      <Features />
      <TokenSection />
      <InstallGuide />
      <Screenshots />
      <FinalCTA />
      <Footer />
    </Box>
  );
}
