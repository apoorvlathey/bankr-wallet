import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  type BoxProps,
  type FormControlProps,
  type InputProps,
} from "@chakra-ui/react";
import { Search2Icon } from "@chakra-ui/icons";
import { forwardRef, type ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { AppScreen, ScreenBody, type AppScreenProps } from "./AppScreen";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
} from "./EmptyState";
import { ListSurface } from "./ListSurface";
import { SkeletonRow } from "./SkeletonRow";

export interface FullScreenPickerProps extends Omit<AppScreenProps, "title"> {
  title: ReactNode;
  onBack: () => void;
  backLabel?: string;
  trailing?: ReactNode;
  controls?: ReactNode;
}

/**
 * Screen-level picker shell. Domain adapters retain ownership of filtering,
 * grouping, selection, and the value returned by a choice.
 */
export const FullScreenPicker = forwardRef<HTMLDivElement, FullScreenPickerProps>(
  function FullScreenPicker(
    {
      title,
      onBack,
      backLabel = "Back",
      trailing,
      controls,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <AppScreen ref={ref} maxW="480px" mx="auto" {...rest}>
        <AppHeader
          title={title}
          onBack={onBack}
          backLabel={backLabel}
          trailing={trailing}
        />
        {controls && (
          <Box px={4} pt={3} pb={2} flexShrink={0} bg="surface.base">
            {controls}
          </Box>
        )}
        <ScreenBody pt={controls ? 1 : 3} pb={4}>
          {children}
        </ScreenBody>
      </AppScreen>
    );
  },
);

export interface FullScreenPickerSearchProps
  extends Omit<InputProps, "size"> {
  label: string;
  labelTrailing?: ReactNode;
  formControlProps?: Omit<FormControlProps, "children">;
}

export const FullScreenPickerSearch = forwardRef<
  HTMLInputElement,
  FullScreenPickerSearchProps
>(function FullScreenPickerSearch(
  { label, labelTrailing, formControlProps, ...inputProps },
  ref,
) {
  return (
    <FormControl {...formControlProps}>
      <HStack mb={1.5} minW={0} justify="space-between" spacing={2}>
        <FormLabel mb={0} minW={0} fontSize="sm">
          {label}
        </FormLabel>
        {labelTrailing && <Box minW={0}>{labelTrailing}</Box>}
      </HStack>
      <InputGroup>
        <InputLeftElement pointerEvents="none" color="fg.muted">
          <Search2Icon aria-hidden="true" />
        </InputLeftElement>
        <Input ref={ref} type="search" {...inputProps} pl={10} />
      </InputGroup>
    </FormControl>
  );
});

export interface FullScreenPickerScopesProps extends BoxProps {}

/** Optional horizontal scopes. Children should be native buttons or tabs. */
export const FullScreenPickerScopes = forwardRef<
  HTMLDivElement,
  FullScreenPickerScopesProps
>(function FullScreenPickerScopes({ children, ...rest }, ref) {
  return (
    <HStack
      ref={ref}
      role="group"
      {...rest}
      mt={3}
      spacing={2}
      overflowX="auto"
      overscrollBehaviorX="contain"
      pb={1}
      sx={{ scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
    >
      {children}
    </HStack>
  );
});

export interface FullScreenPickerGroupProps extends BoxProps {
  label: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
}

export const FullScreenPickerGroup = forwardRef<
  HTMLDivElement,
  FullScreenPickerGroupProps
>(function FullScreenPickerGroup(
  { label, description, trailing, children, ...rest },
  ref,
) {
  return (
    <Box ref={ref} as="section" _notFirst={{ mt: 5 }} {...rest}>
      <HStack mb={2} px={1} align="flex-start" justify="space-between" spacing={3}>
        <Box minW={0}>
          <Text as="h2" fontSize="sm" fontWeight="600" color="fg.secondary">
            {label}
          </Text>
          {description && (
            <Text mt={0.5} fontSize="xs" color="fg.muted">
              {description}
            </Text>
          )}
        </Box>
        {trailing && <Box flexShrink={0}>{trailing}</Box>}
      </HStack>
      <ListSurface>{children}</ListSurface>
    </Box>
  );
});

export interface FullScreenPickerLoadingProps extends BoxProps {
  rows?: number;
  label?: string;
}

export function FullScreenPickerLoading({
  rows = 5,
  label = "Loading choices",
  ...rest
}: FullScreenPickerLoadingProps) {
  return (
    <Box role="status" aria-label={label} {...rest}>
      <ListSurface>
        {Array.from({ length: rows }, (_, index) => (
          <SkeletonRow key={index} />
        ))}
      </ListSurface>
    </Box>
  );
}

export interface FullScreenPickerEmptyProps extends Omit<BoxProps, "title"> {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
}

export function FullScreenPickerEmpty({
  title,
  description,
  action,
  ...rest
}: FullScreenPickerEmptyProps) {
  return (
    <EmptyState {...rest}>
      <EmptyStateHeader>
        <EmptyStateTitle>{title}</EmptyStateTitle>
        <EmptyStateDescription>{description}</EmptyStateDescription>
      </EmptyStateHeader>
      {action && <EmptyStateActions>{action}</EmptyStateActions>}
    </EmptyState>
  );
}
