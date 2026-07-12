"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Button, Container, Flex, Grid, HStack, IconButton, Image, Link, Text, VStack } from "@chakra-ui/react";
import { ArrowRight, Eye, GitBranch, Github, Globe2, Layers3, LockKeyhole, Menu, Rocket, Shuffle, Sparkles, X, Zap } from "lucide-react";
import { glass, palette } from "./design";
import { StoryMockup, type StoryId } from "./StoryMockup";
import { useInstallTarget } from "./useInstallTarget";

const storySteps: Array<{
  id: Exclude<StoryId, "home">;
  eyebrow: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  accent: string;
  proofs: string[];
}> = [
  {
    id: "batching",
    eyebrow: "7702 + 5792 + 7821",
    title: "One review instead of an approval maze.",
    body: "WalletChan turns approve, swap, revoke, and other multi-step flows into one readable review when the account and chain support batching.",
    icon: <Layers3 size={18} />,
    accent: palette.yellow,
    proofs: ["7702 smart accounts", "5792 batch txs", "fewer stale approvals"],
  },
  {
    id: "signing",
    eyebrow: "Clear signing",
    title: "Know what changes before you sign.",
    body: "Decoded calldata, ERC-7730 descriptors, SIWE parsing, asset-change simulation, and rich history give transactions real context.",
    icon: <Eye size={18} />,
    accent: palette.green,
    proofs: ["decoded calldata", "asset simulation", "native SIWE"],
  },
  {
    id: "swap",
    eyebrow: "Swap and bridge",
    title: "Move assets without leaving the wallet.",
    body: "WalletChan keeps common routes close to the signing surface, so users can swap, bridge, and verify the route inside one wallet flow.",
    icon: <Shuffle size={18} />,
    accent: palette.blue,
    proofs: ["in-wallet routes", "bridge preview", "WCHAN paths"],
  },
  {
    id: "browser",
    eyebrow: "Browser superpowers",
    title: "ENS and IPFS feel native in the browser.",
    body: "Resolve ENS contenthashes, open IPFS/IPNS content, and serve onchain pages through a local Kubo node when configured.",
    icon: <Globe2 size={18} />,
    accent: palette.cyan,
    proofs: ["ENS browsing", "local IPFS", "WalletChan OS"],
  },
  {
    id: "chains",
    eyebrow: "Every EVM chain",
    title: "Built-in chains, custom RPCs, same wallet.",
    body: "Users can add any EVM chain while WalletChan surfaces chain-specific UX like Flashblocks where the network supports it.",
    icon: <GitBranch size={18} />,
    accent: palette.violet,
    proofs: ["custom chains", "Flashblocks", "per-tab network state"],
  },
  {
    id: "trust",
    eyebrow: "Open source, no tracking",
    title: "A wallet users can inspect.",
    body: "WalletChan is fully open source, privacy-minded, and built around local secret storage instead of behavioral tracking.",
    icon: <LockKeyhole size={18} />,
    accent: palette.green,
    proofs: ["public source", "no user tracking", "local vault"],
  },
  {
    id: "token",
    eyebrow: "Powered by $WCHAN",
    title: "The token sits inside the product loop.",
    body: "WCHAN connects wallet routes, staking tiers, community utilities, and the broader WalletChan ecosystem without making Bankr the only story.",
    icon: <Zap size={18} />,
    accent: palette.yellow,
    proofs: ["staking tiers", "wallet routes", "ecosystem identity"],
  },
];

const navItems = [
  { label: "Batching", href: "#batching" },
  { label: "Signing", href: "#signing" },
  { label: "Browser", href: "#browser" },
  { label: "Trust", href: "#trust" },
  { label: "$WCHAN", href: "#token" },
];

export function HeroStorySection() {
  const [active, setActive] = useState<StoryId>("home");
  const refs = useRef<Record<StoryId, HTMLElement | null>>({} as Record<StoryId, HTMLElement | null>);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id as StoryId);
      },
      { rootMargin: "-32% 0px -44% 0px", threshold: [0.12, 0.28, 0.48, 0.68] },
    );
    (["home", ...storySteps.map((step) => step.id)] as StoryId[]).forEach((id) => {
      const node = refs.current[id];
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      as="section"
      position="relative"
      pt={{ base: 28, md: 32, lg: 36 }}
      pb={{ base: 12, lg: 24 }}
      _before={{
        content: '""',
        position: "absolute",
        inset: 0,
        opacity: 0.72,
        backgroundImage: "linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        pointerEvents: "none",
      }}
      _after={{
        content: '""',
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, rgba(7,7,7,0.08) 0%, rgba(7,7,7,0.38) 34%, rgba(7,7,7,0.92) 100%)",
        pointerEvents: "none",
      }}
    >
      <V2Nav />
      <Container maxW="7xl" position="relative" zIndex={2}>
        <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 0.86fr) minmax(400px, 0.94fr)" }} gap={{ base: 10, lg: 8, xl: 14 }} alignItems="start">
          <VStack align="stretch" spacing={0}>
            <HeroCopy
              active={active === "home"}
              setRef={(node) => {
                refs.current.home = node;
              }}
            />
            <StoryIntro />
            {storySteps.map((story, index) => (
              <StoryStep
                key={story.id}
                story={story}
                index={index}
                active={active === story.id}
                setRef={(node) => {
                  refs.current[story.id] = node;
                }}
              />
            ))}
          </VStack>

          <Box
            display={{ base: "none", lg: "block" }}
            position="sticky"
            top="24px"
            transform={
              active === "home"
                ? "translateX(clamp(56px, 7vw, 150px))"
                : active === "browser"
                  ? "translateX(clamp(12px, calc(12px + (100vw - 1320px) * 0.12), 68px))"
                  : "translateX(clamp(42px, calc(42px + (100vw - 1320px) * 0.35), 156px))"
            }
            transition="transform 0.48s cubic-bezier(0.22, 1, 0.36, 1)"
            willChange="transform"
          >
            <StoryMockup active={active} />
          </Box>
        </Grid>
      </Container>
    </Box>
  );
}

