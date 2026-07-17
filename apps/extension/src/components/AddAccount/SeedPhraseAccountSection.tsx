import { Badge, Box, Button, HStack, Text } from "@chakra-ui/react";
import { SeedIcon } from "@/components/shared/AccountTypeIcons";
import {
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
  ScreenSection,
} from "@/components/ui";

interface SeedGroupSummary {
  id: string;
  name: string;
  accountCount: number;
}

interface SeedPhraseAccountSectionProps {
  groups: SeedGroupSummary[];
  isAuthenticating: boolean;
  onDerive: (groupId: string) => void;
}

export function SeedPhraseAccountSection({
  groups,
  isAuthenticating,
  onDerive,
}: SeedPhraseAccountSectionProps) {
  return (
    <ScreenSection
      title={groups.length > 0 ? "Saved seed phrases" : "Set up a seed phrase"}
      description={
        groups.length > 0
          ? "Derive another address or set up a new phrase."
          : "Import a 12-word phrase or create a new one."
      }
    >
      {groups.length > 0 ? (
        <ListSurface>
          {groups.map((group) => (
            <ListItem key={group.id}>
              <ListItemMedia>
                <SeedIcon boxSize="18px" color="accent.primary" />
              </ListItemMedia>
              <ListItemContent>
                <HStack spacing={2}>
                  <ListItemTitle>{group.name}</ListItemTitle>
                  <Badge variant="subtle" fontSize="xs">
                    {group.accountCount}{" "}
                    {group.accountCount === 1 ? "account" : "accounts"}
                  </Badge>
                </HStack>
                <ListItemDescription>Stored seed phrase</ListItemDescription>
              </ListItemContent>
              <ListItemActions>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={isAuthenticating}
                  onClick={() => onDerive(group.id)}
                >
                  Derive
                </Button>
              </ListItemActions>
            </ListItem>
          ))}
        </ListSurface>
      ) : (
        <Box
          p={4}
          bg="surface.raised"
          border="1px solid"
          borderColor="border.subtle"
          borderRadius="lg"
        >
          <Text color="fg.secondary" fontSize="sm">
            Your phrase will be encrypted before it is stored on this device.
          </Text>
        </Box>
      )}
    </ScreenSection>
  );
}
