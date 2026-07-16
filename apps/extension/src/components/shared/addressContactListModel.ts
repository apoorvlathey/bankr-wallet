function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Reorders only the contacts visible in a picker while keeping excluded
 * contacts in their original slots. The background repository still receives
 * the exact full permutation it requires.
 */
export function mergeReorderedContactSubset(
  allAddresses: string[],
  previousVisibleAddresses: string[],
  reorderedVisibleAddresses: string[],
): string[] {
  if (previousVisibleAddresses.length !== reorderedVisibleAddresses.length) {
    return allAddresses;
  }

  const previousVisible = new Set(previousVisibleAddresses.map(normalizeAddress));
  const reorderedVisible = reorderedVisibleAddresses.map(normalizeAddress);
  const reorderedVisibleSet = new Set(reorderedVisible);
  if (
    previousVisible.size !== previousVisibleAddresses.length
    || reorderedVisibleSet.size !== reorderedVisibleAddresses.length
    || reorderedVisible.some((address) => !previousVisible.has(address))
  ) {
    return allAddresses;
  }

  const allAddressSet = new Set(allAddresses.map(normalizeAddress));
  if ([...previousVisible].some((address) => !allAddressSet.has(address))) {
    return allAddresses;
  }

  let reorderedIndex = 0;
  return allAddresses.map((address) => {
    if (!previousVisible.has(normalizeAddress(address))) return address;
    const replacement = reorderedVisibleAddresses[reorderedIndex];
    reorderedIndex += 1;
    return replacement;
  });
}
