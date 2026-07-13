/** Bounded, prototype-safe EIP-712 schema and object graph validation. */

import type { EIP712ValidationResult } from "./eip712ValidationTypes";

function isPrimitiveType(type: string): boolean {
  if (["address", "bool", "string", "bytes"].includes(type)) return true;
  if (
    /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)$/.test(
      type,
    )
  ) {
    return true;
  }
  return /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])$/.test(type);
}

export function detectEip712CircularReferences(
  types: Record<string, any>,
): EIP712ValidationResult {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(typeName: string): boolean {
    if (visiting.has(typeName)) return true;
    if (visited.has(typeName) || isPrimitiveType(typeName)) return false;
    const fields = types[typeName];
    if (!Array.isArray(fields)) return false;

    visiting.add(typeName);
    for (const field of fields) {
      if (field.type && visit(field.type.replace(/\[\]$/, ""))) return true;
    }
    visiting.delete(typeName);
    visited.add(typeName);
    return false;
  }

  for (const typeName of Object.keys(types)) {
    if (typeName !== "EIP712Domain" && visit(typeName)) {
      return {
        valid: false,
        error: `Circular reference detected in type '${typeName}'`,
      };
    }
  }
  return { valid: true };
}

export function validateEip712NestingDepth(
  types: Record<string, any>,
  maxDepth: number,
): EIP712ValidationResult {
  const visited = new Map<string, number>();

  function getDepth(typeName: string, currentDepth: number): number {
    if (currentDepth > maxDepth || isPrimitiveType(typeName)) {
      return currentDepth;
    }
    const cachedDepth = visited.get(typeName);
    if (cachedDepth !== undefined) return currentDepth + cachedDepth;
    const fields = types[typeName];
    if (!Array.isArray(fields)) return currentDepth;

    let maxChildDepth = 0;
    for (const field of fields) {
      if (!field.type) continue;
      const childDepth = getDepth(
        field.type.replace(/\[\]$/, ""),
        currentDepth + 1,
      );
      if (childDepth > maxDepth) return childDepth;
      maxChildDepth = Math.max(maxChildDepth, childDepth - currentDepth);
    }
    visited.set(typeName, maxChildDepth);
    return currentDepth + maxChildDepth;
  }

  for (const typeName of Object.keys(types)) {
    if (typeName === "EIP712Domain") continue;
    const depth = getDepth(typeName, 0);
    if (depth > maxDepth) {
      return {
        valid: false,
        error: `Type '${typeName}' exceeds maximum nesting depth of ${maxDepth} (found ${depth})`,
      };
    }
  }
  return { valid: true };
}

export function validateEip712TypeDefinitions(
  types: Record<string, any>,
): EIP712ValidationResult {
  const validIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
  for (const [typeName, fields] of Object.entries(types)) {
    if (!validIdentifier.test(typeName)) {
      return { valid: false, error: `Type '${typeName}' has an invalid name` };
    }
    if (!Array.isArray(fields)) {
      return {
        valid: false,
        error: `Type '${typeName}' must be an array of field definitions`,
      };
    }
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      if (typeof field !== "object" || field === null) {
        return {
          valid: false,
          error: `Type '${typeName}' field ${index} is not an object`,
        };
      }
      if (!field.name || typeof field.name !== "string") {
        return {
          valid: false,
          error: `Type '${typeName}' field ${index} missing or invalid 'name'`,
        };
      }
      if (!validIdentifier.test(field.name)) {
        return {
          valid: false,
          error: `Type '${typeName}' field '${field.name}' has an invalid name`,
        };
      }
      if (!field.type || typeof field.type !== "string") {
        return {
          valid: false,
          error: `Type '${typeName}' field '${field.name}' missing or invalid 'type'`,
        };
      }
      const baseType = field.type.replace(/\[\]$/, "");
      if (
        !isPrimitiveType(baseType) &&
        !Object.prototype.hasOwnProperty.call(types, baseType)
      ) {
        return {
          valid: false,
          error: `Type '${typeName}' field '${field.name}' has undefined type '${baseType}'`,
        };
      }
    }
  }
  return { valid: true };
}

/** Iterative traversal avoids stack overflow from a malicious object graph. */
export function validateEip712ObjectDepth(
  object: unknown,
  maxDepth: number,
): EIP712ValidationResult {
  const stack: { value: unknown; depth: number }[] = [
    { value: object, depth: 0 },
  ];
  const seen = new WeakSet<object>();
  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    if (depth > maxDepth) {
      return {
        valid: false,
        error: `Payload exceeds maximum object nesting depth of ${maxDepth}`,
      };
    }
    if (value === null || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    const values = Array.isArray(value)
      ? value
      : Object.values(value as Record<string, unknown>);
    for (const nested of values) {
      stack.push({ value: nested, depth: depth + 1 });
    }
  }
  return { valid: true };
}
