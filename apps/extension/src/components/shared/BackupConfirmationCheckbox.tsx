import { Box, Checkbox, Text } from "@chakra-ui/react";

interface BackupConfirmationCheckboxProps {
  isChecked: boolean;
  label: string;
  onChange: (isChecked: boolean) => void;
}

export function BackupConfirmationCheckbox({
  isChecked,
  label,
  onChange,
}: BackupConfirmationCheckboxProps) {
  return (
    <Box display="flex" justifyContent="center">
      <Checkbox
        minH="32px"
        variant="commitment"
        isChecked={isChecked}
        onChange={(event) => onChange(event.target.checked)}
      >
        <Text fontSize="sm" color="fg.primary" fontWeight="600">
          {label}
        </Text>
      </Checkbox>
    </Box>
  );
}
