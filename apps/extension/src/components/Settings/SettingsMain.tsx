import type { ChangeEvent, ReactNode, RefObject } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  VStack,
} from "@chakra-ui/react";
import { Search2Icon, SmallCloseIcon } from "@chakra-ui/icons";
import {
  AppHeader,
  AppScreen,
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListSurface,
  ScreenBody,
} from "@/components/ui";
import { SettingsRowListProvider } from "./SettingsRow";

interface SettingsMainProps {
  showBackButton: boolean;
  onBack: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  onClearQuery: () => void;
  searchInputRef: RefObject<HTMLInputElement>;
  rows: ReactNode;
  hasResults: boolean;
}

/** Main Settings destination. Leaf screens remain owned by Settings. */
export function SettingsMain({
  showBackButton,
  onBack,
  query,
  onQueryChange,
  onClearQuery,
  searchInputRef,
  rows,
  hasResults,
}: SettingsMainProps) {
  const isSearching = query.trim().length > 0;

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value);
  };

  return (
    <Box
      flex="1 1 auto"
      minH={0}
      mx={-4}
      my={-4}
      w="calc(100% + 2rem)"
      h="calc(100% + 2rem)"
    >
      <AppScreen>
        <AppHeader
          title="Settings"
          onBack={showBackButton ? onBack : undefined}
          backLabel="Back"
        />

        <ScreenBody pt={4} pb={6}>
          <VStack
            spacing={4}
            align="stretch"
            w="calc(100vw - 2rem)"
            maxW="448px"
            mx="auto"
          >
            <FormControl>
              <FormLabel htmlFor="settings-search">Search settings</FormLabel>
              <InputGroup>
                <InputLeftElement pointerEvents="none" h="full">
                  <Search2Icon color="fg.muted" />
                </InputLeftElement>
                <Input
                  ref={searchInputRef}
                  id="settings-search"
                  type="search"
                  placeholder="Search by name or feature"
                  value={query}
                  onChange={handleQueryChange}
                  autoComplete="off"
                  autoFocus
                  pr={query ? 12 : undefined}
                />
                {query && (
                  <InputRightElement h="full" w="44px">
                    <IconButton
                      aria-label="Clear search"
                      icon={<SmallCloseIcon boxSize={4} />}
                      variant="ghost"
                      minW="40px"
                      w="40px"
                      h="40px"
                      onClick={onClearQuery}
                    />
                  </InputRightElement>
                )}
              </InputGroup>
            </FormControl>

            {hasResults ? (
              <ListSurface
                aria-label={
                  isSearching ? "Settings search results" : "Settings"
                }
              >
                <SettingsRowListProvider>{rows}</SettingsRowListProvider>
              </ListSurface>
            ) : (
              <EmptyState aria-live="polite">
                <EmptyStateHeader>
                  <EmptyStateTitle>No matching settings</EmptyStateTitle>
                  <EmptyStateDescription>
                    Try another term or clear the search to browse all settings.
                  </EmptyStateDescription>
                </EmptyStateHeader>
                <EmptyStateActions>
                  <Button variant="secondary" onClick={onClearQuery}>
                    Clear search
                  </Button>
                </EmptyStateActions>
              </EmptyState>
            )}
          </VStack>
        </ScreenBody>
      </AppScreen>
    </Box>
  );
}
