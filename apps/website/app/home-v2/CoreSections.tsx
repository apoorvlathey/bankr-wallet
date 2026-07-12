"use client";

import { Box, Container, Flex, Grid, HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { CheckCircle2, Code2, Eye, Globe2, Rocket, ShieldCheck } from "lucide-react";
import { FeatureCard, SectionHeading } from "./SectionPrimitives";
import { glass, hairline, palette } from "./design";

export function BatchingSection() {
  return (
    <Box as="section" id="batching" py={{ base: 20, md: 28 }}>
      <Container maxW="7xl">
        <SectionHeading kicker="One review, many actions" title="Less clicking. Fewer approval loops.">
          WalletChan turns multi-step dapp flows into one readable review when the account and chain support batching,
          with graceful fallbacks when they do not.
        </SectionHeading>
        <Grid templateColumns={{ base: "1fr", lg: "0.95fr 1.05fr" }} gap={6} alignItems="stretch">
          <Box {...hairline} borderRadius="32px" p={{ base: 5, md: 7 }} bg="rgba(255,255,255,0.035)">
            <Text color={palette.faint} fontWeight="900" fontSize="12px" mb={5}>
              OLD WALLET FLOW
            </Text>
            <VStack align="stretch" spacing={3}>
              {["Approve token", "Confirm swap", "Revoke allowance"].map((item, index) => (
                <HStack key={item} p={4} borderRadius="20px" bg="rgba(255,100,124,0.08)" border="1px solid rgba(255,100,124,0.14)">
                  <Text color={palette.red} fontWeight="900">
                    {index + 1}
                  </Text>
                  <Text color={palette.white} fontWeight="800">
                    {item}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Box>
          <Box borderRadius="32px" p={{ base: 5, md: 7 }} bg="linear-gradient(135deg, rgba(245,197,66,0.16), rgba(102,227,255,0.08))" border="1px solid rgba(245,197,66,0.24)">
            <Text color={palette.yellow} fontWeight="900" fontSize="12px" mb={5}>
              WALLETCHAN FLOW
            </Text>
            <VStack align="stretch" spacing={4}>
              <HStack p={5} borderRadius="24px" bg="rgba(0,0,0,0.34)" border="1px solid rgba(255,255,255,0.14)" justify="space-between">
                <HStack>
                  <CheckCircle2 color={palette.green} />
                  <Box>
                    <Text color={palette.white} fontSize="22px" fontWeight="900">
                      One clear review
                    </Text>
                    <Text color={palette.muted}>Approve + swap + cleanup in a single bundled confirmation.</Text>
                  </Box>
                </HStack>
                <Text color={palette.yellow} fontSize="34px" fontWeight="900">
                  1x
                </Text>
              </HStack>
              <HStack spacing={2} flexWrap="wrap">
                {["EIP-7702", "ERC-5792", "ERC-7821", "Bankr atomic path"].map((tag) => (
                  <Text key={tag} px={3} py={1.5} borderRadius="full" bg="rgba(255,255,255,0.1)" color={palette.white} fontSize="12px" fontWeight="900">
                    {tag}
                  </Text>
                ))}
              </HStack>
              <HStack align="flex-start" spacing={3} p={4} borderRadius="20px" bg="rgba(255,255,255,0.08)" border="1px solid rgba(255,255,255,0.12)">
                <Rocket size={18} color={palette.yellow} />
                <Text color={palette.muted} fontSize="14px" lineHeight="1.6">
                  WalletChan tracks the ERCs that improve Ethereum UX and turns them into shipped wallet flows quickly,
                  not just roadmap slides.
                </Text>
              </HStack>
            </VStack>
          </Box>
        </Grid>
      </Container>
    </Box>
  );
}

export function SigningSection() {
  return (
    <Box as="section" id="signing" py={{ base: 18, md: 26 }} bg="rgba(255,255,255,0.025)">
      <Container maxW="7xl">
        <SectionHeading kicker="Know before you sign" title="Readable by default. Raw when you need it.">
          WalletChan puts the human summary first, keeps decoded calldata available, supports ERC-7730 clear signing,
          and shows asset changes before confirmation whenever simulation is available.
        </SectionHeading>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={5}>
          <FeatureCard accent={palette.green} icon={<Eye size={24} />} title="Asset-change previews" text="See token and native balance changes before committing, including richer history after receipts land." />
          <FeatureCard accent={palette.cyan} icon={<Code2 size={24} />} title="Clear signing + calldata" text="ERC-7730 descriptors, nested calldata decoding, EIP-712 views, and raw details stay one tap away." />
          <FeatureCard accent={palette.yellow} icon={<ShieldCheck size={24} />} title="Native SIWE review" text="Login signatures get parsed against the site, address, chain, expiration, and nonce before signing." />
        </SimpleGrid>
      </Container>
    </Box>
  );
}

export function BrowserSection() {
  return (
    <Box as="section" id="browser" py={{ base: 20, md: 28 }}>
      <Container maxW="7xl">
        <Grid templateColumns={{ base: "1fr", lg: "0.9fr 1.1fr" }} gap={{ base: 9, lg: 12 }} alignItems="center">
          <VStack align="flex-start" spacing={5}>
            <Text color={palette.yellow} fontSize="13px" fontWeight="900" textTransform="uppercase" letterSpacing="0">
              Browser superpowers
            </Text>
            <Text color={palette.white} fontSize={{ base: "38px", md: "60px" }} fontWeight="900" letterSpacing="0" lineHeight="1">
              ENS, IPFS, and onchain HTML belong in the browser.
            </Text>
            <Text color={palette.muted} fontSize={{ base: "16px", md: "19px" }} lineHeight="1.75">
              Open onchain sites, route IPFS/IPNS, and pin onchain HTML through a local Kubo node when you want the web
              to stay local.
            </Text>
            <HStack spacing={2} flexWrap="wrap">
              {["ENS browsing", "IPFS gateway", "Local Kubo", "WalletChan OS"].map((tag) => (
                <Text key={tag} px={3} py={1.5} borderRadius="full" bg="rgba(255,255,255,0.08)" color={palette.white} fontSize="12px" fontWeight="900">
                  {tag}
                </Text>
              ))}
            </HStack>
          </VStack>
          <Box {...glass} borderRadius="34px" p={{ base: 4, md: 6 }}>
            <Box borderRadius="24px" overflow="hidden" bg={palette.ink2} border="1px solid rgba(255,255,255,0.12)">
              <HStack px={4} py={3} borderBottom="1px solid rgba(255,255,255,0.08)">
                <Globe2 size={16} color={palette.cyan} />
                <Text color={palette.white} fontSize="13px" fontWeight="900">
                  vitalik.eth/ipfs
                </Text>
              </HStack>
              <Grid templateColumns={{ base: "1fr", md: "1fr 180px" }} minH="300px">
                <VStack align="stretch" spacing={4} p={5}>
                  <Text color={palette.white} fontSize="26px" fontWeight="900" letterSpacing="0">
                    Onchain page resolved
                  </Text>
                  <Text color={palette.muted} lineHeight="1.7">
                    ENS contenthash points to IPFS. WalletChan can route it through your browser, then serve it locally
                    through Kubo when configured.
                  </Text>
                  <HStack color={palette.green}>
                    <CheckCircle2 size={18} />
                    <Text fontWeight="900">Kubo reachable at 127.0.0.1:5001</Text>
                  </HStack>
                </VStack>
                <VStack justify="center" align="stretch" p={5} bg="rgba(255,255,255,0.035)" borderLeft={{ md: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Resolve ENS", "Fetch IPFS", "Pin locally"].map((step, index) => (
                    <HStack key={step}>
                      <Flex w="28px" h="28px" align="center" justify="center" borderRadius="10px" bg="rgba(97,230,166,0.12)" color={palette.green} fontWeight="900">
                        {index + 1}
                      </Flex>
                      <Text color={palette.white} fontWeight="800">
                        {step}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              </Grid>
            </Box>
          </Box>
        </Grid>
      </Container>
    </Box>
  );
}
