import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Radio,
  RadioGroup,
  Select,
  SimpleGrid,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Spinner,
  Stack,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  Tooltip,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  InfoIcon,
  SettingsIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import {
  IconBox,
  ThemedCard,
  ThemedPanel,
} from "@/theme/primitives";

function LabSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" fontWeight="600" color="fg.primary">
        {title}
      </Text>
      {children}
    </VStack>
  );
}

export default function ComponentLab() {
  const modal = useDisclosure();
  const drawer = useDisclosure();

  return (
    <Box h="100%" overflowY="auto" bg="surface.base" color="fg.primary" p={4}>
      <VStack align="stretch" spacing={6} pb={8}>
        <Box>
          <Text fontSize="xl" fontWeight="700" letterSpacing="-0.01em">
            Component states
          </Text>
          <Text mt={1} fontSize="sm" color="fg.secondary">
            Production Chakra recipes under the active WalletChan theme.
          </Text>
        </Box>

        <LabSection title="Foundations">
          <SimpleGrid columns={2} spacing={2}>
            {[
              ["Base", "surface.base"],
              ["Raised", "surface.raised"],
              ["Hover", "surface.raisedHover"],
              ["Sunken", "surface.sunken"],
            ].map(([label, bg]) => (
              <Box
                key={label}
                minH="56px"
                p={3}
                bg={bg}
                border="1px solid"
                borderColor="border.subtle"
                borderRadius="md"
              >
                <Text fontSize="xs" color="fg.secondary">
                  {label}
                </Text>
              </Box>
            ))}
          </SimpleGrid>
          <VStack align="stretch" spacing={1}>
            <Text color="fg.primary">Primary information</Text>
            <Text color="fg.secondary">Supporting context and labels</Text>
            <Text color="fg.muted">Tertiary metadata and placeholders</Text>
            <Text fontFamily="mono" fontSize="sm" sx={{ fontVariantNumeric: "tabular-nums" }}>
              0x742d...8f44 · $37,919.63
            </Text>
          </VStack>
        </LabSection>

        <Divider />

        <LabSection title="Actions">
          <Stack spacing={2}>
            <Button variant="primary">Confirm transaction</Button>
            <Button variant="secondary">Review details</Button>
            <Button variant="outline">Secondary action</Button>
            <HStack>
              <Button variant="ghost" flex={1}>Cancel</Button>
              <Button variant="danger" flex={1}>Remove</Button>
            </HStack>
            <Button variant="primary" isLoading loadingText="Confirming">
              Confirming
            </Button>
            <Button isDisabled>Unavailable action with a longer label</Button>
            <HStack>
              <IconButton aria-label="Settings" icon={<SettingsIcon />} />
              <IconButton
                aria-label="Important information"
                variant="outline"
                icon={<InfoIcon />}
              />
              <Button variant="link">View on explorer</Button>
            </HStack>
          </Stack>
        </LabSection>

        <Divider />

        <LabSection title="Forms">
          <VStack align="stretch" spacing={4}>
            <FormControl>
              <FormLabel>Recipient</FormLabel>
              <Input placeholder="Name or 0x address" />
              <FormHelperText>Addresses are checked before signing.</FormHelperText>
            </FormControl>
            <FormControl isInvalid>
              <FormLabel>Amount</FormLabel>
              <Input defaultValue="999999999999999999" />
              <FormErrorMessage>Amount exceeds the available balance.</FormErrorMessage>
            </FormControl>
            <FormControl>
              <FormLabel>Note</FormLabel>
              <Textarea placeholder="Optional private note" />
            </FormControl>
            <FormControl>
              <FormLabel>Network</FormLabel>
              <Select defaultValue="base">
                <option value="base">Base</option>
                <option value="ethereum">Ethereum</option>
              </Select>
            </FormControl>
            <HStack justify="space-between">
              <Checkbox defaultChecked>Remember preference</Checkbox>
              <Switch aria-label="Enable protection" defaultChecked />
            </HStack>
            <RadioGroup defaultValue="standard">
              <HStack spacing={5}>
                <Radio value="standard">Standard</Radio>
                <Radio value="fast">Fast</Radio>
              </HStack>
            </RadioGroup>
            <Slider aria-label="Slippage" defaultValue={25}>
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb />
            </Slider>
          </VStack>
        </LabSection>

        <Divider />

        <LabSection title="Selection and navigation">
          <Tabs variant="soft-rounded">
            <TabList>
              <Tab>Holdings</Tab>
              <Tab>Activity</Tab>
              <Tab isDisabled>Hidden</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px={0} pb={0}>
                <Text fontSize="sm" color="fg.secondary">
                  Selected content stays visually connected to its tab.
                </Text>
              </TabPanel>
            </TabPanels>
          </Tabs>
          <HStack>
            <Menu>
              <MenuButton as={Button} rightIcon={<ChevronDownIcon />}>
                Choose network
              </MenuButton>
              <MenuList>
                <MenuItem aria-current="page">Base</MenuItem>
                <MenuItem>Ethereum</MenuItem>
                <MenuItem isDisabled>Unavailable network</MenuItem>
              </MenuList>
            </Menu>
            <Tooltip label="Security settings" hasArrow>
              <IconButton aria-label="Security settings" icon={<SettingsIcon />} />
            </Tooltip>
          </HStack>
        </LabSection>

        <Divider />

        <LabSection title="Feedback">
          <HStack flexWrap="wrap">
            <Badge variant="success">Confirmed</Badge>
            <Badge variant="warning">Review</Badge>
            <Badge variant="error">Failed</Badge>
            <Badge variant="info">Base</Badge>
          </HStack>
          <VStack align="stretch" spacing={2}>
            <Alert status="success">
              <AlertIcon />
              <Box>
                <AlertTitle>Simulation passed</AlertTitle>
                <AlertDescription>No unexpected asset changes.</AlertDescription>
              </Box>
            </Alert>
            <Alert status="warning">
              <AlertIcon />
              <Box>
                <AlertTitle>Review required</AlertTitle>
                <AlertDescription>One permission has no expiry.</AlertDescription>
              </Box>
            </Alert>
          </VStack>
          <HStack color="fg.secondary">
            <Spinner size="sm" />
            <Text fontSize="sm">Loading transaction details</Text>
          </HStack>
        </LabSection>

        <Divider />

        <LabSection title="Theme primitives">
          <ThemedCard>
            <HStack>
              <IconBox><CheckCircleIcon /></IconBox>
              <Box>
                <Text fontWeight="600">Default card</Text>
                <Text fontSize="sm" color="fg.secondary">Quiet resting surface</Text>
              </Box>
            </HStack>
          </ThemedCard>
          <ThemedCard
            as="button"
            variant="raised"
            interactive
            w="full"
            textAlign="left"
          >
            <HStack>
              <IconBox bg="status.warning.bg" noShadow><WarningIcon /></IconBox>
              <Text fontWeight="600">Interactive raised card</Text>
            </HStack>
          </ThemedCard>
          <ThemedPanel variant="sunken">
            <Text fontSize="sm" color="fg.secondary">
              Recessed panel for technical or secondary information.
            </Text>
          </ThemedPanel>
        </LabSection>

        <Divider />

        <LabSection title="Overlays">
          <HStack>
            <Button flex={1} onClick={modal.onOpen}>Open dialog</Button>
            <Button flex={1} onClick={drawer.onOpen}>Open sheet</Button>
          </HStack>
        </LabSection>
      </VStack>

      <Modal isOpen={modal.isOpen} onClose={modal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirm removal</ModalHeader>
          <ModalCloseButton />
          <ModalBody color="fg.secondary">
            This focused decision blocks the current flow and returns focus to
            its trigger when dismissed.
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="ghost" onClick={modal.onClose}>Cancel</Button>
            <Button variant="danger" onClick={modal.onClose}>Remove</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Drawer isOpen={drawer.isOpen} placement="bottom" onClose={drawer.onClose}>
        <DrawerOverlay />
        <DrawerContent borderTopRadius="xl">
          <DrawerCloseButton />
          <DrawerHeader>Choose an action</DrawerHeader>
          <DrawerBody>
            <VStack align="stretch">
              <Button variant="ghost">Copy address</Button>
              <Button variant="ghost">View on explorer</Button>
            </VStack>
          </DrawerBody>
          <DrawerFooter>
            <Button w="full" onClick={drawer.onClose}>Done</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </Box>
  );
}
