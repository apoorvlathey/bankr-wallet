import { Box, Button, HStack, Image, Link, Text, VStack } from "@chakra-ui/react";
import { TWITTER_URL } from "@/constants/externalUrls";

interface WaitingForOnboardingScreenProps {
  isDarkTheme: boolean;
  isFullscreenTab: boolean;
}

async function openOnboardingTab(): Promise<void> {
  const onboardingUrl = chrome.runtime.getURL("onboarding.html");
  const existingTabs = await chrome.tabs.query({ url: onboardingUrl });
  if (existingTabs.length > 0 && existingTabs[0].id) {
    await chrome.tabs.update(existingTabs[0].id, { active: true });
    await chrome.windows.update(existingTabs[0].windowId!, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: onboardingUrl });
}

export default function WaitingForOnboardingScreen({
  isDarkTheme,
  isFullscreenTab,
}: WaitingForOnboardingScreenProps) {
  return (
    <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
      <Box
        maxW={isFullscreenTab ? "480px" : "100%"}
        mx="auto"
        w="100%"
        h="100%"
        display="flex"
        flexDirection="column"
      >
        <Box
          minH="300px"
          bg="surface.base"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          p={6}
          textAlign="center"
          position="relative"
          flex="1"
        >
          {!isDarkTheme && (
            <>
              <Box
                position="absolute"
                top={4}
                left={4}
                w="12px"
                h="12px"
                bg="accent.primary"
                border="2px solid"
                borderColor="border.default"
              />
              <Box
                position="absolute"
                top={4}
                right={4}
                w="12px"
                h="12px"
                bg="accent.secondary"
                border="2px solid"
                borderColor="border.default"
                borderRadius="full"
              />
            </>
          )}

          <VStack spacing={4}>
            <Box
              bg={isDarkTheme ? "surface.raised" : "accent.highlight"}
              border={isDarkTheme ? "1px solid" : "3px solid"}
              borderColor={isDarkTheme ? "border.subtle" : "border.default"}
              boxShadow={isDarkTheme ? "none" : "card"}
              borderRadius={isDarkTheme ? "xl" : 0}
              p={3}
            >
              <Image src="walletchan-icon.png" w="3rem" borderRadius="lg" />
            </Box>
            <Text fontSize="lg" fontWeight="700" color="fg.primary">
              Complete setup
            </Text>
            <Text fontSize="sm" color="text.secondary" fontWeight="500">
              Please complete the setup in the new tab that just opened.
            </Text>
            <Button variant="secondary" size="sm" onClick={openOnboardingTab}>
              Open Setup Tab
            </Button>
            <HStack spacing={1} justify="center" mt={4}>
              <Text fontSize="sm" color="text.tertiary" fontWeight="500">
                Built by
              </Text>
              <Link
                display="flex"
                alignItems="center"
                gap={1}
                color="accent.secondary"
                fontWeight="700"
                _hover={{ color: "accent.primary" }}
                onClick={() => chrome.tabs.create({ url: TWITTER_URL })}
              >
                <Box
                  as="svg"
                  viewBox="0 0 24 24"
                  w="14px"
                  h="14px"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </Box>
                <Text fontSize="sm" textDecor="underline">
                  @apoorveth
                </Text>
              </Link>
            </HStack>
          </VStack>
        </Box>
      </Box>
    </Box>
  );
}
