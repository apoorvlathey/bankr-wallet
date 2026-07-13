/** MV3 background composition bootstrap. */

import { registerBackgroundLifecycle } from "./composition/lifecycle";
import { composeBackgroundRoutes } from "./composition/routes";
import { createBackgroundMessagePipeline } from "./messagePipeline";

export function bootstrapBackground(): void {
  const routes = composeBackgroundRoutes();
  const onMessage = createBackgroundMessagePipeline(routes);
  registerBackgroundLifecycle(onMessage);
}
