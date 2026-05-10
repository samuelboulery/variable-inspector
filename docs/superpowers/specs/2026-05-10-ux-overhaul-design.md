# Variable Inspector — UX Overhaul Design

**Date** : 2026-05-10
**Statut** : Design approuvé, prêt pour planification d'implémentation
**Auteur** : Claude Code session via /brainstorming

## Context

L'audit UX du plugin Variable Inspector a révélé trois familles de problèmes :

1. **Conformité spec partielle** : 3 des 7 features définies dans `CLAUDE.md` sont incomplètes ou absentes — Feature 3 (chemin de variable au clic), Feature 4 (tri par calque/propriété), Feature 7 (gestion des doublons : numérotation effets + merge instances).
2. **Couverture des propriétés Figma incomplète** : `minWidth`/`maxWidth`/`minHeight`/`maxHeight`, `layoutGrids[].color`, `visible`, `textDecoration`, `textCase`, `componentProperties` (variants/booleans) ne sont pas scannés alors qu'ils sont bindables.
3. **UX de base manquante** : pas de recherche, pas de filtre, pas de statistiques, pas de swatch couleur, pas de bouton rescan, debounce absent sur `selectionchange`, icône de type de calque définie mais jamais rendue.

Ce document spécifie le design d'une refonte unique qui adresse les trois axes en 8 phases incrémentales (~27 h, 25-26 commits).

## Décisions de design

| Question | Décision |
|---|---|
| UX du chemin de variable au clic (Feature 3) | Pill expand inline avec breadcrumb |
| Placement du tri (Feature 4) | Toolbar en haut avec segmented control |
| Scope de la gestion des doublons (Feature 7) | Les 3 sous-règles (merge instances + divergent split + numérotation effets) |
| Évolutions UX retenues | Recherche, filtres (type/origine), statistiques globales, color swatch, bouton rescan + debounce |
| Couverture des propriétés | Tout ce qui est bindable, y compris `componentProperties` |
| Linter/formatter | Skip — TypeScript strict suffit |
| Migration UI `.js` → `.ts` | Partielle — extraire seulement les utils purs (`src/ui/utils.ts`), DOM rendering reste en JS |

## Architecture

```
src/
├── code.ts                    # plugin-thread orchestrateur (étendu : stats, debounce, rescan handler)
├── nodeScanner.ts             # bound vars (étendu : new bindables, effect numbering)
├── unboundDetector.ts         # hardcoded (étendu : new bindables)
├── effectDetector.ts          # +numérotation "Drop Shadow N" par node
├── variableLoader.ts          # appelle variablePathResolver pour enrichir VariableDefinition
├── variablePathResolver.ts    # NOUVEAU. Résout collection→library→group→name, suit alias chains
├── instanceFingerprint.ts     # NOUVEAU. Hash stable pour merge d'instances identiques
├── propertyScanner.ts         # NOUVEAU. minWidth, maxWidth, layoutGrids, visible, textDecoration, textCase
├── componentProps.ts          # NOUVEAU. Bindings componentProperties (variants/booleans/instanceSwap)
├── dedup.ts                   # +compteur d'effets par node
├── types.ts                   # +VariablePath, InstanceGroup, FilterState, SortMode, ScanStats
├── constants.ts               # +nouvelles constantes de noms de propriétés
└── ui/
    ├── utils.ts               # NOUVEAU. filterUsages, regroupByProperty, computeStats — testable
    ├── toolbar.js             # toolbar (search + sort + filter + rescan) — DOM
    ├── pill.js                # pill avec expand-on-click + swatch — DOM
    ├── layerSection.js        # section calque + badge ×N — DOM
    ├── unboundSection.js      # unbound display riche — DOM
    ├── stats.js               # dashboard stats — DOM
    └── render.js              # orchestrateur de rendu — DOM
```

## Message bus étendu

```typescript
// Plugin → UI
interface RenderMessage {
  type: 'render';
  byLayer: Record<string, FullUsageEntry[]>;
  unbound: UnboundUsage[];
  layerInfoMap: Record<string, LayerInfo>;
  noVariablesFound: boolean;
  stats: ScanStats;                            // NOUVEAU
  scanDurationMs: number;                      // NOUVEAU
}

interface ScanStartMessage {                   // NOUVEAU
  type: 'scan-start';
  estimatedNodeCount?: number;
}

// UI → Plugin
interface RescanMessage {                      // NOUVEAU
  type: 'rescan';
}

interface OpenVariableMessage {                // NOUVEAU
  type: 'open-variable';
  variableId: string;
}
```

