import {
  Box,
  HStack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";

import { CopyButton } from "@/components/CopyButton";

interface SignatureMessageDataProps {
  message: string;
  rawData: string;
}

const scrollStyles = {
  "&::-webkit-scrollbar": { width: "6px" },
  "&::-webkit-scrollbar-track": { background: "transparent" },
  "&::-webkit-scrollbar-thumb": {
    background: "var(--chakra-colors-border-default)",
    borderRadius: "3px",
  },
};

function DataBlock({ value, emptyLabel }: { value: string; emptyLabel: string }) {
  if (!value) {
    return (
      <Text color="fg.secondary" fontSize="sm">
        {emptyLabel}
      </Text>
    );
  }

  return (
    <Box
      maxH="220px"
      overflowY="auto"
      p={3}
      bg="surface.sunken"
      borderWidth="1px"
      borderColor="border.subtle"
      borderRadius="md"
      css={scrollStyles}
    >
      <Text
        color="fg.primary"
        fontFamily="mono"
        fontSize="xs"
        lineHeight="1.55"
        overflowWrap="anywhere"
        whiteSpace="pre-wrap"
      >
        {value}
      </Text>
    </Box>
  );
}

/** Message and JSON views for personal_sign and eth_sign requests. */
export function SignatureMessageData({
  message,
  rawData,
}: SignatureMessageDataProps) {
  const [tabIndex, setTabIndex] = useState(0);
  const copyValue = tabIndex === 0 ? message : rawData;

  return (
    <Tabs
      index={tabIndex}
      onChange={setTabIndex}
      variant="soft-rounded"
      colorScheme="blue"
      isLazy={false}
    >
      <HStack justify="space-between" align="center" gap={2} mb={2}>
        <TabList minW={0} overflowX="auto">
          <Tab>Message</Tab>
          <Tab>Raw JSON</Tab>
        </TabList>
        <CopyButton value={copyValue} />
      </HStack>

      <TabPanels>
        <TabPanel p={0}>
          <DataBlock value={message} emptyLabel="No decoded message data" />
        </TabPanel>
        <TabPanel p={0}>
          <DataBlock value={rawData} emptyLabel="No raw signature data" />
        </TabPanel>
      </TabPanels>
    </Tabs>
  );
}
