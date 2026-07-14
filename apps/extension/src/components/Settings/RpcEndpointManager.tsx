import { useRef, useState } from "react";
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Portal,
  Text,
} from "@chakra-ui/react";
import {
  AddIcon,
  ChevronDownIcon,
  DeleteIcon,
  EditIcon,
} from "@chakra-ui/icons";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MAX_SAVED_RPC_URLS, type SavedRpcEndpoint } from "@/lib/chains";
import { RpcEndpointEditor } from "./RpcEndpointEditor";
import { RpcEndpointFavicon } from "./RpcEndpointFavicon";
import { RpcEndpointRemoveDialog } from "./RpcEndpointRemoveDialog";
import {
  getRpcEndpointName,
  getRpcUrlLabel,
} from "./rpcEndpointModel";

type RpcEndpointManagerProps = {
  currentUrl: string;
  endpoints: SavedRpcEndpoint[];
  selectedUrl: string;
  isLoading: boolean;
  onSelect: (rpcUrl: string) => void;
  onAdd: (endpoint: SavedRpcEndpoint) => void;
  onUpdate: (previousUrl: string, endpoint: SavedRpcEndpoint) => void;
  onRemove: (rpcUrl: string, nextSelectedUrl: string) => void;
};

type EditorState =
  | { mode: "add" }
  | { mode: "edit"; endpoint: SavedRpcEndpoint };

