"use client";

import { useState } from "react";
import {
  Box,
  VStack,
  HStack,
  Input,
  Textarea,
  Select,
  Button,
  Text,
} from "@chakra-ui/react";

interface AddItemFormProps {
  onAdd: (item: {
    title: string;
    description: string;
    status: string;
    category: string;
  }) => Promise<void>;
}

export default function AddItemForm({ onAdd }: AddItemFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("planned");
  const [category, setCategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await onAdd({
        title: title.trim(),
        description: description.trim(),
        status,
        category: category.trim(),
      });
      setTitle("");
      setDescription("");
      setStatus("planned");
      setCategory("");
    } catch {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box
      bg="white"
      border="4px solid"
      borderColor="bauhaus.black"
      boxShadow="6px 6px 0px 0px #121212"
      p={{ base: 4, md: 6 }}
    >
      <Text
        fontWeight="black"
        fontSize="lg"
        textTransform="uppercase"
        mb={4}
      >
        New Item
      </Text>
      <VStack spacing={3} align="stretch">
        <Input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          borderRadius={0}
          border="2px solid"
          borderColor="bauhaus.black"
          fontWeight="bold"
          _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
        />
        <Textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          borderRadius={0}
          border="2px solid"
          borderColor="bauhaus.black"
          rows={2}
          _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
        />
        <HStack spacing={3}>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            borderRadius={0}
            border="2px solid"
            borderColor="bauhaus.black"
            fontWeight="bold"
            _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
          >
            <option value="done">✅ Done</option>
            <option value="in-progress">🚧 In Progress</option>
            <option value="planned">📋 Planned</option>
            <option value="idea">💡 Idea</option>
          </Select>
          <Input
            placeholder="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            borderRadius={0}
            border="2px solid"
            borderColor="bauhaus.black"
            _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
          />
        </HStack>
        <Button
          variant="primary"
          onClick={handleSubmit}
          isLoading={isSubmitting}
          loadingText="Adding..."
          isDisabled={!title.trim()}
        >
          Add Item
        </Button>
      </VStack>
    </Box>
  );
}