## Feature 3 — Chemin de variable au clic

**UX** : pill expand inline. Cliquer une pill l'expand sous elle-même en breadcrumb. Re-clic referme. Un seul chemin ouvert à la fois (auto-fermeture des autres). Animation slide-down 150 ms. État non persisté.

**Affichage local** :
```
▣ color/primary
└─ Tokens / Color / Brand / primary
   📋 Copier      ↗ Voir dans Figma
```

**Affichage external** :
```
▣ color/primary
└─ Design System Library / Color / Brand / primary
   📋 Copier      ↗ Voir dans Figma   🔗 External
```

**Type** :
```typescript
interface VariablePath {
  collection: string;
  library?: string;          // external uniquement
  groups: string[];
  name: string;
  isAlias: boolean;
  aliasChain?: string[];     // debug
}
```

**Implémentation** :
- `variablePathResolver.ts` parse `variable.name` (séparateur `/`) pour les groupes.
- Pour external : `variable.remote` + recherche du nom de bibliothèque via `figma.libraries` (avec feature detection).
- Pour alias : suit la chaîne (depth cap 10), retourne le path du leaf, marque `isAlias: true`.
- Path résolu côté plugin pendant le scan, pas on-demand au clic.

## Feature 4 — Tri par calque / par propriété

**Toolbar** :
```
┌────────────────────────────────────────────────┐
│ 🔍 Rechercher...                          ⟳    │
│ Tri  [●Calque] [Propriété]                     │
│ Type: [Tous] [Color] [Float] [String] [Bool]   │
│ Origine: [Tous] [Local] [External] [Hardcoded] │
└────────────────────────────────────────────────┘
```

**Mode "Par calque"** (défaut) : comportement actuel (groupé par layerId).

**Mode "Par propriété"** : groupé par `property` ; chaque ligne `Layer → ▣ variable name` reste cliquable pour focus.

**Type** :
```typescript
type SortMode = 'byLayer' | 'byProperty';
```

État persisté dans `localStorage` (clé `vi.sortMode`). Switch = re-render complet, pas de transition.

## Feature 7 — Gestion des doublons (3 sous-règles)

### 7.1 — Merge instances identiques

**Fingerprint** :
```typescript
interface InstanceFingerprint {
  componentId: string;
  componentSetId?: string;
  props: string;             // JSON sorted des componentProperties
  variabilization: string;   // JSON sorted: { property: variableId } pour chaque binding
}
```

Hash : concatenation déterministe (string), pas de SHA (overhead inutile pour ≤ 1000 instances).

**Regroupement** : pendant `runInspector`, les `InstanceNode` sont indexés par fingerprint dans `Map<fingerprint, InstanceNode[]>`. Pour chaque groupe avec `length > 1`, on ne scanne que le premier nœud, on propage les usages avec `count = N`, on garde la liste des `nodeIds` pour le focus séquentiel.

**LayerInfo étendu** :
```typescript
interface LayerInfo {
  // existant
  count?: number;             // >= 2 si mergé
  mergedNodeIds?: string[];
}
```

**UI** : badge `× N` dans le header de section. Click sur le badge cycle entre les nodes (premier clic = node 1, second = node 2, etc.).

### 7.2 — Instances divergentes

Déjà OK — fingerprints différents → groupes séparés. Test à ajouter : 2 boutons même `componentId`, l'un avec override `color`, l'autre non → 2 sections.

### 7.3 — Numérotation effets répétés

Si un node a 3 Drop Shadows : labels deviennent `Drop Shadow 1 Blur`, `Drop Shadow 1 Color`, `Drop Shadow 2 Blur`, etc. Compteurs par type d'effet (Drop Shadow et Inner Shadow comptent séparément). Si un seul effet de ce type → pas de numérotation (`Drop Shadow Blur`, pas `Drop Shadow 1 Blur`).

Implémentation dans `effectDetector.ts` (unbound) et `nodeScanner.ts` `getEffectUsages` (bound).

## Couverture des propriétés Figma — gap fix

| Propriété | Bindable | Module |
|---|---|---|
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | ✅ | `propertyScanner.ts` (bound) + `unboundDetector.ts` (hardcoded) |
| `layoutGrids[].color` | ✅ | `propertyScanner.ts` (nouveau) |
| `visible` | ✅ (boolean) | `propertyScanner.ts` |
| `componentProperties[*]` | ✅ (variants/booleans/text/instanceSwap) | `componentProps.ts` (nouveau) |
| `textDecoration` | ✅ (string) | `propertyScanner.ts` |
| `textCase` | ✅ (string) | `propertyScanner.ts` |
| `strokeAlign` | ❌ enum non-bindable | skip |

