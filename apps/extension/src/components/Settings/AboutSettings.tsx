import { ExternalLinkIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import { Button, HStack, Image, Text, VStack } from "@chakra-ui/react";
import extensionPackage from "../../../package.json";
import {
  AppHeader,
  AppScreen,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
} from "@/components/ui";
import BrandWordmark from "@/components/BrandWordmark";
import {
  WALLETCHAN_SITE_URL,
  WALLETCHAN_TWITTER_URL,
} from "@/constants/externalUrls";

interface AboutSettingsProps {
  themeName: string;
  onBack: () => void;
}

export default function AboutSettings({ themeName, onBack }: AboutSettingsProps) {
  const open = (url: string) => chrome.tabs.create({ url });

  return (
    <AppScreen>
      <AppHeader title="About" onBack={onBack} />
      <ScreenBody pb={6}>
        <VStack align="stretch" spacing={5}>
          <VStack spacing={3} pt={6} pb={2}>
            <Image
              src="walletchan-icon-white-bg.png"
              alt="WalletChan"
              boxSize="64px"
              borderRadius="lg"
            />
            <VStack spacing={0.5}>
              <BrandWordmark as="h2" fontSize="2xl" />
              <Text color="fg.secondary" fontSize="sm">
                Browser wallet · Version {extensionPackage.version}
              </Text>
            </VStack>
          </VStack>

          <ScreenSection title="App information">
            <ListSurface>
              <ListItem>
                <ListItemMedia><InfoOutlineIcon aria-hidden="true" /></ListItemMedia>
                <ListItemContent>
                  <ListItemTitle>Theme</ListItemTitle>
                  <ListItemDescription>Current visual style</ListItemDescription>
                </ListItemContent>
                <ListItemMeta>{themeName}</ListItemMeta>
              </ListItem>
              <ListItem>
                <ListItemContent>
                  <ListItemTitle>Security model</ListItemTitle>
                  <ListItemDescription>
                    Private keys and recovery phrases are encrypted locally on this device.
                  </ListItemDescription>
                </ListItemContent>
              </ListItem>
            </ListSurface>
          </ScreenSection>

          <ScreenSection title="Links">
            <ListSurface>
              <ListItem interactive onClick={() => open(WALLETCHAN_SITE_URL)}>
                <ListItemContent>
                  <ListItemTitle>WalletChan website</ListItemTitle>
                  <ListItemDescription>Product information and support</ListItemDescription>
                </ListItemContent>
                <ListItemMeta><ExternalLinkIcon aria-hidden="true" /></ListItemMeta>
              </ListItem>
              <ListItem interactive onClick={() => open(WALLETCHAN_TWITTER_URL)}>
                <ListItemContent>
                  <ListItemTitle>Follow on Twitter: @WalletChan_</ListItemTitle>
                  <ListItemDescription>Updates and announcements</ListItemDescription>
                </ListItemContent>
                <ListItemMeta><ExternalLinkIcon aria-hidden="true" /></ListItemMeta>
              </ListItem>
            </ListSurface>
          </ScreenSection>

          <HStack justify="center">
            <Button variant="ghost" size="sm" onClick={onBack}>Back to settings</Button>
          </HStack>
        </VStack>
      </ScreenBody>
    </AppScreen>
  );
}
