"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Container,
  Flex,
  Grid,
  HStack,
  IconButton,
  Image,
  Link,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowRight,
  CircleDollarSign,
  Eye,
  GitBranch,
  Globe2,
  Layers3,
  LockKeyhole,
  Menu,
  ScanText,
  ShieldCheck,
  Shuffle,
  Usb,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
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
    eyebrow: "Forget token approvals",
    title: "Batch Transactions, save clicks. Pay gas in stablecoins",
    body: "Combines complex actions into a single transaction. No ETH? no problem, pay gas in any supported ERC20 token.",
    icon: <Layers3 size={18} />,
    accent: palette.yellow,
    proofs: ["EIP-7702", "ERC-5792"],
  },
  {
    id: "signing",
    eyebrow: "Clear signing",
    title: "See what you sign.",
    body: "Never be in the dark of what you are signing with human readable transaction summary and simulated balance changes.",
    icon: <Eye size={18} />,
    accent: palette.amberSoft,
    proofs: ["ERC-7730"],
  },
  {
    id: "accounts",
    eyebrow: "Hardware + multisig",
    title: "Ledger and Safe work everywhere.",
    body: "Use Ledger hardware wallets and Safe multisig accounts across all your dapps.",
    icon: <Usb size={18} />,
    accent: palette.green,
    proofs: ["Ledger", "Safe", "Bankr"],
  },
  {
    id: "privacy",
    eyebrow: "Privacy Pools",
    title: "Privacy at your fingertips",
    body: "Shield ETH and keep your onchain history unlinked, powered by Privacy Pools",
    icon: <ShieldCheck size={18} />,
    accent: palette.amberSoft,
    proofs: [],
  },
  {
    id: "swap",
    eyebrow: "Swap and bridge",
    title: "Move assets without leaving the wallet.",
    body: "Quickly swap and bridge your tokens across EVM chains, at the best rates.",
    icon: <Shuffle size={18} />,
    accent: palette.blue,
    proofs: [],
  },
  {
    id: "browser",
    eyebrow: "WalletChan Browser",
    title: "ENS and IPFS feel native in the browser.",
    body: "Browse the decentralized internet via your own local IPFS node.",
    icon: <Globe2 size={18} />,
    accent: palette.blue,
    proofs: [],
  },
  {
    id: "chains",
    eyebrow: "Every EVM chain",
    title: "Built-in chains, custom RPCs, same wallet.",
    body: "All your favorite EVM chains supported, plus testnets for devs.",
    icon: <GitBranch size={18} />,
    accent: palette.amberSoft,
    proofs: [],
  },
  // {
  //   id: "trust",
  //   eyebrow: "Open source, no tracking",
  //   title: "A wallet users can inspect.",
  //   body: "WalletChan is fully open source, privacy-minded, and built around local secret storage instead of behavioral tracking.",
  //   icon: <LockKeyhole size={18} />,
  //   accent: palette.green,
  //   proofs: ["public source", "no user tracking", "local vault"],
  // },
  // {
  //   id: "token",
  //   eyebrow: "Powered by $WCHAN",
  //   title: "The token sits inside the product loop.",
  //   body: "WCHAN connects wallet routes, staking tiers, community utilities, and the broader WalletChan ecosystem without making Bankr the only story.",
  //   icon: <Zap size={18} />,
  //   accent: palette.yellow,
  //   proofs: ["staking tiers", "wallet routes", "ecosystem identity"],
  // },
];

const navItems = [
  { label: "Features", href: "#features" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "$WCHAN", href: "#wchan" },
  { label: "Docs", href: "https://docs.walletchan.com" },
];

