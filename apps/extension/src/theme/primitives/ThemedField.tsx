/**
 * ThemedField — labeled input wrapper.
 *
 * Bundles `FormControl + FormLabel + Input + (FormHelperText | FormErrorMessage)`
 * so the dozens of forms across Settings, Onboarding, AddChain, etc. don't
 * have to repeat the same five-element scaffolding.
 *
 * Focus ring behavior is already encoded in the Chakra Input variant by
 * `createTheme.ts → buildInput`, so per-theme focus styles are inherited
 * automatically without any work here.
 *
 * Pass `errorText` to put the field into an invalid state.
 * Pass `helperText` for hint copy (hidden when an error is present).
 *
 * For Textarea / Select / custom controls, render the FormControl manually
 * — this primitive is intentionally narrow and only wraps Input.
 */

import { forwardRef } from "react";
import {
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  type FormControlProps,
  type InputProps,
} from "@chakra-ui/react";

export interface ThemedFieldProps extends Omit<InputProps, "size"> {
  /** Visible label rendered above the input */
  label?: string;
  /** Hint copy shown below the input (hidden if errorText is present) */
  helperText?: string;
  /** Error message — when set, marks the field invalid */
  errorText?: string;
  /** Marks the field as required (adds the asterisk) */
  isFieldRequired?: boolean;
  /** Forwarded to the wrapping FormControl */
  formControlProps?: Omit<FormControlProps, "isInvalid" | "isRequired" | "children">;
}

export const ThemedField = forwardRef<HTMLInputElement, ThemedFieldProps>(
  function ThemedField(
    { label, helperText, errorText, isFieldRequired, formControlProps, id, ...inputProps },
    ref,
  ) {
    const isInvalid = !!errorText;

    return (
      <FormControl isInvalid={isInvalid} isRequired={isFieldRequired} {...formControlProps}>
        {label && <FormLabel htmlFor={id}>{label}</FormLabel>}
        <Input id={id} ref={ref} {...inputProps} />
        {helperText && !isInvalid && <FormHelperText>{helperText}</FormHelperText>}
        {isInvalid && <FormErrorMessage>{errorText}</FormErrorMessage>}
      </FormControl>
    );
  },
);
