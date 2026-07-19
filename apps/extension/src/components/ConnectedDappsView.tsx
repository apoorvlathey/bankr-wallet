import { useCallback, useEffect, useMemo, useState } from "react";
import { CloseIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Flex,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { DappPermission } from "@/chrome/requests/dappPermissionStorage";
import DappSiteIcon from "@/components/DappSiteIcon";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";
import {
  AppHeader,
  AppScreen,
  EmptyState,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
  SkeletonRow,
} from "@/components/ui";

interface ConnectedDappsViewProps {
  onBack: () => void;
}

interface DappPermissionsResponse {
  success?: boolean;
  permissions?: DappPermission[];
}

function lastUsedLabel(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return "Used just now";
  if (elapsed < hour) return `Used ${Math.floor(elapsed / minute)}m ago`;
  if (elapsed < day) return `Used ${Math.floor(elapsed / hour)}h ago`;
  if (elapsed < 7 * day) return `Used ${Math.floor(elapsed / day)}d ago`;

  return `Used ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(timestamp).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(new Date(timestamp))}`;
}

export default function ConnectedDappsView({ onBack }: ConnectedDappsViewProps) {
  const [permissions, setPermissions] = useState<DappPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [removingOrigin, setRemovingOrigin] = useState<string | null>(null);
  const formatOrigin = useDappOriginFormatter();

  const loadPermissions = useCallback(async () => {
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "getDappPermissions",
      })) as DappPermissionsResponse;
      setPermissions(response?.success ? response.permissions || [] : []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPermissions();

    const handlePermissionsChanged = (message: { type?: string }) => {
      if (message.type === "dappPermissionsChanged") {
        void loadPermissions();
      }
    };
    chrome.runtime.onMessage.addListener(handlePermissionsChanged);
    return () => chrome.runtime.onMessage.removeListener(handlePermissionsChanged);
  }, [loadPermissions]);

  const sortedPermissions = useMemo(
    () =>
      [...permissions].sort(
        (left, right) => right.lastConnectedAt - left.lastConnectedAt,
      ),
    [permissions],
  );

  const removePermission = async (origin: string) => {
    setRemovingOrigin(origin);
    try {
      await chrome.runtime.sendMessage({
        type: "revokeDappPermission",
        origin,
      });
      setPermissions((current) =>
        current.filter((permission) => permission.origin !== origin),
      );
    } finally {
      setRemovingOrigin(null);
    }
  };

  return (
    <AppScreen>
      <AppHeader title="Connected dapps" onBack={onBack} />
      <ScreenBody pb={6}>
        <ScreenSection description="Sites allowed to view your active account">
          {isLoading ? (
            <ListSurface aria-label="Loading connected dapps">
              <SkeletonRow />
              <SkeletonRow />
            </ListSurface>
          ) : sortedPermissions.length === 0 ? (
            <EmptyState>
              <EmptyStateHeader>
                <EmptyStateTitle>No connected dapps</EmptyStateTitle>
                <EmptyStateDescription>
                  Sites appear here after you approve an account connection.
                </EmptyStateDescription>
              </EmptyStateHeader>
            </EmptyState>
          ) : (
            <ListSurface aria-label="Connected dapps">
              {sortedPermissions.map((permission) => {
                const displayOrigin = formatOrigin(permission.origin);
                return (
                <Box
                  as="li"
                  key={permission.origin}
                  borderBottomWidth="1px"
                  borderBottomColor="border.subtle"
                  _last={{ borderBottomWidth: 0 }}
                >
                  <Flex minH="64px" align="stretch">
                    <Button
                      type="button"
                      variant="ghost"
                      flex={1}
                      minW={0}
                      h="auto"
                      px={3}
                      py={2.5}
                      borderRadius={0}
                      justifyContent="flex-start"
                      textAlign="start"
                      gap={3}
                      onClick={() => chrome.tabs.create({ url: permission.origin })}
                      _hover={{ bg: "surface.raisedHover" }}
                      _active={{ bg: "surface.sunken" }}
                    >
                      <DappSiteIcon
                        src={
                          displayOrigin.faviconSrc ||
                          permission.favicon ||
                          googleFaviconUrl(permission.hostname, 64)
                        }
                        fallbackSrc={displayOrigin.faviconFallbackSrc}
                        label={displayOrigin.label}
                        size="36px"
                        imageSize="24px"
                      />
                      <VStack minW={0} flex={1} align="stretch" spacing={0.5}>
                        <Text
                          color="fg.primary"
                          fontSize="md"
                          fontWeight="600"
                          lineHeight="1.3"
                          noOfLines={1}
                        >
                          {displayOrigin.label}
                        </Text>
                        <Text color="fg.secondary" fontSize="sm" noOfLines={1}>
                          {lastUsedLabel(permission.lastConnectedAt)}
                        </Text>
                      </VStack>
                      <ExternalLinkIcon color="fg.muted" flexShrink={0} />
                    </Button>
                    <IconButton
                      aria-label={`Remove ${displayOrigin.label} account access`}
                      title="Remove access"
                      icon={<CloseIcon boxSize="10px" />}
                      variant="ghost"
                      alignSelf="stretch"
                      h="auto"
                      minH="64px"
                      minW="56px"
                      w="56px"
                      borderRadius={0}
                      borderLeftWidth="1px"
                      borderLeftColor="border.subtle"
                      color="chart.negative"
                      isLoading={removingOrigin === permission.origin}
                      isDisabled={removingOrigin !== null}
                      onClick={() => void removePermission(permission.origin)}
                      _hover={{ bg: "surface.raisedHover" }}
                      _active={{ bg: "surface.sunken" }}
                    />
                  </Flex>
                </Box>
                );
              })}
            </ListSurface>
          )}
        </ScreenSection>
      </ScreenBody>
    </AppScreen>
  );
}