**Note Figma API** : `boundVariables.componentProperties` est récent — guard avec feature detection (`typeof X === 'function'`).

**Constantes** ajoutées : `MIN_WIDTH`, `MAX_WIDTH`, `MIN_HEIGHT`, `MAX_HEIGHT`, `GRID_COLOR`, `VISIBLE`, `TEXT_DECORATION`, `TEXT_CASE`.

## Évolutions UX

### Recherche + filtres
- Recherche : case-insensitive sur `layer`, `property`, `name`. Debounce 150 ms.
- Filtre Type : multi-select chips (Color/Float/String/Bool), AND avec recherche.
- Filtre Origine : `Local` / `External` / `Hardcoded` (Hardcoded filtre les unbound).
- État `localStorage` (`vi.filter.type`, `vi.filter.origin`, `vi.search`).
- Filtrage 100 % côté UI — pas de re-scan.

### Statistiques globales
```
42 variables  •  8 hardcoded (16 %)
32 local • 10 external
Couverture : ████████████████░░░ 84 %
```

```typescript
interface ScanStats {
  totalVariables: number;
  totalHardcoded: number;
  variableCoverage: number;    // 0..1
  byOrigin: { local: number; external: number };
  byType: { COLOR: number; FLOAT: number; STRING: number; BOOLEAN: number };
  layerCount: number;
  scanDurationMs: number;
}
```

Calculé dans `code.ts` après `runInspector`.

### Color swatch sur les pills
Carré 12×12, border-radius 2 px, border `#0001`. Couleur via `formatRGBA(item.colorValue)`. Absent si non-COLOR ou alias non résolu. Checkerboard background pour transparence.

### Rescan + debounce
- Bouton `⟳` dans la toolbar → envoie `{ type: 'rescan' }` au plugin.
- Icône en rotation pendant le scan.
- Debounce 300 ms sur `figma.on('selectionchange')` (`setTimeout` + `clearTimeout`).
- Pour grosses sélections (> 500 nœuds), `scan-start` message + spinner UI pendant le scan.

## Stratégie de tests

### Cible
≥ 80 % lignes globales (95 % actuel à maintenir).

### Nouveaux fichiers de test (~41 tests)

| Fichier | Tests |
|---|---|
| `__tests__/variablePathResolver.test.ts` | 10 (local, external + library, alias, depth cap, name parsing) |
| `__tests__/instanceFingerprint.test.ts` | 8 (merge, divergent, COMPONENT_SET, variant override, hash stability) |
| `__tests__/effectDetector.test.ts` (étendu) | +6 (numbering 1/2/3, mix DROP+INNER, single non-numéroté) |
| `__tests__/propertyScanner.test.ts` | 12 (min/maxW/H, layoutGrids, visible, textDecoration, textCase) |
| `__tests__/componentProps.test.ts` | 5 (variant, boolean, instanceSwap, feature detection) |
| `__tests__/ui/utils.test.ts` | filterUsages, regroupByProperty, computeStats |

**Total** : 99 actuels + ~41 = **~140 tests**.

### Mock à étendre

`__mocks__/figma.ts` :
- `makeInstanceNode({ componentId, componentSetId, componentProperties, componentPropertyReferences, boundVariables, children })`
- `makeAutoLayoutFrame({ minWidth, maxWidth, layoutGrids, visible, ... })`

### Tests UI

Logique pure extraite dans `src/ui/utils.ts` (TS), testable. DOM rendering reste en JS, non testé (couvert par QA manuel).

### CI gate (déjà présent via `/commit`)
typecheck + test + test:cov + build doivent tous passer avant chaque commit.

### QA manuel Figma (post-implémentation, obligatoire)

```
[ ] Pill expand affiche le bon path (variable locale)
[ ] Pill expand affiche library name (variable external)
[ ] Pill expand affiche chaîne d'alias jusqu'au leaf
[ ] Toggle "Par calque" / "Par propriété" change la vue
[ ] Recherche filtre en temps réel
[ ] Filtres Type + Origine combinés
[ ] Stats correctes (compter manuellement sur 5 nœuds)
[ ] Color swatch correspond à la couleur Figma
[ ] Bouton rescan re-scan quand selection inchangée
[ ] Debounce 300 ms évite flicker pendant drag
[ ] 3 Drop Shadows → numérotés 1, 2, 3
[ ] 4 instances Button identiques → 1 section avec × 4
[ ] 2 instances Button divergentes → 2 sections séparées
[ ] Click × 4 cycle entre les 4 nodes
[ ] minWidth/maxWidth bindings détectés
[ ] Variant binding (Button/State) détecté
```

