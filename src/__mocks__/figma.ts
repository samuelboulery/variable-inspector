/// <reference types="@figma/plugin-typings" />

/**
 * Minimal stub of the Figma PluginAPI global, used by all unit tests.
 * Assigned to `globalThis.figma` via the Vitest setupFiles mechanism.
 *
 * Tests that need to control return values should reassign individual
 * methods (e.g. `figmaMock.getNodeById = () => myNode`).
 */
const figmaMock = {
  variables: {
    getLocalVariableCollections: (): VariableCollection[] => [],
    getLocalVariableCollectionsAsync: async (): Promise<VariableCollection[]> => [],
    getVariableByIdAsync: async (_id: string): Promise<Variable | null> => null,
    importVariableByKeyAsync: async (_key: string): Promise<Variable | null> => null,
  },
  currentPage: {
    selection: [] as SceneNode[],
  },
  getNodeById: (_id: string): BaseNode | null => null,
  getNodeByIdAsync: async (_id: string): Promise<BaseNode | null> => null,
  ui: {
    postMessage: (_msg: unknown): void => { /* stub */ },
    resize: (_w: number, _h: number): void => { /* stub */ },
    onmessage: null as unknown,
  },
  viewport: {
    scrollAndZoomIntoView: (_nodes: readonly BaseNode[]): void => { /* stub */ },
  },
  on: (_event: string, _cb: () => void): void => { /* stub */ },
  showUI: (_html: string, _opts?: ShowUIOptions): void => { /* stub */ },
};

// Expose as the `figma` global expected by plugin-thread code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).figma = figmaMock;

export { figmaMock };
export type FigmaMock = typeof figmaMock;

// ---------------------------------------------------------------------------
// Node factory helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal rectangle-shaped SceneNode stub for use in tests.
 * Override any property via the `overrides` argument.
 */
export function makeRectNode(overrides: {
  id?: string;
  name?: string;
  fills?: object[];
  strokes?: object[];
  effects?: object[];
  opacity?: number;
  cornerRadius?: number;
  strokeWeight?: number;
  boundVariables?: Record<string, unknown>;
  children?: SceneNode[];
} = {}): SceneNode {
  return {
    id: overrides.id ?? 'node-rect-1',
    name: overrides.name ?? 'Rectangle',
    type: 'RECTANGLE',
    fills: overrides.fills ?? [],
    strokes: overrides.strokes ?? [],
    effects: overrides.effects ?? [],
    opacity: overrides.opacity ?? 1,
    cornerRadius: overrides.cornerRadius ?? 0,
    strokeWeight: overrides.strokeWeight ?? 1,
    boundVariables: overrides.boundVariables ?? {},
  } as unknown as SceneNode;
}

/**
 * Creates a minimal frame-shaped SceneNode stub, optionally with children.
 */
export function makeFrameNode(overrides: {
  id?: string;
  name?: string;
  children?: SceneNode[];
  fills?: object[];
  boundVariables?: Record<string, unknown>;
} = {}): SceneNode {
  return {
    id: overrides.id ?? 'node-frame-1',
    name: overrides.name ?? 'Frame',
    type: 'FRAME',
    children: overrides.children ?? [],
    fills: overrides.fills ?? [],
    boundVariables: overrides.boundVariables ?? {},
  } as unknown as SceneNode;
}

/**
 * Creates a minimal TEXT SceneNode stub.
 */
export function makeTextNode(overrides: {
  id?: string;
  name?: string;
  boundVariables?: Record<string, unknown>;
  fontSize?: number;
  letterSpacing?: number;
  lineHeight?: number;
  paragraphSpacing?: number;
} = {}): SceneNode {
  return {
    id: overrides.id ?? 'node-text-1',
    name: overrides.name ?? 'Label',
    type: 'TEXT',
    fills: [],
    strokes: [],
    effects: [],
    opacity: 1,
    fontSize: overrides.fontSize ?? 16,
    letterSpacing: overrides.letterSpacing ?? 0,
    lineHeight: overrides.lineHeight ?? 0,
    paragraphSpacing: overrides.paragraphSpacing ?? 0,
    boundVariables: overrides.boundVariables ?? {},
  } as unknown as SceneNode;
}

/**
 * Creates a minimal Variable stub for use in variableLoader tests.
 */
export function makeVariable(overrides: {
  id?: string;
  name?: string;
  key?: string;
  resolvedType?: VariableResolvedDataType;
  valuesByMode?: Record<string, VariableValue>;
  variableCollectionId?: string;
}): Variable {
  return {
    id: overrides.id ?? 'var-1',
    name: overrides.name ?? 'color/primary',
    key: overrides.key ?? 'key-1',
    resolvedType: overrides.resolvedType ?? 'COLOR',
    valuesByMode: overrides.valuesByMode ?? {},
    variableCollectionId: overrides.variableCollectionId ?? 'col-1',
    description: '',
    hiddenFromPublishing: false,
    scopes: [],
  } as unknown as Variable;
}

/**
 * Builds a 2-link variable alias chain: variable A's first mode points to
 * variable B via VariableAlias, and B's first mode holds the concrete value.
 *
 * Returns the chain plus a hydrated `getVariableByIdAsync` resolver that the
 * test can plug into `figmaMock.variables.getVariableByIdAsync` to walk the
 * chain.
 */
export function makeAliasChain(options: {
  rootId?: string;
  leafId?: string;
  leafValue?: VariableValue;
  modeId?: string;
  resolvedType?: VariableResolvedDataType;
}): {
  root: Variable;
  leaf: Variable;
  resolve: (id: string) => Promise<Variable | null>;
} {
  const rootId = options.rootId ?? 'var-root';
  const leafId = options.leafId ?? 'var-leaf';
  const modeId = options.modeId ?? 'mode-1';
  const resolvedType = options.resolvedType ?? 'COLOR';
  const leafValue = options.leafValue ?? { r: 1, g: 0, b: 0 };

  const root = makeVariable({
    id: rootId,
    name: 'alias/root',
    resolvedType,
    valuesByMode: {
      [modeId]: { type: 'VARIABLE_ALIAS', id: leafId } as unknown as VariableValue,
    },
  });
  const leaf = makeVariable({
    id: leafId,
    name: 'alias/leaf',
    resolvedType,
    valuesByMode: { [modeId]: leafValue },
  });

  const resolve = async (id: string): Promise<Variable | null> => {
    if (id === rootId) return root;
    if (id === leafId) return leaf;
    return null;
  };

  return { root, leaf, resolve };
}
