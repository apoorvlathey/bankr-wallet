"use client";

import {
  Avatar,
  Box,
  Container,
  Grid,
  HStack,
  Link,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLink } from "lucide-react";
import { VerifiedBadge } from "../components/ui/TweetCard";
import { getTweetId } from "../data/tweets";
import { palette } from "./design";

type Testimonial = {
  url: string;
  text: string;
  author: {
    name: string;
    handle: string;
    avatar: string;
    verified: boolean;
  };
  desktopSpan: number;
  featured?: boolean;
};

const testimonials: Testimonial[] = [
  {
    url: "https://x.com/walletbeat/status/2071509714915995684",
    text: "WalletChan gets it right. Be like WalletChan.",
    author: {
      name: "Walletbeat 🌸",
      handle: "walletbeat",
      avatar:
        "https://pbs.twimg.com/profile_images/2040711101583622144/xqmA8M9i_normal.jpg",
      verified: true,
    },
    desktopSpan: 5,
    featured: true,
  },
  {
    url: "https://x.com/Thealphacruze/status/2076661050837979564",
    text: "WalletChan is just really nice, also if you on desktop and like the side window thing, then WalletChan is for you",
    author: {
      name: "alphacruze.eth",
      handle: "Thealphacruze",
      avatar:
        "https://pbs.twimg.com/profile_images/1991575535747518464/WBVHFthR_normal.jpg",
      verified: true,
    },
    desktopSpan: 7,
    featured: true,
  },
  {
    url: "https://x.com/buildonbase/status/2064734200486326501",
    text: "@apoorveth for @walletchan_",
    author: {
      name: "Base Build",
      handle: "buildonbase",
      avatar:
        "https://pbs.twimg.com/profile_images/2059715248584609797/YZBgTH3j_normal.jpg",
      verified: true,
    },
    desktopSpan: 3,
  },
  {
    url: "https://x.com/alexanderchopan/status/2076407603769520207",
    text: "walletchan is impressive",
    author: {
      name: "accountless.eth",
      handle: "alexanderchopan",
      avatar:
        "https://pbs.twimg.com/profile_images/2080126006711697408/qcKSuO6f_normal.jpg",
      verified: true,
    },
    desktopSpan: 3,
  },
  {
    url: "https://x.com/0xDataWolf/status/2077919026182037858",
    text: "@apoorveth @WalletChan_ Wow you sold me on it 😍",
    author: {
      name: "Data Wolf 🐺",
      handle: "0xDataWolf",
      avatar:
        "https://pbs.twimg.com/profile_images/2006332466861391872/N8viCFUp_normal.jpg",
      verified: true,
    },
    desktopSpan: 3,
  },
  {
    url: "https://x.com/philipliao_/status/2056390281252258063",
    text: "Love to see it.",
    author: {
      name: "Phil 🍵",
      handle: "philipliao_",
      avatar:
        "https://pbs.twimg.com/profile_images/1949184689803264000/AzqxiyR5_normal.jpg",
      verified: true,
    },
    desktopSpan: 3,
  },
];

function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function renderTweetText(text: string) {
  return text.split(/(@[A-Za-z0-9_]+)/g).map((part, index) => {
    if (!part.startsWith("@")) return part;

    return (
      <Link
        key={`${part}-${index}`}
        href={`https://x.com/${part.slice(1)}`}
        isExternal
        color={palette.cyan}
        fontWeight="600"
        _hover={{ color: palette.white, textDecoration: "none" }}
      >
        {part}
      </Link>
    );
  });
}

export function TestimonialsSection() {
  return (
    <Box
      as="section"
      id="testimonials"
      py={{ base: 18, md: 26 }}
      borderTop="1px solid rgba(255,255,255,0.08)"
      scrollMarginTop="96px"
    >
      <Container maxW="7xl">
        <VStack align="stretch" spacing={{ base: 9, md: 12 }}>
          <Box maxW="760px">
            <Text
              color={palette.yellow}
              fontSize="12px"
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="0.06em"
              mb={3}
            >
              In their own words
            </Text>
            <Text
              as="h2"
              color={palette.white}
              fontSize={{ base: "38px", md: "58px" }}
              fontWeight="700"
              letterSpacing="-0.03em"
              lineHeight="1"
            >
              People are noticing.
            </Text>
          </Box>

          <Grid
            templateColumns={{
              base: "1fr",
              md: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(12, minmax(0, 1fr))",
            }}
            gap={4}
          >
            {testimonials.map((testimonial) => (
              <TestimonialCard
                key={getTweetId(testimonial.url)}
                testimonial={testimonial}
              />
            ))}
          </Grid>
        </VStack>
      </Container>
    </Box>
  );
}

function TestimonialCard({
  testimonial,
}: {
  testimonial: Testimonial;
}) {
  const { author, desktopSpan, featured, text, url } = testimonial;

  return (
    <VStack
      as="article"
      align="stretch"
      justify="space-between"
      spacing={6}
      gridColumn={{ lg: `span ${desktopSpan}` }}
      minH={{ base: "190px", lg: featured ? "250px" : "210px" }}
      p={{ base: 5, md: featured ? 7 : 5 }}
      borderRadius="12px"
      bg={palette.ink2}
      border="1px solid rgba(255,255,255,0.10)"
      transition="background-color 180ms ease, border-color 180ms ease, transform 180ms ease"
      _hover={{
        bg: palette.ink3,
        borderColor: featured
          ? "rgba(245,158,11,0.42)"
          : "rgba(255,255,255,0.18)",
        transform: "translateY(-2px)",
      }}
    >
      <HStack justify="space-between" align="flex-start" spacing={4}>
        <HStack minW={0} spacing={3}>
          <Avatar
            name={author.handle}
            src={author.avatar}
            boxSize="44px"
            bg={palette.ink3}
            border="1px solid rgba(255,255,255,0.14)"
          />
          <Box minW={0}>
            <HStack spacing={1}>
              <Text
                color={palette.white}
                fontSize="14px"
                fontWeight="700"
                noOfLines={1}
              >
                {author.name}
              </Text>
              {author.verified && <VerifiedBadge size={15} />}
            </HStack>
            <Text color={palette.faint} fontSize="12px" noOfLines={1}>
              @{author.handle}
            </Text>
          </Box>
        </HStack>
        <Link
          href={url}
          isExternal
          color={palette.faint}
          aria-label={`View ${author.name}'s post on X`}
          flexShrink={0}
          _hover={{ color: palette.white }}
          _focusVisible={{ boxShadow: `0 0 0 3px ${palette.blue}` }}
        >
          <XIcon />
        </Link>
      </HStack>

      <Text
        color={palette.white}
        fontSize={{ base: "17px", md: featured ? "22px" : "16px" }}
        fontWeight={featured ? "600" : "500"}
        lineHeight={featured ? "1.45" : "1.55"}
      >
        {renderTweetText(text)}
      </Text>

      <Link
        href={url}
        isExternal
        display="inline-flex"
        alignItems="center"
        alignSelf="flex-start"
        gap={1.5}
        color={palette.faint}
        fontSize="12px"
        fontWeight="600"
        _hover={{ color: palette.yellow, textDecoration: "none" }}
        _focusVisible={{ boxShadow: `0 0 0 3px ${palette.blue}` }}
      >
        View post
        <ExternalLink size={13} />
      </Link>
    </VStack>
  );
}