export function HeroStorySection() {
  const [active, setActive] = useState<StoryId>("home");
  const [navCondensed, setNavCondensed] = useState(false);
  const refs = useRef<Record<StoryId, HTMLElement | null>>(
    {} as Record<StoryId, HTMLElement | null>,
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const storyId = visible?.target.getAttribute("data-story-id");
        if (storyId) setActive(storyId as StoryId);
      },
      { rootMargin: "-32% 0px -44% 0px", threshold: [0.12, 0.28, 0.48, 0.68] },
    );
    (["home", ...storySteps.map((step) => step.id)] as StoryId[]).forEach(
      (id) => {
        const node = refs.current[id];
        if (node) observer.observe(node);
      },
    );
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setNavCondensed(window.scrollY > 48);
      });
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.cancelAnimationFrame(frame);
    };
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
        opacity: 0.46,
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.032) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        pointerEvents: "none",
      }}
      _after={{
        content: '""',
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(180deg, rgba(9,9,11,0.02) 0%, rgba(9,9,11,0.28) 36%, rgba(9,9,11,0.94) 100%)",
        pointerEvents: "none",
      }}
    >
      <V2Nav condensed={navCondensed} />
      <Container maxW="7xl" position="relative" zIndex={2}>
        <Grid
          templateColumns={{
            base: "1fr",
            lg: "minmax(0, 0.86fr) minmax(400px, 0.94fr)",
          }}
          gap={{ base: 10, lg: 8, xl: 14 }}
          alignItems="start"
        >
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
            top="96px"
            mt="-64px"
            transform={
              active === "home"
                ? "translate3d(clamp(56px, 7vw, 150px), 0, 0)"
                : active === "browser"
                  ? "translate3d(clamp(12px, calc(12px + (100vw - 1320px) * 0.12), 68px), 0, 0)"
                  : "translate3d(clamp(42px, calc(42px + (100vw - 1320px) * 0.35), 156px), 0, 0)"
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

function HeroCopy({
  active,
  setRef,
}: {
  active: boolean;
  setRef: (node: HTMLElement | null) => void;
}) {
  const installTarget = useInstallTarget();

  return (
    <VStack
      id="home"
      data-story-id="home"
      ref={setRef}
      align={{ base: "center", lg: "flex-start" }}
      textAlign={{ base: "center", lg: "left" }}
      spacing={6}
      minH={{ base: "auto", lg: "820px" }}
      pb={{ base: 16, lg: 12 }}
    >
      <Box mt={"6rem"}>
        <Text
          as="h1"
          color={palette.white}
          fontFamily="'Anton', sans-serif"
          textTransform="uppercase"
          fontSize={{ base: "54px", sm: "70px", md: "88px", lg: "96px" }}
          fontWeight="400"
          letterSpacing="0"
          lineHeight="0.92"
        >
          WalletChan
        </Text>
        <Text
          color={palette.white}
          fontSize={{ base: "30px", sm: "40px", md: "50px" }}
          fontWeight="600"
          letterSpacing="0"
          lineHeight="1.04"
          mt={4}
        >
          <GradientText>Web3 moves fast</GradientText>
          <br />
          Your wallet should too.
        </Text>
      </Box>
      <HStack py={4} spacing={4}>
        <Text
          color={palette.muted}
          fontSize={{ base: "17px", md: "20px" }}
          lineHeight="1.65"
          maxW="620px"
        >
          Sign smarter. Move faster:
        </Text>
        <Button
          as="a"
          href={installTarget.href}
          target="_blank"
          h="50px"
          px={6}
          borderRadius="10px"
          bg={palette.yellow}
          color={palette.ink}
          fontWeight="700"
          textTransform="none"
          letterSpacing="0"
          leftIcon={<Image src={installTarget.iconSrc} alt="" boxSize="22px" />}
          rightIcon={<ArrowRight size={17} />}
          _hover={{ bg: palette.amberSoft, transform: "translateY(-2px)" }}
          _active={{ transform: "translateY(0)" }}
        >
          {installTarget.label}
        </Button>
      </HStack>
      <HStack
        spacing={2}
        flexWrap="wrap"
        justify={{ base: "center", lg: "flex-start" }}
      >
        <ProofPill
          icon={<Layers3 size={14} color={palette.yellow} />}
          label="Batch Transactions"
        />
        <ProofPill
          icon={<ShieldCheck size={14} color={palette.green} />}
          label="Privacy Pools shielding"
        />
        <ProofPill
          icon={<Usb size={14} color={palette.blue} />}
          label="Ledger Hardware support"
        />
        <ProofPill
          icon={<UsersRound size={14} color={palette.green} />}
          label="Safe Multisig"
        />
        <ProofPill
          icon={<ScanText size={14} color={palette.blue} />}
          label="Clear Signing"
        />
        <ProofPill
          icon={<CircleDollarSign size={14} color={palette.yellow} />}
          label="Pay gas in stablecoins"
        />
      </HStack>
      <Box display={{ base: "block", lg: "none" }} w="full" pt={4}>
        <StoryMockup active="home" />
      </Box>
    </VStack>
  );
}

function StoryIntro() {
  return (
    <VStack
      align="flex-start"
      spacing={4}
      minH={{ base: "auto", lg: "44vh" }}
      justify="center"
      py={{ base: 12, lg: 8 }}
    >
      <Text
        color={palette.white}
        fontSize={{ base: "42px", md: "72px" }}
        lineHeight="0.92"
        fontWeight="900"
        letterSpacing="0"
        maxW="720px"
      >
        The wallet Ethereum has been waiting for.
      </Text>
      <Text
        color={palette.muted}
        fontSize={{ base: "16px", md: "20px" }}
        lineHeight="1.75"
        maxW="640px"
      >
        WalletChan brings the latest Ethereum innovation into the users hands,
        today.
      </Text>
    </VStack>
  );
}

function StoryStep({
  story,
  index,
  active,
  setRef,
}: {
  story: (typeof storySteps)[number];
  index: number;
  active: boolean;
  setRef: (node: HTMLElement | null) => void;
}) {
  return (
    <Box
      id={story.id === "batching" ? "features" : story.id}
      data-story-id={story.id}
      ref={setRef}
      minH={{ base: "auto", lg: "clamp(620px, 64vh, 840px)" }}
      display="flex"
      alignItems="center"
      py={{ base: 12, lg: 16 }}
    >
      <VStack
        align="flex-start"
        spacing={5}
        opacity={{ base: 1, lg: active ? 1 : 0.52 }}
        transition="opacity 0.25s ease"
      >
        <HStack spacing={3}>
          <HStack
            w="40px"
            h="40px"
            borderRadius="10px"
            justify="center"
            color={story.accent}
            bg={`${story.accent}12`}
            border="1px solid rgba(255,255,255,0.10)"
          >
            {story.icon}
          </HStack>
          <Text
            color={active ? story.accent : palette.faint}
            fontSize="12px"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing="0.04em"
          >
            {String(index + 1).padStart(2, "0")} / {story.eyebrow}
          </Text>
        </HStack>
        <Text
          color={palette.white}
          fontSize={{ base: "34px", md: "56px" }}
          lineHeight="1.02"
          fontWeight="700"
          letterSpacing="0"
          maxW="680px"
        >
          {story.title}
        </Text>
        <Text
          color={palette.muted}
          fontSize={{ base: "16px", md: "20px" }}
          lineHeight="1.75"
          maxW="620px"
        >
          {story.body}
        </Text>
        <HStack spacing={2} flexWrap="wrap">
          {story.proofs.map((proof) => (
            <Text
              key={proof}
              px={3}
              py={1.5}
              borderRadius="999px"
              bg={active ? `${story.accent}10` : palette.ink2}
              color={active ? palette.white : palette.muted}
              border="1px solid rgba(255,255,255,0.10)"
              fontSize="12px"
              fontWeight="700"
            >
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

function V2Nav({ condensed }: { condensed: boolean }) {
  const [open, setOpen] = useState(false);
  const installTarget = useInstallTarget();

  return (
    <Box
      as="header"
      position="fixed"
      top={0}
      left={0}
      right={0}
      zIndex={100}
      pt={condensed ? 2 : 4}
      pointerEvents="none"
      transition="padding-top 260ms cubic-bezier(0.22, 1, 0.36, 1)"
      sx={{
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
        },
      }}
    >
      <Container
        maxW={condensed ? { base: "350px", md: "920px" } : "7xl"}
        w={{
          base: condensed ? "calc(100% - 40px)" : "calc(100% - 32px)",
          md: condensed ? "calc(100% - 80px)" : "calc(100% - 64px)",
        }}
        px={0}
        pointerEvents="auto"
        transition="max-width 440ms cubic-bezier(0.16, 1, 0.3, 1), width 440ms cubic-bezier(0.16, 1, 0.3, 1)"
        sx={{
          "@media (prefers-reduced-motion: reduce)": {
            transition: "none",
          },
        }}
      >
        <Flex
          {...glass}
          borderRadius={condensed ? "16px" : "12px"}
          minH={condensed ? "54px" : "62px"}
          px={{ base: 3, md: condensed ? 3 : 4 }}
          align="center"
          justify="space-between"
          boxShadow={
            condensed
              ? "0 18px 52px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.05)"
              : glass.boxShadow
          }
          transition="min-height 320ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 320ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 320ms ease"
          sx={{
            "@media (prefers-reduced-motion: reduce)": {
              transition: "none",
            },
          }}
        >
          <Link href="/" _hover={{ textDecoration: "none" }}>
            <WalletMark />
          </Link>
          <HStack spacing={7} display={{ base: "none", md: "flex" }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                color={palette.muted}
                fontSize="14px"
                fontWeight="700"
                _hover={{ color: palette.white, textDecoration: "none" }}
              >
                {item.label}
              </Link>
            ))}
          </HStack>
          <HStack spacing={2}>
            <IconButton
              as="a"
              href="/discord"
              target="_blank"
              rel="noreferrer"
              aria-label="Join WalletChan on Discord"
              display={{ base: "none", md: "inline-flex" }}
              bg="transparent"
              color={palette.white}
              border="1px solid rgba(255,255,255,0.14)"
              borderRadius="8px"
              minW="40px"
              w="40px"
              h="40px"
              icon={
                <Image
                  src="/icons/discord-symbol-white.svg"
                  alt=""
                  w="20px"
                  h="15px"
                />
              }
              _hover={{
                bg: "rgba(255,255,255,0.08)",
                borderColor: "rgba(255,255,255,0.24)",
                transform: "translateY(-1px)",
              }}
              _active={{ transform: "scale(0.98)" }}
            />
            <Button
              as="a"
              href={installTarget.href}
              target="_blank"
              bg={palette.yellow}
              color={palette.ink}
              borderRadius="8px"
              px={{ base: 4, md: 5 }}
              h="40px"
              fontSize="14px"
              fontWeight="700"
              textTransform="none"
              letterSpacing="0"
              leftIcon={
                <Image src={installTarget.iconSrc} alt="" boxSize="18px" />
              }
              _hover={{ bg: palette.amberSoft, transform: "translateY(-1px)" }}
              _active={{ transform: "scale(0.98)" }}
            >
              {installTarget.navLabel}
            </Button>
            <IconButton
              aria-label={open ? "Close menu" : "Open menu"}
              display={{ base: "inline-flex", md: "none" }}
              icon={open ? <X size={18} /> : <Menu size={18} />}
              onClick={() => setOpen((value) => !value)}
              borderRadius="8px"
              bg={palette.ink3}
              color={palette.white}
              _hover={{ bg: "rgba(255,255,255,0.14)" }}
            />
          </HStack>
        </Flex>
        {open && (
          <VStack
            {...glass}
            align="stretch"
            display={{ base: "flex", md: "none" }}
            mt={3}
            borderRadius="22px"
            p={2}
          >
            <Link
              href="/discord"
              target="_blank"
              rel="noreferrer"
              color={palette.white}
              px={4}
              py={3}
              borderRadius="16px"
              fontWeight="800"
              onClick={() => setOpen(false)}
              _hover={{ bg: "rgba(255,255,255,0.1)", textDecoration: "none" }}
            >
              Discord
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                color={palette.white}
                px={4}
                py={3}
                borderRadius="16px"
                fontWeight="800"
                onClick={() => setOpen(false)}
                _hover={{ bg: "rgba(255,255,255,0.1)", textDecoration: "none" }}
              >
                {item.label}
              </Link>
            ))}
          </VStack>
        )}
      </Container>
    </Box>
  );
}

