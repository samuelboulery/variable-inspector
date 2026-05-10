/// <reference types="@figma/plugin-typings" />

import { VariableUsage } from './types';
import { getLayerDisplayName } from './utils/displayName';

type InstanceWithCompPropBindings = InstanceNode & {
  boundVariables?: {
    componentProperties?: Record<string, { id: string }>;
  };
};

/**
 * Reports bound componentProperties on an InstanceNode (variant, boolean,
 * text, instanceSwap properties bound to variables). Property names are
 * prefixed with "Component / " so users can distinguish from native props.
 */
export function scanComponentProperties(node: InstanceNode, usages: VariableUsage[]): void {
  if ((node as SceneNode).type !== 'INSTANCE') return;
  const bound = (node as InstanceWithCompPropBindings).boundVariables?.componentProperties;
  if (!bound) return;
  for (const [propName, binding] of Object.entries(bound)) {
    if (binding?.id) {
      usages.push({
        layer: getLayerDisplayName(node),
        property: `Component / ${propName}`,
        id: binding.id,
      });
    }
  }
}