function HeroCopy({ active, setRef }: { active: boolean; setRef: (node: HTMLElement | null) => void }) {
  const installTarget = useInstallTarget();

  return (
    <VStack id="home" ref={setRef} align={{ base: "center", lg: "flex-start" }} textAlign={{ base: "center", lg: "left" }} spacing={6} minH={{ base: "auto", lg: "820px" }} justify="center" pb={{ base: 16, lg: 12 }}>
      <ProofPill icon={<Rocket size={15} color={palette.yellow} />} label="Modern wallet ERCs, shipped fast" />
      <Box>
        <Text as="h1" color={palette.white} fontSize={{ base: "58px", sm: "74px", md: "96px", lg: "110px" }} fontWeight="900" letterSpacing="0" lineHeight="0.86">
          WalletChan
        </Text>
        <Text color={palette.white} fontSize={{ base: "30px", sm: "42px", md: "54px" }} fontWeight="800" letterSpacing="0" lineHeight="1.02" mt={4}>
          <GradientText>Sign smarter.</GradientText>
          <br />
          Move faster.
        </Text>
      </Box>
      <Text color={palette.muted} fontSize={{ base: "17px", md: "20px" }} lineHeight="1.65" maxW="620px">
        Bundle approvals, preview asset changes, decode calldata, swap and bridge, and browse ENS/IPFS from one open-source browser wallet that moves fast on Ethereum UX.
      </Text>
      <Button as="a" href={installTarget.href} target="_blank" h="52px" px={7} borderRadius="999px" bg={palette.yellow} color={palette.ink} fontWeight="900" textTransform="none" letterSpacing="0" leftIcon={<Image src={installTarget.iconSrc} alt="" boxSize="22px" />} rightIcon={<ArrowRight size={17} />} _hover={{ bg: palette.white, transform: "translateY(-2px)" }}>
        {installTarget.label}
      </Button>
      <HStack spacing={2} flexWrap="wrap" justify={{ base: "center", lg: "flex-start" }}>
        <ProofPill icon={<Sparkles size={14} color={palette.yellow} />} label="7702 + 5792 + 7730" />
        <ProofPill icon={<Github size={14} color={palette.yellow} />} label="Open source, no tracking" />
        <ProofPill icon={<Layers3 size={14} color={palette.cyan} />} label="One review, many actions" />
        <ProofPill icon={<Eye size={14} color={palette.green} />} label="Know before you sign" />
        <ProofPill icon={<Globe2 size={14} color={palette.violet} />} label="Onchain browser mode" />
      </HStack>
      <Box display={{ base: "block", lg: "none" }} w="full" pt={4}>
        <StoryMockup active="home" />
      </Box>
    </VStack>
  );
}

function StoryIntro() {
  return (
    <VStack align="flex-start" spacing={4} minH={{ base: "auto", lg: "44vh" }} justify="center" py={{ base: 12, lg: 8 }}>
      <HStack spacing={2} color={palette.yellow}>
        <Sparkles size={16} />
        <Text fontSize="13px" fontWeight="900" textTransform="uppercase" letterSpacing="0">Product tour</Text>
      </HStack>
      <Text color={palette.white} fontSize={{ base: "42px", md: "72px" }} lineHeight="0.92" fontWeight="900" letterSpacing="0" maxW="720px">
        One wallet surface. Seven product advantages.
      </Text>
      <Text color={palette.muted} fontSize={{ base: "16px", md: "20px" }} lineHeight="1.75" maxW="640px">
        The preview does not reset after the hero. It keeps the same wallet surface and morphs into each feature state as the story moves.
      </Text>
    </VStack>
  );
}

