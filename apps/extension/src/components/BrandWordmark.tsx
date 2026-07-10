import { Text, type TextProps } from "@chakra-ui/react";

type BrandWordmarkProps = Omit<TextProps, "children">;

/**
 * The canonical WalletChan name lockup.
 *
 * Keep the source text in title case for assistive technology; the visual
 * uppercase treatment belongs to the brand system rather than the content.
 */
export default function BrandWordmark(props: BrandWordmarkProps) {
  return (
    <Text
      as="span"
      fontFamily="brand"
      fontSize="xl"
      fontWeight="400"
      lineHeight="1"
      letterSpacing="0.025em"
      textTransform="uppercase"
      whiteSpace="nowrap"
      {...props}
    >
      WalletChan
    </Text>
  );
}