function WalletMark() {
  return (
    <HStack spacing={3}>
      <Flex
        w={{ base: "38px", md: "40px" }}
        h={{ base: "38px", md: "40px" }}
        borderRadius="8px"
        bg={palette.white}
        border="1px solid rgba(255,255,255,0.16)"
        align="center"
        justify="center"
      >
        <Image
          src="/images/walletchan-icon-nobg.png"
          alt="WalletChan"
          w="30px"
          h="30px"
        />
      </Flex>
      <Text
        color={palette.white}
        fontFamily="'Anton', sans-serif"
        textTransform="uppercase"
        fontWeight="400"
        fontSize={{ base: "20px", md: "22px" }}
        letterSpacing="0"
      >
        WalletChan
      </Text>
    </HStack>
  );
}

function GradientText({ children }: { children: React.ReactNode }) {
  return (
    <Box as="span" color={palette.yellow}>
      {children}
    </Box>
  );
}

function ProofPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <HStack
      spacing={2}
      px={3}
      py={2}
      borderRadius="999px"
      bg={palette.ink2}
      border="1px solid rgba(255,255,255,0.10)"
      color={palette.white}
    >
      {icon}
      <Text
        fontSize={{ base: "12px", md: "13px" }}
        fontWeight="600"
        whiteSpace="nowrap"
      >
        {label}
      </Text>
    </HStack>
  );
}
