/** Reduce displayed/signed typed data to fields present in its schema. */

type SanitizedTypes = Record<string, { name: string; type: string }[]>;

function sanitizeValueByType(
  value: any,
  typeName: string,
  types: SanitizedTypes,
): any {
  if (value === null || value === undefined) return value;
  const baseType = typeName.replace(/\[\]$/, "");
  if (typeName.endsWith("[]") && Array.isArray(value)) {
    return value.map((item) => sanitizeValueByType(item, baseType, types));
  }
  if (!Object.prototype.hasOwnProperty.call(types, baseType)) return value;
  if (typeof value !== "object" || Array.isArray(value)) return value;

  const sanitized: Record<string, any> = Object.create(null);
  for (const field of types[baseType]) {
    if (Object.prototype.hasOwnProperty.call(value, field.name)) {
      sanitized[field.name] = sanitizeValueByType(
        value[field.name],
        field.type,
        types,
      );
    }
  }
  return sanitized;
}

export function sanitizeEip712TypedData(data: any): string {
  const types: SanitizedTypes = Object.create(null);
  for (const [typeName, fields] of Object.entries(data.types)) {
    types[typeName] = (fields as any[]).map((field) => ({
      name: field.name,
      type: field.type,
    }));
  }
  return JSON.stringify({
    types,
    domain: sanitizeValueByType(data.domain, "EIP712Domain", types),
    primaryType: data.primaryType,
    message: sanitizeValueByType(data.message, data.primaryType, types),
  });
}
