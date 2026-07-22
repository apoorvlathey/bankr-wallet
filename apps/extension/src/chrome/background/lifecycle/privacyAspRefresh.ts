import { PRIVACY_ASP_REFRESH_ALARM } from "../../privacy/asp/alarmSchedule";

export type PrivacyAspRefreshLifecycleDependencies = {
  alarmEvent: {
    addListener: (listener: (alarm: { name: string }) => void) => void;
  };
  runScheduledRefresh: () => Promise<unknown>;
  warn: (message: string, error: unknown) => void;
};

/** Register the closed-popup compliance refresh wake-up. */
export function registerPrivacyAspRefreshLifecycle(
  dependencies: PrivacyAspRefreshLifecycleDependencies,
): void {
  dependencies.alarmEvent.addListener((alarm) => {
    if (alarm.name !== PRIVACY_ASP_REFRESH_ALARM) return;
    void dependencies.runScheduledRefresh().catch((error) =>
      dependencies.warn("[privacy-shield] scheduled ASP refresh failed", error)
    );
  });
}
