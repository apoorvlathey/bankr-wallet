import { Avatar, Badge, Box, Button, Code, Text } from "@chakra-ui/react";
import {
  AssetDeltaRow,
  ConfirmationScreen,
  InlineDisclosure,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListSurface,
  OutcomeCard,
} from "@/components/ui";

export default function DecisionPrimitivesPreview({
  scenario,
}: {
  scenario: string;
}) {
  const stress = scenario === "stress";
  const error = scenario === "error";

  return (
    <ConfirmationScreen
      title="Confirm swap"
      onBack={() => {}}
      outcome={
        <OutcomeCard
          label={error ? "Unable to verify outcome" : "Expected outcome"}
          outcome={
            error
              ? "Review this request before continuing"
              : "Swap 2 USDC for at least 0.00113 ETH"
          }
          context="1inch finds the route. You keep control until confirmation."
          status={
            <Badge variant={error ? "warning" : "success"}>
              {error ? "Review" : "Simulated"}
            </Badge>
          }
        />
      }
      financialImpact={
        <Box
          bg="surface.raised"
          border="1px solid"
          borderColor="border.default"
          borderRadius="lg"
          px={4}
        >
          <AssetDeltaRow
            direction="send"
            asset="USDC"
            amount={stress ? "-2.000000000000000000" : "-2 USDC"}
            fiat="$2.00"
            media={<Avatar size="sm" name="USDC" bg="#2775CA" />}
          />
          <AssetDeltaRow
            direction="receive"
            asset="ETH"
            amount={stress ? "+0.001131170000000000" : "+0.00113 ETH"}
            fiat="$1.98"
            media={<Avatar size="sm" name="ETH" bg="#627EEA" />}
          />
        </Box>
      }
      context={
        <ListSurface>
          <ListItem>
            <ListItemContent>
              <ListItemTitle>Requested by</ListItemTitle>
              <ListItemDescription>swap.defillama.com</ListItemDescription>
            </ListItemContent>
          </ListItem>
          <ListItem>
            <ListItemContent>
              <ListItemTitle>Account and network</ListItemTitle>
              <ListItemDescription>walletchan.eth · Base</ListItemDescription>
            </ListItemContent>
          </ListItem>
          <ListItem>
            <ListItemContent>
              <ListItemTitle>Estimated network fee</ListItemTitle>
              <ListItemDescription>$0.03</ListItemDescription>
            </ListItemContent>
          </ListItem>
        </ListSurface>
      }
      advancedDetails={
        <InlineDisclosure
          label="Advanced details"
          description="Router, calldata, and simulation source"
        >
          <Box pt={3} color="fg.secondary" fontSize="sm">
            <Text mb={2}>Router: 1inch AggregationRouterV6</Text>
            <Code display="block" whiteSpace="normal" wordBreak="break-all">
              0x12aa3caf...0000000000000000000000000000000000000000
            </Code>
          </Box>
        </InlineDisclosure>
      }
      rejectAction={<Button variant="outline">Reject</Button>}
      confirmAction={
        <Button variant="primary" isDisabled={error}>
          Confirm swap
        </Button>
      }
    />
  );
}
