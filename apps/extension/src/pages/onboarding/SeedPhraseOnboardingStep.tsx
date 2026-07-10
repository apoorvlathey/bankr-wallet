import { Box, Flex } from "@chakra-ui/react";
import SeedPhraseSetup from "@/components/SeedPhraseSetup";
import ThemeSwitcher from "@/components/shared/ThemeSwitcher";

export function SeedPhraseOnboardingStep({
  onBack,
  onCollect,
}: {
  onBack: () => void;
  onCollect: (
    mnemonic: string,
    indices: number[],
    groupName?: string,
    accountDisplayName?: string,
  ) => void;
}) {
  return (
    <Flex h="100vh" minH={0} overflow="hidden" bg="surface.base" color="fg.primary" justify="center">
      <Box
        w="full"
        maxW="440px"
        h="100vh"
        minH={0}
        overflowY="auto"
        px={{ base: 5, sm: 7 }}
        pt={5}
        pb={6}
        position="relative"
        borderX={{ base: "none", sm: "1px solid" }}
        borderColor="border.subtle"
      >
        <Box position="absolute" top={3} right={{ base: 3, sm: 5 }} zIndex={2}>
          <ThemeSwitcher size="sm" ariaLabel="Choose appearance" />
        </Box>
        <Box pt={12}>
          <SeedPhraseSetup
            onBack={onBack}
            onComplete={() => {}}
            onCollect={onCollect}
          />
        </Box>
      </Box>
    </Flex>
  );
}