export function RpcEndpointManager({
  currentUrl,
  endpoints,
  selectedUrl,
  isLoading,
  onSelect,
  onAdd,
  onUpdate,
  onRemove,
}: RpcEndpointManagerProps) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [endpointToRemove, setEndpointToRemove] =
    useState<SavedRpcEndpoint | null>(null);
  const restoreSelectFocus = useRef(false);
  const selectRef = useRef<HTMLButtonElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const selectedEndpoint =
    endpoints.find(({ url }) => url === selectedUrl) ?? { url: selectedUrl };
  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.1, ease: [0.23, 1, 0.32, 1] as const };
  const motionState = prefersReducedMotion
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        initial: { opacity: 0, scale: 0.985 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.985 },
      };

  const showSelector = () => {
    restoreSelectFocus.current = true;
    setEditor(null);
  };

  const canAddEndpoint = endpoints.length < MAX_SAVED_RPC_URLS;
  const canRemoveEndpoint = endpoints.length > 1;

  const confirmRemoveEndpoint = () => {
    if (!endpointToRemove) return;
    const fallbackEndpoint =
      endpoints.find(
        ({ url }) => url === currentUrl && url !== endpointToRemove.url,
      ) ?? endpoints.find(({ url }) => url !== endpointToRemove.url);

    if (!fallbackEndpoint) return;
    const nextSelectedUrl =
      selectedUrl === endpointToRemove.url
        ? fallbackEndpoint.url
        : selectedUrl;
    onRemove(endpointToRemove.url, nextSelectedUrl);
    setEndpointToRemove(null);
  };

  return (
    <>
      <FormControl>
      <FormLabel
        mb={1.5}
        color="fg.secondary"
        fontSize="sm"
        fontWeight="500"
      >
        RPC endpoints
      </FormLabel>

      <AnimatePresence initial={false} mode="wait">
        {editor ? (
          <motion.div
            key={`rpc-editor-${editor.mode}-${editor.mode === "edit" ? editor.endpoint.url : "new"}`}
            {...motionState}
            transition={transition}
            style={{ transformOrigin: "top center", width: "100%" }}
          >
            <RpcEndpointEditor
              mode={editor.mode}
              endpoint={editor.mode === "edit" ? editor.endpoint : undefined}
              existingEndpoints={endpoints}
              isLoading={isLoading}
              onCancel={showSelector}
              onSubmit={(endpoint) => {
                if (editor.mode === "edit") {
                  onUpdate(editor.endpoint.url, endpoint);
                } else {
                  onAdd(endpoint);
                }
                showSelector();
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="rpc-selector"
            {...motionState}
            transition={transition}
            style={{ transformOrigin: "top center", width: "100%" }}
            onAnimationComplete={() => {
              if (!restoreSelectFocus.current) return;
              restoreSelectFocus.current = false;
              selectRef.current?.focus();
            }}
          >
            <Menu
              placement="bottom-start"
              gutter={6}
              matchWidth
              isLazy
              autoSelect={false}
            >
              <MenuButton
                id="rpc-endpoint-select"
                ref={selectRef}
                as={Button}
                w="full"
                h="58px"
                px={3}
                bg="surface.sunken"
                borderWidth="1px"
                borderColor="border.default"
                fontWeight="400"
                textAlign="start"
                title={selectedUrl}
                isDisabled={isLoading}
                _hover={{ bg: "surface.sunken", borderColor: "border.strong" }}
                _expanded={{ bg: "surface.sunken", borderColor: "border.focus" }}
              >
                <Flex as="span" align="center" gap={2.5} minW={0}>
                  <RpcEndpointFavicon rpcUrl={selectedEndpoint.url} />
                  <Box as="span" flex={1} minW={0}>
                    <Text
                      as="span"
                      display="block"
                      color="fg.primary"
                      fontSize="sm"
                      fontWeight="600"
                      isTruncated
                    >
                      {getRpcEndpointName(selectedEndpoint)}
                    </Text>
                    <Text
                      as="span"
                      display="block"
                      mt={0.5}
                      color="fg.muted"
                      fontFamily="mono"
                      fontSize="xs"
                      isTruncated
                      sx={{ overflowWrap: "normal" }}
                    >
                      {getRpcUrlLabel(selectedEndpoint.url)}
                    </Text>
                  </Box>
                  <ChevronDownIcon
                    aria-hidden="true"
                    boxSize={5}
                    color="fg.secondary"
                    flexShrink={0}
                  />
                </Flex>
              </MenuButton>
              <Portal>
                <MenuList maxW="calc(100vw - 32px)" maxH="320px" overflowY="auto" py={1}>
                  {endpoints.map((endpoint) => {
                    const isSelected = endpoint.url === selectedUrl;
                    return (
                      <Flex
                        key={endpoint.url}
                        minH="64px"
                        align="stretch"
                        mx={1}
                        bg={isSelected ? "surface.raisedHover" : "surface.raised"}
                        borderRadius="md"
                        _hover={{ bg: "surface.raisedHover" }}
                        sx={{
                          "&:focus-within": { bg: "surface.raisedHover" },
                        }}
                      >
                        <MenuItem
                          minH="64px"
                          minW={0}
                          flex={1}
                          mx={0}
                          pl={3}
                          pr={1}
                          bg="transparent"
                          borderRadius="md"
                          color="fg.primary"
                          aria-current={isSelected ? "page" : undefined}
                          aria-label={
                            isSelected
                              ? `Currently using ${getRpcEndpointName(endpoint)} RPC endpoint`
                              : `Use ${getRpcEndpointName(endpoint)} RPC endpoint`
                          }
                          onClick={() => {
                            if (!isSelected) onSelect(endpoint.url);
                          }}
                          _hover={{ bg: "transparent", color: "fg.primary" }}
                          _focus={{ bg: "transparent", color: "fg.primary" }}
                          _active={{ bg: "transparent", color: "fg.primary" }}
                          sx={{
                            "&[aria-current=page]": {
                              bg: "transparent",
                              color: "fg.primary",
                            },
                          }}
                        >
                          <HStack w="full" minW={0} spacing={2.5}>
                            <RpcEndpointFavicon rpcUrl={endpoint.url} />
                            <Box minW={0} flex={1}>
                              <Text
                                color="fg.primary"
                                fontSize="sm"
                                fontWeight="600"
                                isTruncated
                              >
                                {getRpcEndpointName(endpoint)}
                              </Text>
                              <Text
                                mt={0.5}
                                color="fg.muted"
                                fontFamily="mono"
                                fontSize="xs"
                                isTruncated
                                sx={{ overflowWrap: "normal" }}
                                title={endpoint.url}
                              >
                                {getRpcUrlLabel(endpoint.url)}
                              </Text>
                              {isSelected && (
                                <Text
                                  mt={0.5}
                                  color="accent.secondary"
                                  fontSize="2xs"
                                  fontWeight="500"
                                >
                                  Currently in use
                                </Text>
                              )}
                            </Box>
                          </HStack>
                        </MenuItem>
                        <MenuItem
                          aria-label={`Edit ${getRpcEndpointName(endpoint)} RPC endpoint`}
                          title={`Edit ${getRpcEndpointName(endpoint)}`}
                          alignSelf="center"
                          minH="44px"
                          h="44px"
                          minW="44px"
                          w="44px"
                          mx={0}
                          mr={1}
                          px={0}
                          bg="transparent"
                          borderRadius="md"
                          justifyContent="center"
                          onClick={() => setEditor({ mode: "edit", endpoint })}
                          _hover={{ bg: "surface.sunken" }}
                          _focus={{ bg: "surface.sunken" }}
                          _active={{ bg: "surface.sunken" }}
                        >
                          <EditIcon
                            aria-hidden="true"
                            boxSize={4}
                            color={isSelected ? "accent.secondary" : "fg.muted"}
                          />
                        </MenuItem>
                      </Flex>
                    );
                  })}

                  {(canAddEndpoint || canRemoveEndpoint) && (
                    <MenuDivider my={1} borderColor="border.subtle" />
                  )}
                  {canAddEndpoint && (
                    <MenuItem minH="44px" px={3} onClick={() => setEditor({ mode: "add" })}>
                      <AddIcon boxSize={3.5} color="accent.secondary" mr={3} />
                      Add new RPC endpoint
                    </MenuItem>
                  )}
                  {canRemoveEndpoint && (
                    <MenuItem
                      minH="44px"
                      px={3}
                      onClick={() => setEndpointToRemove(selectedEndpoint)}
                    >
                      <DeleteIcon boxSize={3.5} color="fg.muted" mr={3} />
                      Remove selected endpoint
                    </MenuItem>
                  )}
                </MenuList>
              </Portal>
            </Menu>
            <Text
              mt={1}
              px={1}
              color="accent.secondary"
              fontSize="xs"
              fontWeight="500"
            >
              Currently in use
            </Text>
          </motion.div>
        )}
      </AnimatePresence>
      </FormControl>

      <RpcEndpointRemoveDialog
        endpoint={endpointToRemove}
        onClose={() => setEndpointToRemove(null)}
        onConfirm={confirmRemoveEndpoint}
      />
    </>
  );
}
