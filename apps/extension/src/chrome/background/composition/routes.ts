/** Aggregate every route family around one shared provider/request context. */

import { composeAccountRoutes } from "./accountRoutes";
import { composeAdvancedRoutes } from "./advancedRoutes";
import { composeDataRoutes } from "./dataRoutes";
import { composeExecutionRoutes } from "./executionRoutes";
import { composeIdentityRoutes } from "./identityRoutes";
import { createPendingResolutionComposition } from "./pendingResolution";
import { createProviderContextComposition } from "./providerContext";
import { composeProviderRoutes } from "./providerRoutes";

export function composeBackgroundRoutes() {
  const pending = createPendingResolutionComposition();
  const provider = createProviderContextComposition();

  return {
    ...composeIdentityRoutes(),
    ...composeAccountRoutes(pending),
    ...composeProviderRoutes(pending, provider),
    ...composeExecutionRoutes(pending),
    ...composeAdvancedRoutes(pending),
    ...composeDataRoutes(pending),
    rejectExternalProviderRequest: provider.rejectExternalProviderRequest,
    rejectExternalProviderRequestDuringErc7715Lock:
      provider.rejectExternalProviderRequestDuringErc7715Lock,
  };
}

export type BackgroundRouteComposition = ReturnType<
  typeof composeBackgroundRoutes
>;