function StoryStep({ story, index, active, setRef }: { story: (typeof storySteps)[number]; index: number; active: boolean; setRef: (node: HTMLElement | null) => void }) {
  return (
    <Box id={story.id} ref={setRef} minH={{ base: "auto", lg: "78vh" }} display="flex" alignItems="center" py={{ base: 12, lg: 16 }}>
      <VStack align="flex-start" spacing={5} opacity={{ base: 1, lg: active ? 1 : 0.52 }} transition="opacity 0.25s ease">
        <HStack spacing={3}>
          <HStack w="42px" h="42px" borderRadius="15px" justify="center" color={story.accent} bg={`${story.accent}18`} border="1px solid rgba(255,255,255,0.12)">
            {story.icon}
          </HStack>
          <Text color={active ? story.accent : palette.faint} fontSize="13px" fontWeight="900" textTransform="uppercase" letterSpacing="0">
            {String(index + 1).padStart(2, "0")} / {story.eyebrow}
          </Text>
        </HStack>
        <Text color={palette.white} fontSize={{ base: "34px", md: "58px" }} lineHeight="0.98" fontWeight="900" letterSpacing="0" maxW="680px">
          {story.title}
        </Text>
        <Text color={palette.muted} fontSize={{ base: "16px", md: "20px" }} lineHeight="1.75" maxW="620px">
          {story.body}
        </Text>
        <HStack spacing={2} flexWrap="wrap">
          {story.proofs.map((proof) => (
            <Text key={proof} px={3} py={1.5} borderRadius="999px" bg={active ? `${story.accent}18` : "rgba(255,255,255,0.07)"} color={active ? palette.white : palette.muted} border="1px solid rgba(255,255,255,0.12)" fontSize="12px" fontWeight="900">
              {proof}
            </Text>
          ))}
        </HStack>
        <Box display={{ base: "block", lg: "none" }} w="full" pt={4}>
          <StoryMockup active={story.id} />
        </Box>
      </VStack>
    </Box>
  );
}

function V2Nav() {
  const [open, setOpen] = useState(false);
  const installTarget = useInstallTarget();

  return (
    <Box as="header" position="absolute" top={0} left={0} right={0} zIndex={20} px={{ base: 4, md: 8 }} py={4}>
      <Container maxW="7xl" px={0}>
        <Flex {...glass} borderRadius="24px" minH="64px" px={{ base: 3, md: 5 }} align="center" justify="space-between">
          <Link href="/" _hover={{ textDecoration: "none" }}><WalletMark /></Link>
          <HStack spacing={7} display={{ base: "none", md: "flex" }}>
            {navItems.map((item) => <Link key={item.href} href={item.href} color={palette.muted} fontSize="14px" fontWeight="700" _hover={{ color: palette.white, textDecoration: "none" }}>{item.label}</Link>)}
          </HStack>
          <HStack spacing={2}>
            <Button as="a" href={installTarget.href} target="_blank" bg={palette.white} color={palette.ink} borderRadius="999px" px={{ base: 4, md: 5 }} h="42px" fontSize="14px" fontWeight="900" textTransform="none" letterSpacing="0" leftIcon={<Image src={installTarget.iconSrc} alt="" boxSize="18px" />} _hover={{ bg: palette.yellow, transform: "translateY(-1px)" }} _active={{ transform: "scale(0.98)" }}>
              {installTarget.navLabel}
            </Button>
            <IconButton aria-label={open ? "Close menu" : "Open menu"} display={{ base: "inline-flex", md: "none" }} icon={open ? <X size={18} /> : <Menu size={18} />} onClick={() => setOpen((value) => !value)} borderRadius="14px" bg="rgba(255,255,255,0.08)" color={palette.white} _hover={{ bg: "rgba(255,255,255,0.14)" }} />
          </HStack>
        </Flex>
        {open && (
          <VStack {...glass} align="stretch" display={{ base: "flex", md: "none" }} mt={3} borderRadius="22px" p={2}>
            {navItems.map((item) => <Link key={item.href} href={item.href} color={palette.white} px={4} py={3} borderRadius="16px" fontWeight="800" onClick={() => setOpen(false)} _hover={{ bg: "rgba(255,255,255,0.1)", textDecoration: "none" }}>{item.label}</Link>)}
          </VStack>
        )}
      </Container>
    </Box>
  );
}

function WalletMark() {
  return (
    <HStack spacing={3}>
      <Flex w={{ base: "38px", md: "42px" }} h={{ base: "38px", md: "42px" }} borderRadius="14px" bg="rgba(255,255,255,0.1)" border="1px solid rgba(255,255,255,0.16)" align="center" justify="center">
        <Image src="/images/walletchan-icon-nobg.png" alt="WalletChan" w="30px" h="30px" />
      </Flex>
      <Text color={palette.white} fontWeight="900" fontSize={{ base: "18px", md: "20px" }} letterSpacing="0">WalletChan</Text>
    </HStack>
  );
}

function GradientText({ children }: { children: React.ReactNode }) {
  return <Box as="span" bgGradient={`linear(90deg, ${palette.white}, ${palette.yellow}, ${palette.cyan})`} bgClip="text" color="transparent">{children}</Box>;
}

function ProofPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <HStack spacing={2} px={3} py={2} borderRadius="999px" bg="rgba(255,255,255,0.07)" border="1px solid rgba(255,255,255,0.12)" color={palette.white}>
      {icon}
      <Text fontSize={{ base: "12px", md: "13px" }} fontWeight="800" whiteSpace="nowrap">{label}</Text>
    </HStack>
  );
}
