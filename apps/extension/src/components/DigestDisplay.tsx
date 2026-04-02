import { useMemo, useState } from "react";
import {
  Box,
  HStack,
  VStack,
  Text,
  Code,
  Collapse,
  SimpleGrid,
  Spacer,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { CopyButton } from "@/components/CopyButton";
import {
  computeCalldataDigest,
  computeEip712Digest,
  computeDomainHash,
  computeMessageHash,
} from "@/lib/erc8213";
import type { Hex } from "viem";

// Argent emoji hash: 256 emojis, one per byte value (0x00–0xFF)
// https://github.com/argentlabs/emoji-hash
const HASH_EMOJIS = [
  "💩","👻","🤖","🎃","🤡","🦅","🐢","🐔","🐧","👁","👍","👎","🌵","🌎","🌈","🍏",
  "⚽️","☂️","⭐️","🚀","🍕","🚗","🏹","🎧","🔑","🎹","❤️","🌲","👹","👅","🔥","💄",
  "👽","🦋","🐝","🐬","🍋","🍌","🧀","🍦","🍰","🦁","🏀","🏅","🎲","🚲","🚁","🌞",
  "🍎","🍍","🥝","🥑","🍅","⏰","💰","💎","📞","💣","✂️","🔒","🔍","✏️","✈️","🚌",
  "🚓","🛵","⛵️","⚓️","🚦","⛄️","🌽","⛔️","🦄","❓","⚠️","🅿️","🕞","👓","🌹","🕷",
  "🐍","🐌","🐊","🦈","🐋","🌭","🎵","♻️","🔔","🏁","📔","📚","📎","📌","🍊","🍓",
  "🍔","🍟","🍿","🍩","🥛","🍪","☕️","🍬","🥕","🍒","🥞","🥚","🥐","🍞","🍐","🍇",
  "🍉","🐫","🐘","🦏","🦍","🐎","🐑","🐸","💯","☀️","☠️","🐼","⚡️","💬","⚜️","😎",
  "😱","🌋","🏖","🌛","🎮","❄️","🐭","🐵","🛒","🥄","☁️","📐","🌼","🌸","💧","🌪",
  "🍄","💪","🐛","🎺","💛","💚","💙","💜","👋","🔨","💡","🚧","🎱","🔪","🎩","🏓",
  "⛳️","⛷","🏂","📡","🍭","💥","🐥","☘️","🐟","📱","👠","🕶","💼","🍼","🐞","🐜",
  "🕸","🦎","🦀","🏆","⚖️","🔭","🎓","🔬","📷","🎁","👑","👀","🎬","🐰","🎨","🎤",
  "🎸","💊","💉","🌡","🚽","🚤","⛺️","🐙","🦆","🦉","🦇","🐴","🐩","🥁","🎳","😃",
  "😇","😹","🌳","😛","🚂","👂","🛩","🎒","🌶","🍚","⌨️","🍆","📊","🍽","🔋","🗄",
  "📋","🗞","📺","🎥","💿","📪","🐄","🐓","🥒","🥜","🥖","🎂","🍫","👔","👗","🌻",
  "⛰","🎉","📦","🐿","👮","👷","🃏","👛","🐚","🍁","🐣","🍳","🎪","🥊","⚙️","📅",
];

function hexToEmojiArray(hex: string): string[] {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const emojis: string[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    emojis.push(HASH_EMOJIS[parseInt(clean.slice(i, i + 2), 16)]);
  }
  return emojis;
}

type DigestTab = "hex" | "emoji";

/** Pick 2 random column indices per row for spot-check highlighting */
function generateHighlightedCells(totalEmojis: number): Set<number> {
  const cells = new Set<number>();
  const numRows = Math.ceil(totalEmojis / 8);
  for (let row = 0; row < numRows; row++) {
    const cols = Array.from({ length: 8 }, (_, i) => i);
    // Partial Fisher-Yates: pick 2 random columns
    for (let i = 0; i < 2; i++) {
      const j = i + Math.floor(Math.random() * (cols.length - i));
      [cols[i], cols[j]] = [cols[j], cols[i]];
    }
    cells.add(row * 8 + cols[0]);
    cells.add(row * 8 + cols[1]);
  }
  return cells;
}

function DigestBox({
  label,
  labelBg,
  labelColor,
  hash,
  defaultOpen = false,
}: {
  label: string;
  labelBg: string;
  labelColor: string;
  hash: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<DigestTab>("emoji");
  const emojiArray = useMemo(() => hexToEmojiArray(hash), [hash]);
  // Random spot-check cells — new selection each time the component mounts
  const [highlightedCells] = useState(() => generateHighlightedCells(emojiArray.length));

  return (
    <Box w="full">
      <HStack spacing={1.5}>
        <HStack
          spacing={1}
          cursor="pointer"
          onClick={() => setOpen(!open)}
          _hover={{ opacity: 0.8 }}
        >
          <Code
            px={2}
            py={0.5}
            fontSize="10px"
            bg={labelBg}
            color={labelColor}
            fontWeight="800"
            border="2px solid"
            borderColor="bauhaus.black"
            textTransform="uppercase"
            flexShrink={0}
          >
            {label}
          </Code>
          <ChevronDownIcon
            boxSize="16px"
            color="text.secondary"
            transform={open ? "rotate(180deg)" : "rotate(0deg)"}
            transition="transform 0.2s ease-out"
          />
        </HStack>
        {open && (
          <>
            {/* Tabs */}
            <HStack spacing={0} border="2px solid" borderColor="bauhaus.black" h="20px">
              {(["emoji", "hex"] as const).map((t, idx) => (
                <Box
                  key={t}
                  as="button"
                  px={1.5}
                  h="full"
                  fontSize="10px"
                  fontWeight="800"
                  textTransform="uppercase"
                  bg={tab === t ? "bauhaus.black" : "transparent"}
                  color={tab === t ? "white" : "text.secondary"}
                  borderRight={idx === 0 ? "2px solid" : undefined}
                  borderColor="bauhaus.black"
                  onClick={() => setTab(t)}
                  cursor="pointer"
                  _hover={{ opacity: 0.8 }}
                >
                  {t}
                </Box>
              ))}
            </HStack>
            <Spacer />
            <CopyButton value={tab === "hex" ? hash : emojiArray.join("")} />
          </>
        )}
      </HStack>

      <Collapse in={open} animateOpacity>
        <Box mt={1}>
          {tab === "hex" ? (
            <Box
              p={2}
              bg="bg.muted"
              border="2px solid"
              borderColor="bauhaus.black"
            >
              <Text
                fontSize="xs"
                fontFamily="mono"
                fontWeight="600"
                wordBreak="break-all"
                whiteSpace="pre-wrap"
                lineHeight="1.7"
              >
                <Text as="span" color="text.tertiary">0x</Text>
                {/* Split hex digits (after 0x) into 4-char chunks with alternating colors */}
                {hash.slice(2).match(/.{1,4}/g)?.map((chunk, i) => (
                  <Text
                    key={i}
                    as="span"
                    color={i % 2 === 0 ? "#C03030" : "#208040"}
                  >
                    {chunk}
                  </Text>
                ))}
              </Text>
            </Box>
          ) : (
            <Box>
              <Box border="2px solid" borderColor="bauhaus.black" bg="white">
                <SimpleGrid columns={8} spacing={0}>
                  {emojiArray.map((emoji, i) => {
                    const isHighlighted = highlightedCells.has(i);
                    return (
                      <Box
                        key={i}
                        position="relative"
                        borderRight={i % 8 !== 7 ? "1px solid" : undefined}
                        borderBottom={i < emojiArray.length - 8 ? "1px solid" : undefined}
                        borderColor="gray.200"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        py={1.5}
                        bg={isHighlighted ? "rgba(240, 192, 32, 0.25)" : undefined}
                      >
                        <Text
                          position="absolute"
                          top="1px"
                          left="2px"
                          fontSize="7px"
                          fontFamily="mono"
                          color={isHighlighted ? "bauhaus.black" : "gray.400"}
                          fontWeight="700"
                          lineHeight="1"
                        >
                          {i + 1}
                        </Text>
                        <Text fontSize="md" lineHeight="1">
                          {emoji}
                        </Text>
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </Box>
              <Text
                mt={1}
                fontSize="9px"
                fontWeight="700"
                color="text.tertiary"
                textTransform="uppercase"
              >
                Verify highlighted emojis match your device
              </Text>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

/** ERC-8213: Calldata Digest display for transaction confirmation */
export function CalldataDigestDisplay({ calldata }: { calldata: string }) {
  const digest = useMemo(
    () => computeCalldataDigest(calldata as Hex),
    [calldata]
  );

  if (!digest) return null;

  return (
    <DigestBox
      label="Calldata Digest"
      labelBg="bauhaus.yellow"
      labelColor="bauhaus.black"
      hash={digest}
    />
  );
}

/** ERC-8213: EIP-712 Digest display for signature confirmation */
export function Eip712DigestDisplay({ typedData }: { typedData: any }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { digest, domainHash, messageHash } = useMemo(() => {
    return {
      digest: computeEip712Digest(typedData),
      domainHash: computeDomainHash(typedData),
      messageHash: computeMessageHash(typedData),
    };
  }, [typedData]);

  if (!digest) return null;

  return (
    <VStack w="full" align="start" spacing={2}>
      <DigestBox
        label="EIP-712 Digest"
        labelBg="bauhaus.blue"
        labelColor="white"
        hash={digest}
      />

      {(domainHash || messageHash) && (
        <Box w="full">
          <HStack
            spacing={1}
            cursor="pointer"
            onClick={() => setDetailsOpen(!detailsOpen)}
            _hover={{ opacity: 0.8 }}
          >
            <Text
              fontSize="10px"
              color="text.tertiary"
              fontWeight="700"
              textTransform="uppercase"
            >
              Hash Details
            </Text>
            <ChevronDownIcon
              boxSize="14px"
              color="text.secondary"
              transform={detailsOpen ? "rotate(180deg)" : "rotate(0deg)"}
              transition="transform 0.2s ease-out"
            />
          </HStack>
          <Collapse in={detailsOpen} animateOpacity>
            <VStack align="start" spacing={2} mt={1.5} pl={2} borderLeft="2px solid" borderColor="bauhaus.black">
              {domainHash && (
                <DigestBox
                  label="Domain Hash"
                  labelBg="bauhaus.red"
                  labelColor="white"
                  hash={domainHash}
                />
              )}
              {messageHash && (
                <DigestBox
                  label="Message Hash"
                  labelBg="bauhaus.yellow"
                  labelColor="bauhaus.black"
                  hash={messageHash}
                />
              )}
            </VStack>
          </Collapse>
        </Box>
      )}
    </VStack>
  );
}
