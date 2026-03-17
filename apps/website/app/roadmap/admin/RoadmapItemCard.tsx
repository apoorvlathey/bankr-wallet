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
  Tag,
  IconButton,
  Flex,
} from "@chakra-ui/react";
import {
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  X,
  Check,
} from "lucide-react";

interface RoadmapItem {
  _id: string;
  title: string;
  description?: string;
  status: "done" | "in-progress" | "planned" | "idea";
  category?: string;
  order: number;
}

const STATUS_EMOJI: Record<string, string> = {
  done: "\u2705",
  "in-progress": "\uD83D\uDEA7",
  planned: "\uD83D\uDCCB",
  idea: "\uD83D\uDCA1",
};

interface Props {
  item: RoadmapItem;
  index: number;
  total: number;
  onUpdate: (item: RoadmapItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove: (index: number, direction: "up" | "down") => Promise<void>;
}

export default function RoadmapItemCard({
  item,
  index,
  total,
  onUpdate,
  onDelete,
  onMove,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(
    item.description || ""
  );
  const [editStatus, setEditStatus] = useState(item.status);
  const [editCategory, setEditCategory] = useState(item.category || "");

  const startEdit = () => {
    setEditTitle(item.title);
    setEditDescription(item.description || "");
    setEditStatus(item.status);
    setEditCategory(item.category || "");
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) return;
    setIsSaving(true);
    try {
      await onUpdate({
        ...item,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        status: editStatus,
        category: editCategory.trim() || undefined,
      });
      setIsEditing(false);
    } catch {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(item._id);
    } catch {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (isEditing) {
    return (
      <Box
        bg="white"
        border="3px solid"
        borderColor="bauhaus.blue"
        boxShadow="4px 4px 0px 0px #1040C0"
        p={{ base: 3, md: 4 }}
      >
        <VStack spacing={2} align="stretch">
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            borderRadius={0}
            border="2px solid"
            borderColor="bauhaus.black"
            fontWeight="bold"
            size="sm"
            _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
          />
          <Textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description (optional)"
            borderRadius={0}
            border="2px solid"
            borderColor="bauhaus.black"
            rows={2}
            size="sm"
            _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
          />
          <HStack spacing={2}>
            <Select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as RoadmapItem["status"])}
              borderRadius={0}
              border="2px solid"
              borderColor="bauhaus.black"
              fontWeight="bold"
              size="sm"
              _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
            >
              <option value="done">✅ Done</option>
              <option value="in-progress">🚧 In Progress</option>
              <option value="planned">📋 Planned</option>
              <option value="idea">💡 Idea</option>
            </Select>
            <Input
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              placeholder="Category"
              borderRadius={0}
              border="2px solid"
              borderColor="bauhaus.black"
              size="sm"
              _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
            />
          </HStack>
          <HStack spacing={2} justify="flex-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelEdit}
              leftIcon={<X size={14} />}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={saveEdit}
              isLoading={isSaving}
              leftIcon={<Check size={14} />}
              isDisabled={!editTitle.trim()}
            >
              Save
            </Button>
          </HStack>
        </VStack>
      </Box>
    );
  }

  return (
    <Box
      bg="white"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="4px 4px 0px 0px #121212"
      position="relative"
    >
      <Flex p={{ base: 3, md: 4 }} align="center" gap={3}>
        {/* Reorder buttons */}
        <VStack spacing={0} flexShrink={0}>
          <IconButton
            aria-label="Move up"
            icon={<ChevronUp size={16} />}
            size="xs"
            variant="ghost"
            isDisabled={index === 0}
            onClick={() => onMove(index, "up")}
          />
          <IconButton
            aria-label="Move down"
            icon={<ChevronDown size={16} />}
            size="xs"
            variant="ghost"
            isDisabled={index === total - 1}
            onClick={() => onMove(index, "down")}
          />
        </VStack>

        {/* Status emoji */}
        <Text fontSize="xl" flexShrink={0}>
          {STATUS_EMOJI[item.status]}
        </Text>

        {/* Content */}
        <VStack align="flex-start" spacing={0} flex={1} minW={0}>
          <HStack spacing={2} flexWrap="wrap">
            <Text fontWeight="black" fontSize="md" lineHeight="1.3">
              {item.title}
            </Text>
            {item.category && (
              <Tag
                size="sm"
                bg="bauhaus.black"
                color="white"
                fontWeight="bold"
                fontSize="2xs"
                textTransform="uppercase"
                letterSpacing="wider"
                borderRadius={0}
              >
                {item.category}
              </Tag>
            )}
          </HStack>
          {item.description && (
            <Text fontSize="xs" color="text.secondary" noOfLines={2}>
              {item.description}
            </Text>
          )}
        </VStack>

        {/* Actions */}
        <HStack spacing={1} flexShrink={0}>
          <IconButton
            aria-label="Edit"
            icon={<Pencil size={14} />}
            size="sm"
            variant="ghost"
            onClick={startEdit}
          />
          {confirmDelete ? (
            <HStack spacing={1}>
              <Button
                size="xs"
                colorScheme="red"
                onClick={handleDelete}
                isLoading={isDeleting}
                borderRadius={0}
              >
                Confirm
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                borderRadius={0}
              >
                Cancel
              </Button>
            </HStack>
          ) : (
            <IconButton
              aria-label="Delete"
              icon={<Trash2 size={14} />}
              size="sm"
              variant="ghost"
              color="gray.400"
              _hover={{ color: "bauhaus.red" }}
              onClick={() => setConfirmDelete(true)}
            />
          )}
        </HStack>
      </Flex>
    </Box>
  );
}
