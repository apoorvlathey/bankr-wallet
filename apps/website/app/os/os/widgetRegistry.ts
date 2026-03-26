import type { ComponentType } from "react";
import { GeckoChartWidget } from "./widgets/GeckoChartWidget";
import { GasTrackerWidget } from "./widgets/GasTrackerWidget";

/** Props every widget component receives — the universal contract */
export interface WidgetComponentProps {
  config: Record<string, unknown> | null;
  onSaveConfig: (config: Record<string, unknown>) => void;
}

/** Registry entry for a widget type */
export interface WidgetTypeDef {
  type: string;
  name: string;
  description: string;
  icon: string;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  component: ComponentType<WidgetComponentProps>;
}

/**
 * To add a new widget:
 * 1. Create a component in `widgets/` implementing WidgetComponentProps
 * 2. Add an entry here — no other files need changes
 */
export const WIDGET_TYPES: WidgetTypeDef[] = [
  {
    type: "gecko-chart",
    name: "GeckoTerminal Chart",
    description: "Live token price chart from GeckoTerminal",
    icon: "📈",
    defaultSize: { w: 480, h: 360 },
    minSize: { w: 320, h: 240 },
    component: GeckoChartWidget,
  },
  {
    type: "eth-gas-tracker",
    name: "ETH Gas Tracker",
    description: "Live Ethereum gas prices (Low / Standard / Fast)",
    icon: "⛽",
    defaultSize: { w: 320, h: 200 },
    minSize: { w: 280, h: 170 },
    component: GasTrackerWidget,
  },
];

export function getWidgetType(type: string): WidgetTypeDef | undefined {
  return WIDGET_TYPES.find((w) => w.type === type);
}
