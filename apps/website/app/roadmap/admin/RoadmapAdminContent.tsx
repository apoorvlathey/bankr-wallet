"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Button,
  Spinner,
  useToast,
  Flex,
} from "@chakra-ui/react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage, useDisconnect } from "wagmi";
import { Plus, Minus } from "lucide-react";
import { Navigation } from "../../components/Navigation";
import AddItemForm from "./AddItemForm";
import RoadmapItemCard from "./RoadmapItemCard";

interface RoadmapItem {
  _id: string;
  title: string;
  description?: string;
  status: "done" | "in-progress" | "planned" | "idea";
  category?: string;
  order: number;
}

export default function RoadmapAdminContent() {
  const toast = useToast();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isReauthing, setIsReauthing] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [authData, setAuthData] = useState<{
    signature: string;
    message: string;
  } | null>(null);

  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Ref to hold the latest authData for use inside re-auth retry callbacks
  const authDataRef = useRef(authData);
  authDataRef.current = authData;

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!authData || !address) return {};
    return {
      "x-admin-signature": authData.signature,
      "x-admin-message": btoa(authData.message),
      "x-admin-address": address,
    };
  }, [authData, address]);

  /** Build auth headers from the ref (for retry after re-auth) */
  const getFreshAuthHeaders = useCallback((): Record<string, string> => {
    const ad = authDataRef.current;
    if (!ad || !address) return {};
    return {
      "x-admin-signature": ad.signature,
      "x-admin-message": btoa(ad.message),
      "x-admin-address": address,
    };
  }, [address]);

  const doVerify = useCallback(async (): Promise<boolean> => {
    if (!address) return false;

    try {
      const timestamp = Date.now();
      const message = `Sign in to walletchan.com admin\nTimestamp: ${timestamp}\nAddress: ${address}`;
      const signature = await signMessageAsync({ message });

      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message, signature }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verification failed");

      setIsAdmin(true);
      setAuthData({ signature, message });
      authDataRef.current = { signature, message };
      return true;
    } catch (error) {
      setVerifyError(
        error instanceof Error ? error.message : "Verification failed"
      );
      return false;
    }
  }, [address, signMessageAsync]);

  /**
   * On 401, auto-trigger re-sign flow without unmounting the dashboard.
   * Returns true if re-auth succeeded (caller should retry their operation).
   */
  const handleAuthError = useCallback(
    async (status: number): Promise<boolean> => {
      if (status !== 401) return false;

      toast({
        title: "Session expired",
        description: "Please sign again to continue.",
        status: "warning",
        duration: 3000,
      });

      setIsReauthing(true);
      const ok = await doVerify();
      setIsReauthing(false);

      if (!ok) {
        // Re-sign was rejected/failed — fall back to verify screen
        setIsAdmin(false);
        setAuthData(null);
      }
      return ok;
    },
    [toast, doVerify]
  );

  const handleVerifyAdmin = useCallback(async () => {
    setIsVerifying(true);
    setVerifyError(null);
    const ok = await doVerify();
    if (!ok) setIsAdmin(false);
    setIsVerifying(false);
  }, [doVerify]);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/roadmap");
      const data = await res.json();
      setItems(data.items || []);
    } catch (error) {
      console.error("Failed to fetch items:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchItems();
  }, [isAdmin, fetchItems]);

  useEffect(() => {
    if (!isConnected) {
      setIsAdmin(false);
      setAuthData(null);
      setItems([]);
    }
  }, [isConnected]);

  const handleAdd = useCallback(
    async (newItem: {
      title: string;
      description: string;
      status: string;
      category: string;
    }) => {
      const body = JSON.stringify(newItem);
      let res = await fetch("/api/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body,
      });
      if (!res.ok && res.status === 401) {
        const reauthOk = await handleAuthError(res.status);
        if (reauthOk) {
          res = await fetch("/api/roadmap", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...getFreshAuthHeaders() },
            body,
          });
        }
      }
      if (!res.ok) throw new Error("Failed to add item");
      await fetchItems();
      setShowAddForm(false);
    },
    [getAuthHeaders, getFreshAuthHeaders, fetchItems, handleAuthError]
  );

  const handleUpdate = useCallback(
    async (item: RoadmapItem) => {
      const body = JSON.stringify({
        id: item._id,
        title: item.title,
        description: item.description,
        status: item.status,
        category: item.category,
      });
      let res = await fetch("/api/roadmap", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body,
      });
      if (!res.ok && res.status === 401) {
        const reauthOk = await handleAuthError(res.status);
        if (reauthOk) {
          res = await fetch("/api/roadmap", {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...getFreshAuthHeaders() },
            body,
          });
        }
      }
      if (!res.ok) throw new Error("Failed to update item");
      await fetchItems();
    },
    [getAuthHeaders, getFreshAuthHeaders, fetchItems, handleAuthError]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const body = JSON.stringify({ id });
      let res = await fetch("/api/roadmap", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body,
      });
      if (!res.ok && res.status === 401) {
        const reauthOk = await handleAuthError(res.status);
        if (reauthOk) {
          res = await fetch("/api/roadmap", {
            method: "DELETE",
            headers: { "Content-Type": "application/json", ...getFreshAuthHeaders() },
            body,
          });
        }
      }
      if (!res.ok) throw new Error("Failed to delete item");
      await fetchItems();
    },
    [getAuthHeaders, getFreshAuthHeaders, fetchItems, handleAuthError]
  );

  const handleMove = useCallback(
    async (index: number, direction: "up" | "down") => {
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= items.length) return;

      const newItems = [...items];
      [newItems[index], newItems[swapIndex]] = [
        newItems[swapIndex],
        newItems[index],
      ];

      const reorderPayload = newItems.map((item, i) => ({
        id: item._id,
        order: i,
      }));

      setItems(newItems);

      const body = JSON.stringify({ items: reorderPayload });
      let res = await fetch("/api/roadmap/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body,
      });
      if (!res.ok && res.status === 401) {
        const reauthOk = await handleAuthError(res.status);
        if (reauthOk) {
          res = await fetch("/api/roadmap/reorder", {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...getFreshAuthHeaders() },
            body,
          });
        }
      }
      if (!res.ok) await fetchItems();
    },
    [items, getAuthHeaders, getFreshAuthHeaders, fetchItems, handleAuthError]
  );

  // Not connected
  if (!isConnected) {
    return (
      <Box minH="100vh" bg="bauhaus.background">
        <Navigation />
        <Container maxW="md" py={20}>
          <VStack spacing={6} textAlign="center">
            <Box
              w="80px"
              h="80px"
              border="4px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg="bauhaus.blue"
              color="white"
              fontSize="2xl"
            >
              🔒
            </Box>
            <Text fontWeight="black" fontSize="2xl" textTransform="uppercase">
              Admin Access
            </Text>
            <Text color="text.secondary" fontWeight="medium">
              Connect your admin wallet to manage the roadmap.
            </Text>
            <Box
              sx={{
                "& button": {
                  borderRadius: "0 !important",
                  fontWeight: "bold !important",
                  textTransform: "uppercase",
                },
              }}
            >
              <ConnectButton />
            </Box>
          </VStack>
        </Container>
      </Box>
    );
  }

  // Connected but not verified
  if (!isAdmin) {
    return (
      <Box minH="100vh" bg="bauhaus.background">
        <Navigation />
        <Container maxW="md" py={20}>
          <VStack spacing={6} textAlign="center">
            <Box
              w="80px"
              h="80px"
              border="4px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg="bauhaus.yellow"
              fontSize="2xl"
            >
              ✍️
            </Box>
            <Text fontWeight="black" fontSize="2xl" textTransform="uppercase">
              Verify Admin
            </Text>
            <Text color="text.secondary" fontSize="sm" fontFamily="mono">
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </Text>

            {verifyError && (
              <Box
                bg="red.50"
                border="2px solid"
                borderColor="bauhaus.red"
                px={4}
                py={3}
                w="full"
              >
                <Text color="bauhaus.red" fontWeight="bold" fontSize="sm">
                  {verifyError}
                </Text>
              </Box>
            )}

            <Button
              variant="primary"
              size="lg"
              onClick={handleVerifyAdmin}
              isLoading={isVerifying}
              loadingText="Verifying..."
              w="full"
            >
              Sign to Verify
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => disconnect()}
              color="text.tertiary"
            >
              Disconnect Wallet
            </Button>
          </VStack>
        </Container>
      </Box>
    );
  }

  // Admin dashboard
  return (
    <Box minH="100vh" bg="bauhaus.background" position="relative">
      <Navigation />

      {/* Re-auth overlay — keeps dashboard mounted so form state is preserved */}
      {isReauthing && (
        <Box
          position="fixed"
          inset={0}
          bg="blackAlpha.600"
          zIndex={1000}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Box
            bg="white"
            border="4px solid"
            borderColor="bauhaus.black"
            boxShadow="8px 8px 0px 0px #121212"
            p={8}
            textAlign="center"
            maxW="sm"
          >
            <Spinner size="lg" color="bauhaus.blue" thickness="4px" mb={4} />
            <Text fontWeight="black" fontSize="lg" textTransform="uppercase">
              Re-signing...
            </Text>
            <Text color="text.secondary" fontSize="sm" mt={2}>
              Please approve the signature in your wallet
            </Text>
          </Box>
        </Box>
      )}

      <Container maxW="4xl" py={{ base: 6, md: 10 }}>
        <VStack spacing={6} align="stretch">
          {/* Header */}
          <Flex justify="space-between" align="center" flexWrap="wrap" gap={4}>
            <Box>
              <Text
                fontWeight="black"
                fontSize={{ base: "2xl", lg: "3xl" }}
                textTransform="uppercase"
                letterSpacing="tighter"
                lineHeight="0.9"
              >
                Roadmap Admin
              </Text>
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                letterSpacing="widest"
                color="gray.500"
                mt={1}
              >
                {items.length} {items.length === 1 ? "item" : "items"}
              </Text>
            </Box>
            <HStack spacing={3}>
              <Button
                variant={showAddForm ? "secondary" : "yellow"}
                size="md"
                onClick={() => setShowAddForm(!showAddForm)}
                leftIcon={
                  showAddForm ? (
                    <Minus size={16} />
                  ) : (
                    <Plus size={16} />
                  )
                }
              >
                {showAddForm ? "Cancel" : "Add Item"}
              </Button>
              <Box
                sx={{
                  "& button": {
                    borderRadius: "0 !important",
                    fontWeight: "bold !important",
                    textTransform: "uppercase",
                  },
                }}
              >
                <ConnectButton
                  chainStatus="none"
                  showBalance={false}
                  accountStatus="address"
                />
              </Box>
            </HStack>
          </Flex>

          {/* Add Form */}
          {showAddForm && <AddItemForm onAdd={handleAdd} />}

          {/* Items List */}
          {isLoading ? (
            <VStack py={16}>
              <Spinner size="xl" color="bauhaus.red" thickness="4px" />
            </VStack>
          ) : items.length === 0 ? (
            <VStack py={16}>
              <Text
                fontWeight="bold"
                color="text.tertiary"
                textTransform="uppercase"
              >
                No roadmap items yet. Add one above.
              </Text>
            </VStack>
          ) : (
            <VStack spacing={3} align="stretch">
              {items.map((item, index) => (
                <RoadmapItemCard
                  key={item._id}
                  item={item}
                  index={index}
                  total={items.length}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  onMove={handleMove}
                />
              ))}
            </VStack>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
