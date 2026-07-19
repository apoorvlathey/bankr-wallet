import {
  Flex,
  Heading,
  IconButton,
  type FlexProps,
} from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import {
  forwardRef,
  type ReactNode,
  type Ref,
} from "react";

export interface AppHeaderProps extends Omit<FlexProps, "title"> {
  title: ReactNode;
  onBack?: () => void;
  isBackDisabled?: boolean;
  backLabel?: string;
  trailing?: ReactNode;
  headingId?: string;
  headingRef?: Ref<HTMLHeadingElement>;
}

/** Standard 56px app-screen header with one optional trailing action. */
export const AppHeader = forwardRef<HTMLElement, AppHeaderProps>(
  function AppHeader(
    {
      title,
      onBack,
      isBackDisabled = false,
      backLabel = "Go back",
      trailing,
      headingId,
      headingRef,
      ...rest
    },
    ref,
  ) {
    return (
      <Flex
        ref={ref}
        as="header"
        {...rest}
        h="56px"
        minH="56px"
        w="full"
        px={2}
        align="center"
        gap={2}
        flexShrink={0}
        bg="surface.base"
        borderBottom="1px solid"
        borderColor="border.subtle"
      >
        {onBack && (
          <IconButton
            aria-label={backLabel}
            icon={<ArrowBackIcon boxSize={5} />}
            onClick={onBack}
            isDisabled={isBackDisabled}
            variant="ghost"
            minW="44px"
            w="44px"
            h="44px"
            flexShrink={0}
          />
        )}

        <Heading
          ref={headingRef}
          data-screen-heading
          as="h1"
          id={headingId}
          tabIndex={-1}
          flex="1 1 auto"
          minW={0}
          fontSize="xl"
          lineHeight="1.2"
          overflow="hidden"
          textOverflow="ellipsis"
          whiteSpace="nowrap"
        >
          {title}
        </Heading>

        {trailing && (
          <Flex minW="44px" minH="44px" align="center" justify="flex-end" flexShrink={0}>
            {trailing}
          </Flex>
        )}
      </Flex>
    );
  },
);
