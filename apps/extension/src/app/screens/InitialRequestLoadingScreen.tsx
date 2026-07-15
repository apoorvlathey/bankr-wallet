import {
  Box,
  HStack,
  Skeleton,
  SkeletonCircle,
  usePrefersReducedMotion,
  VisuallyHidden,
  VStack,
} from "@chakra-ui/react";
import { ConfirmationScreen } from "@/components/ui";
import { useTheme } from "@/theme";

type SkeletonTone = {
  startColor?: string;
  endColor?: string;
  animation?: string;
};

interface SkeletonLineProps {
  width: string;
  tone: SkeletonTone;
}

function SkeletonLine({ width, tone }: SkeletonLineProps) {
  return (
    <Skeleton
      {...tone}
      aria-hidden="true"
      h="12px"
      w={width}
      maxW="full"
      borderRadius="sm"
    />
  );
}

function AssetChangeSkeleton({ tone }: { tone: SkeletonTone }) {
  return (
    <HStack w="full" py={3} spacing={3} justify="space-between">
      <HStack minW={0} spacing={3}>
        <SkeletonCircle
          {...tone}
          aria-hidden="true"
          size="8"
          flexShrink={0}
        />
        <VStack minW={0} align="stretch" spacing={1.5}>
          <SkeletonLine width="92px" tone={tone} />
          <SkeletonLine width="64px" tone={tone} />
        </VStack>
      </HStack>
      <VStack flexShrink={0} align="flex-end" spacing={1.5}>
        <SkeletonLine width="72px" tone={tone} />
        <SkeletonLine width="48px" tone={tone} />
      </VStack>
    </HStack>
  );
}

function RequestDetailSkeleton({ tone }: { tone: SkeletonTone }) {
  return (
    <Box
      w="full"
      px={3}
      bg="surface.raised"
      borderWidth="1px"
      borderStyle="solid"
      borderColor="border.subtle"
      borderRadius="lg"
    >
      <VStack align="stretch" spacing={0}>
        {["78px", "106px", "88px"].map((valueWidth, index) => (
          <HStack
            key={valueWidth}
            minH="44px"
            justify="space-between"
            spacing={4}
            borderBottomWidth={index === 2 ? 0 : "1px"}
            borderBottomStyle="solid"
            borderBottomColor="border.subtle"
          >
            <SkeletonLine
              width={index === 1 ? "68px" : "54px"}
              tone={tone}
            />
            <SkeletonLine width={valueWidth} tone={tone} />
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}

function DecisionSummarySkeleton({ tone }: { tone: SkeletonTone }) {
  return (
    <VStack align="stretch" spacing={2}>
      <HStack justify="space-between" spacing={4}>
        <SkeletonLine width="64px" tone={tone} />
        <SkeletonLine width="112px" tone={tone} />
      </HStack>
      <HStack justify="space-between" spacing={4}>
        <SkeletonLine width="82px" tone={tone} />
        <SkeletonLine width="72px" tone={tone} />
      </HStack>
    </VStack>
  );
}

function ActionSkeleton({ tone }: { tone: SkeletonTone }) {
  return (
    <Skeleton
      {...tone}
      aria-hidden="true"
      h="44px"
      w="full"
      borderRadius="md"
    />
  );
}

/** Cold-start placeholder shaped like the transaction confirmation it precedes. */
export default function InitialRequestLoadingScreen() {
  const { themeId } = useTheme();
  const prefersReducedMotion = usePrefersReducedMotion();
  const tone: SkeletonTone = {
    ...(themeId === "midnight"
      ? {
          startColor: "surface.raised",
          endColor: "surface.raisedHover",
        }
      : {}),
    animation: prefersReducedMotion ? "none" : undefined,
  };

  const sectionHeading = (width: string) => (
    <Skeleton
      {...tone}
      as="span"
      aria-hidden="true"
      display="block"
      h="20px"
      w={width}
      maxW="full"
      borderRadius="sm"
    />
  );

  return (
    <ConfirmationScreen
      role="status"
      aria-busy="true"
      aria-label="Loading request"
      title={
        <>
          <VisuallyHidden>Loading request</VisuallyHidden>
          {sectionHeading("156px")}
        </>
      }
      trailing={
        <Skeleton
          {...tone}
          aria-hidden="true"
          boxSize="32px"
          borderRadius="md"
        />
      }
      outcome={
        <VStack
          aria-hidden="true"
          as="section"
          w="full"
          spacing={2}
          py={2}
        >
          <SkeletonCircle {...tone} size="9" />
          <SkeletonLine width="112px" tone={tone} />
        </VStack>
      }
      financialImpactTitle={sectionHeading("176px")}
      financialImpact={
        <Box
          px={3}
          bg="surface.raised"
          borderWidth="1px"
          borderStyle="solid"
          borderColor="border.subtle"
          borderRadius="lg"
          overflow="hidden"
        >
          <AssetChangeSkeleton tone={tone} />
        </Box>
      }
      contextTitle={sectionHeading("136px")}
      context={<RequestDetailSkeleton tone={tone} />}
      advancedDetails={
        <HStack
          aria-hidden="true"
          minH="44px"
          px={3}
          justify="space-between"
          bg="surface.raised"
          borderWidth="1px"
          borderStyle="solid"
          borderColor="border.subtle"
          borderRadius="lg"
        >
          <SkeletonLine width="118px" tone={tone} />
          <SkeletonCircle {...tone} size="5" />
        </HStack>
      }
      actionSummary={<DecisionSummarySkeleton tone={tone} />}
      confirmAction={<ActionSkeleton tone={tone} />}
      rejectAction={<ActionSkeleton tone={tone} />}
    />
  );
}
