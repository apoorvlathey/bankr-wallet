import type { MouseEvent } from "react";
import {
  Box,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalOverlay,
  Text,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import type { AssetChange, NftStandard } from "@/chrome/txSimulation";
import { ShapesLoader } from "@/components/Chat/ShapesLoader";
import SafeImage from "@/components/SafeImage";
import { useTheme } from "@/theme";

export function NftStandardTag({ standard }: { standard: NftStandard }) {
  const label = standard === "erc721" ? "ERC-721 NFT" : "ERC-1155 NFT";
  return (
    <Box
      px={1}
      py="1px"
      border="1.5px solid"
      borderColor="border.default"
      bg="accent.highlight"
      flexShrink={0}
    >
      <Text
        fontSize="8px"
        fontWeight="800"
        color="accentFg.highlight"
        letterSpacing="0.02em"
        lineHeight="1.1"
      >
        {label}
      </Text>
    </Box>
  );
}

/**
 * Render NFT metadata only after the background decoded and re-encoded a
 * bounded raster. Raw SVG/data markup and metadata-controlled network URLs
 * never enter the privileged renderer.
 */
function NftMediaSandbox({
  src,
  alt,
  width = "64px",
  height = "64px",
  showBorder = true,
}: {
  src: string;
  alt: string;
  width?: string;
  height?: string;
  showBorder?: boolean;
}) {
  return (
    <Box
      width={width}
      height={height}
      border={showBorder ? "2px solid" : "none"}
      borderColor="border.default"
      bg="white"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
    >
      <SafeImage
        src={src}
        alt={alt}
        maxW="100%"
        maxH="100%"
        objectFit="contain"
        fallback={
          <Text
            fontSize="9px"
            fontWeight="800"
            color="text.tertiary"
            textAlign="center"
          >
            NFT
          </Text>
        }
      />
    </Box>
  );
}

function NftFullscreenModal({
  isOpen,
  onClose,
  src,
  alt,
  title,
  subtitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  title: string;
  subtitle?: string;
}) {
  const { tokens } = useTheme();

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4}>
        <ModalCloseButton
          color="text.primary"
          _hover={{ bg: "accent.highlight", color: "accentFg.highlight" }}
        />
        <ModalBody p={4}>
          <VStack spacing={3} align="stretch">
            <Box pr={6}>
              <Text
                fontSize="sm"
                fontWeight="600"
                color="text.primary"
                noOfLines={2}
              >
                {title}
              </Text>
              {subtitle && (
                <Text fontSize="xs" color="text.tertiary" noOfLines={2}>
                  {subtitle}
                </Text>
              )}
            </Box>
            <Box
              border={tokens.borders.thin}
              borderColor="border.default"
              borderRadius="md"
              bg="white"
              display="flex"
              alignItems="center"
              justifyContent="center"
              w="full"
              h="320px"
            >
              <NftMediaSandbox
                src={src}
                alt={alt}
                width="100%"
                height="100%"
                showBorder={false}
              />
            </Box>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

/** Compact NFT preview card shown in the Send/Receive rows. */
export function NftPreview({ change }: { change: AssetChange }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  if (!change.nft) return null;

  const metadata = change.nft.metadata;
  const loading = !!change.nft.metadataLoading;
  const showImage = metadata?.image;
  const isClickable = !!showImage;
  const altText = metadata?.name || change.symbol;
  const tokenId = change.nft.tokenId;
  const modalTitle = metadata?.name || change.symbol;
  const modalSubtitle = tokenId ? `#${tokenId}` : undefined;

  return (
    <>
      <Box
        as={isClickable ? "button" : "div"}
        w="64px"
        h="64px"
        minW="64px"
        border="1px solid"
        borderColor="border.default"
        borderRadius="md"
        bg="white"
        display="flex"
        alignItems="center"
        justifyContent="center"
        overflow="hidden"
        flexShrink={0}
        cursor={isClickable ? "pointer" : "default"}
        onClick={
          isClickable
            ? (event: MouseEvent<HTMLElement>) => {
                event.stopPropagation();
                onOpen();
              }
            : undefined
        }
        aria-label={isClickable ? `View ${altText}` : undefined}
        _hover={isClickable ? { borderColor: "accent.secondary" } : undefined}
        _focusVisible={isClickable ? { boxShadow: "focus" } : undefined}
        transition="border-color 0.1s"
      >
        {showImage ? (
          <NftMediaSandbox src={metadata!.image!} alt={altText} />
        ) : loading ? (
          <ShapesLoader size="6px" />
        ) : (
          <Text
            fontSize="9px"
            fontWeight="800"
            color="text.tertiary"
            textAlign="center"
          >
            NFT
          </Text>
        )}
      </Box>
      {showImage && (
        <NftFullscreenModal
          isOpen={isOpen}
          onClose={onClose}
          src={metadata!.image!}
          alt={altText}
          title={modalTitle}
          subtitle={modalSubtitle}
        />
      )}
    </>
  );
}
