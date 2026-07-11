import {
  Box,
  Flex,
  Text,
  type FlexProps,
  type TextProps,
} from "@chakra-ui/react";
import {
  forwardRef,
  type MouseEventHandler,
  type ReactNode,
  type Ref,
} from "react";

export type ListItemDensity = "compact" | "default";
export type ListItemTone = "default" | "highlight";

interface ListItemSharedProps
  extends Omit<FlexProps, "as" | "onClick" | "title"> {
  children: ReactNode;
  density?: ListItemDensity;
  tone?: ListItemTone;
  isSelected?: boolean;
  isDisabled?: boolean;
}

interface StaticListItemProps extends ListItemSharedProps {
  interactive?: false;
  as?: "div";
  onClick?: never;
  href?: never;
}

interface ButtonListItemProps extends ListItemSharedProps {
  interactive: true;
  as?: "button";
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  href?: never;
}

interface AnchorListItemProps extends ListItemSharedProps {
  interactive: true;
  as: "a";
  href: string;
  target?: string;
  rel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}

export type ListItemProps =
  | StaticListItemProps
  | ButtonListItemProps
  | AnchorListItemProps;

type InternalListItemProps = ListItemSharedProps & {
  interactive?: boolean;
  as?: "div" | "button" | "a";
  type?: "button" | "submit" | "reset";
  href?: string;
  target?: string;
  rel?: string;
  onClick?: MouseEventHandler<HTMLElement>;
};

const SELECTED_SHADOW =
  "inset 0 0 0 1px var(--chakra-colors-border-focus)";
const FOCUS_SHADOW =
  "inset 0 0 0 2px var(--chakra-colors-border-focus)";

/**
 * A separator-based row with native interaction semantics.
 *
 * The outer `li` owns list semantics and its separator. Static content uses a
 * neutral inner `div`; set `interactive` for a native button, or pair it with
 * `as="a"` and `href` for a native link. This intentionally does not synthesize
 * button behavior on a generic element.
 */
export const ListItem = forwardRef<HTMLElement, ListItemProps>(
  function ListItem(props, ref) {
    const {
      interactive = false,
      as,
      type,
      href,
      target,
      rel,
      onClick,
      density = "default",
      tone = "default",
      isSelected = false,
      isDisabled = false,
      children,
      ...rest
    } = props as InternalListItemProps;

    const element = interactive ? as ?? "button" : as ?? "div";
    const isButton = interactive && element === "button";
    const isAnchor = interactive && element === "a";
    const isHighlighted = tone === "highlight" && !isDisabled;
    const selectedShadow = isSelected ? SELECTED_SHADOW : "none";
    const focusShadow = FOCUS_SHADOW;
    const controlProps: FlexProps = {
      ...rest,
      w: "full",
      minH: density === "compact" ? "48px" : "56px",
      px: density === "compact" ? 3 : 4,
      py: density === "compact" ? 2 : 3,
      gap: 3,
      align: "center",
      justify: "flex-start",
      position: "relative",
      zIndex: 0,
      appearance: "none",
      textAlign: "start",
      textDecoration: "none",
      fontFamily: "inherit",
      fontSize: "inherit",
      fontWeight: "inherit",
      color: isDisabled
        ? "fg.muted"
        : isHighlighted
          ? "accentFg.highlight"
          : "fg.primary",
      bg:
        isHighlighted
          ? "accent.highlight"
          : isSelected && !isDisabled
            ? "surface.raisedHover"
            : "transparent",
      borderWidth: 0,
      borderRadius: 0,
      boxShadow: selectedShadow,
      cursor: isDisabled
        ? "not-allowed"
        : interactive
          ? "pointer"
          : "default",
      transitionProperty: "background-color, color, box-shadow, opacity",
      transitionDuration: "fast",
      _hover:
        interactive && !isDisabled
          ? {
              bg: isHighlighted ? "accent.highlight" : "surface.raisedHover",
              opacity: isHighlighted ? 0.92 : 1,
              textDecoration: "none",
            }
          : undefined,
      _active:
        interactive && !isDisabled
          ? {
              bg: isHighlighted ? "accent.highlight" : "surface.sunken",
              opacity: isHighlighted ? 0.82 : 1,
            }
          : undefined,
      _focus: { outline: "none" },
      _focusVisible:
        interactive && !isDisabled
          ? {
              zIndex: 1,
              boxShadow: focusShadow,
            }
          : undefined,
    };

    const stateProps = {
      "data-interactive": interactive ? "" : undefined,
      "data-selected": isSelected ? "" : undefined,
      "data-disabled": isDisabled ? "" : undefined,
    };

    let control: ReactNode;

    if (isButton) {
      control = (
        <Flex
          ref={ref as Ref<HTMLButtonElement>}
          as="button"
          {...stateProps}
          {...controlProps}
          type={type ?? "button"}
          disabled={isDisabled}
          aria-disabled={isDisabled || undefined}
          onClick={
            isDisabled
              ? undefined
              : (onClick as FlexProps["onClick"])
          }
        >
          {children}
        </Flex>
      );
    } else if (isAnchor) {
      control = (
        <Flex
          ref={ref as Ref<HTMLAnchorElement>}
          as="a"
          {...stateProps}
          {...controlProps}
          href={isDisabled ? undefined : href}
          target={target}
          rel={rel}
          tabIndex={isDisabled ? -1 : undefined}
          aria-disabled={isDisabled || undefined}
          onClick={
            isDisabled
              ? undefined
              : (onClick as FlexProps["onClick"])
          }
        >
          {children}
        </Flex>
      );
    } else {
      control = (
        <Flex
          ref={ref as Ref<HTMLDivElement>}
          as="div"
          {...stateProps}
          {...controlProps}
        >
          {children}
        </Flex>
      );
    }

    return (
      <Box
        as="li"
        w="full"
        m={0}
        p={0}
        listStyleType="none"
        borderBottomWidth="1px"
        borderBottomStyle="solid"
        borderBottomColor="border.subtle"
        _first={{
          "& > *": { borderTopRadius: "lg" },
        }}
        _last={{
          borderBottomWidth: 0,
          "& > *": { borderBottomRadius: "lg" },
        }}
      >
        {control}
      </Box>
    );
  },
);