## Roadmap d'exécution

| Phase | Scope | Risque | Durée | Commits |
|---|---|---|---|---|
| **A** | Bug fixes silencieux : icône calque morte, debounce 300 ms, créer `src/ui/` | LOW | 1 h | 2 |
| **B** | Property coverage gap : min/maxW/H, layoutGrids, visible, textDecoration, textCase, componentProps | LOW | 4 h | 6 |
| **C** | Feature 7.3 — numérotation effets répétés | LOW | 2 h | 2 |
| **D** | Feature 7.1 — fingerprint instances + merge + badge UI | MEDIUM | 5 h | 4 |
| **E** | Feature 3 — `variablePathResolver` + path dans `RenderMessage` + UI expand | MEDIUM | 4 h | 3 |
| **F** | Feature 4 — toolbar tri (toggle byLayer/byProperty) + `regroupByProperty` util | LOW | 3 h | 2 |
| **G** | Évolutions UX — recherche, filtre, stats, swatch, rescan | MEDIUM | 6 h | 5 |
| **H** | QA manuel Figma + bug fixes éventuels | — | 2 h | 1-2 |

**Total** : ~27 h, 25-26 commits.

**Ordre** :
```
A (warm-up) → B (data layer) → C (effect num) → D (instance merge)
                                       │
                                       ▼
              E (path resolver) ← message bus extended
                       │
                       ▼
              F (sort toggle) → G (toolbar evolutions) → H (manual QA)
```

A et B parallélisables. C–D–E–F–G séquentiels (chaque phase étend `RenderMessage`).

## Conventions de commit

```
feat(scanner): scan minWidth/maxWidth bindings
feat(scanner): scan layoutGrids color bindings
feat(scanner): scan textDecoration/textCase bindings
feat(scanner): scan componentProperties variant/boolean bindings
test(scanner): cover new property bindings (12 tests)
feat(detector): number repeated effects per node (Drop Shadow 1, 2, 3)
test(detector): cover effect numbering edge cases
feat(core): introduce instanceFingerprint module
feat(core): merge identical instances with count badge
feat(ui): render × N badge with cycling focus
test(core): cover instanceFingerprint dedup logic
feat(loader): variablePathResolver — collection/library/group/name
feat(core): include VariablePath in RenderMessage payload
feat(ui): expand variable pill on click with path breadcrumb
feat(ui): sort toolbar (byLayer / byProperty toggle)
refactor(ui): extract regroupByProperty + computeStats utils
feat(ui): add search bar + type/origin filter chips
feat(ui): add stats dashboard header
feat(ui): add color swatch to COLOR pills
feat(ui): rescan button + debounce 300 ms on selectionchange
feat(core): scan-start message + UI loading state
test(ui): cover filterUsages + regroupByProperty + computeStats
docs: update CLAUDE.md spec — Features 3, 4, 7 implemented
build: rebuild dist after UX overhaul
```

## Validation finale

```
✓ npm run typecheck                              → 0 erreur
✓ npm run test                                    → 140+ verts
✓ npm run test:cov                                → ≥ 80 %
✓ npm run build                                   → exit 0
✓ Manual Figma QA checklist                       → tous les items cochés
✓ CLAUDE.md updated avec features impl.           → section "Statut" pour chaque feature
✓ Bundle size < 200 KB raw, < 50 KB gz            → vérifier avec npm run build
```

## Constats à NE PAS adresser dans ce design

| Constat | Raison |
|---|---|
| Migration UI complète `.js` → `.ts` (ex-Phase 6) | Différée — utils purs extraits suffisent. UI DOM rendering testé manuellement. |
| Refonte CSS / design system du plugin | Hors scope — l'audit a montré que la CSS actuelle est fonctionnelle. À traiter dans un design séparé si demandé. |
| Internationalisation (FR/EN/...) | Hors scope — le plugin est mono-langue, les utilisateurs design sont à l'aise avec EN. |
| Persistance des résultats de scan entre sessions | Hors scope — re-scan à chaque ouverture est rapide (< 300 ms typique). |
| 7 vulnérabilités npm audit moderate | À traiter séparément avec `npm audit fix`. Hors scope UX. |