export interface ListItemMediaProps extends FlexProps {}

export const ListItemMedia = forwardRef<HTMLElement, ListItemMediaProps>(
  function ListItemMedia({ children, ...rest }, ref) {
    return (
      <Flex
        ref={ref}
        as="span"
        data-list-item-slot="media"
        {...rest}
        flex="0 0 auto"
        align="center"
        justify="center"
        color="fg.secondary"
      >
        {children}
      </Flex>
    );
  },
);

export interface ListItemContentProps extends FlexProps {}

export const ListItemContent = forwardRef<HTMLElement, ListItemContentProps>(
  function ListItemContent({ children, ...rest }, ref) {
    return (
      <Flex
        ref={ref}
        as="span"
        data-list-item-slot="content"
        {...rest}
        minW={0}
        flex="1 1 auto"
        direction="column"
        align="stretch"
        gap={0.5}
      >
        {children}
      </Flex>
    );
  },
);

export interface ListItemTitleProps extends TextProps {}

export const ListItemTitle = forwardRef<HTMLElement, ListItemTitleProps>(
  function ListItemTitle({ children, ...rest }, ref) {
    return (
      <Text
        ref={ref}
        as="span"
        data-list-item-slot="title"
        {...rest}
        color="inherit"
        fontSize="md"
        fontWeight={600}
        lineHeight="1.3"
        overflowWrap="anywhere"
      >
        {children}
      </Text>
    );
  },
);

export interface ListItemDescriptionProps extends TextProps {}

export const ListItemDescription = forwardRef<
  HTMLElement,
  ListItemDescriptionProps
>(function ListItemDescription({ children, ...rest }, ref) {
  return (
    <Text
      ref={ref}
      as="span"
      data-list-item-slot="description"
      {...rest}
      color="fg.secondary"
      fontSize="sm"
      fontWeight={400}
      lineHeight="1.45"
      overflowWrap="anywhere"
    >
      {children}
    </Text>
  );
});

export interface ListItemMetaProps extends TextProps {}

export const ListItemMeta = forwardRef<HTMLElement, ListItemMetaProps>(
  function ListItemMeta({ children, ...rest }, ref) {
    return (
      <Text
        ref={ref}
        as="span"
        data-list-item-slot="meta"
        minW={0}
        flex="0 1 auto"
        color="fg.secondary"
        fontSize="sm"
        fontWeight={400}
        lineHeight="1.45"
        textAlign="end"
        sx={{ fontVariantNumeric: "tabular-nums" }}
        overflowWrap="anywhere"
        {...rest}
      >
        {children}
      </Text>
    );
  },
);

export interface ListItemActionsProps extends FlexProps {}

/** Use row actions only on a static ListItem; never nest controls in a link/button row. */
export const ListItemActions = forwardRef<HTMLElement, ListItemActionsProps>(
  function ListItemActions({ children, ...rest }, ref) {
    return (
      <Flex
        ref={ref}
        as="span"
        data-list-item-slot="actions"
        {...rest}
        flex="0 0 auto"
        align="center"
        justify="flex-end"
        gap={1}
        color="fg.secondary"
      >
        {children}
      </Flex>
    );
  },
);
