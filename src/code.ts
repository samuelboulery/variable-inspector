/// <reference types="@figma/plugin-typings" />
import uiHtml from './ui.html?raw';
import css from './style.css?raw';

// Types et interfaces
interface VariableDefinition {
  name: string;
  type: VariableResolvedDataType;
  origin: 'local' | 'external';
  colorValue?: RGB | RGBA;
}

interface VariableUsage {
  layer: string;
  property: string;
  id: string;
}

interface UnboundUsage {
  layer: string;
  layerId: string;
  property: string;
  value: string;
}

interface LayerUsage {
  property: string;
  name: string;
  type: VariableResolvedDataType;
  origin: 'local' | 'external';
  colorValue?: RGB | RGBA;
}

interface LayerInfo {
  id: string;
  name: string;
  order: number;
  parent?: string; // ID du parent
  type: string; // Ajout du type de calque
}

// Constantes
const PROPERTY_NAMES = {
  FILL: 'Fill',
  STROKE: 'Stroke',
  STROKE_COLOR: 'Stroke Color',
  OPACITY: 'Opacity',
  STROKE_WEIGHT: 'Stroke Weight',
  CORNER_RADIUS: 'Corner Radius',
  FONT_SIZE: 'Font Size',
  FONT_WEIGHT: 'Font Weight',
  FONT_FAMILY: 'Font Family',
  LETTER_SPACING: 'Letter Spacing',
  LINE_HEIGHT: 'Line Height',
  PARAGRAPH_SPACING: 'Paragraph Spacing',
  PADDING_LEFT: 'Padding Left',
  PADDING_RIGHT: 'Padding Right',
  PADDING_TOP: 'Padding Top',
  PADDING_BOTTOM: 'Padding Bottom',
  ITEM_SPACING: 'Gap'
} as const;

// Version non constante pour les propriétés dynamiques
const PROPERTY_NAME_VALUES = {
  FILL: 'Fill',
  STROKE: 'Stroke',
  STROKE_COLOR: 'Stroke Color',
  OPACITY: 'Opacity',
  STROKE_WEIGHT: 'Stroke Weight',
  CORNER_RADIUS: 'Corner Radius',
  FONT_SIZE: 'Font Size',
  FONT_WEIGHT: 'Font Weight',
  FONT_FAMILY: 'Font Family',
  LETTER_SPACING: 'Letter Spacing',
  LINE_HEIGHT: 'Line Height',
  PARAGRAPH_SPACING: 'Paragraph Spacing',
  PADDING_LEFT: 'Padding Left',
  PADDING_RIGHT: 'Padding Right',
  PADDING_TOP: 'Padding Top',
  PADDING_BOTTOM: 'Padding Bottom',
  ITEM_SPACING: 'Gap'
};

// Mapping des noms de propriétés
const PROPERTY_MAPPING: Record<string, string> = {
  itemSpacing: 'Gap',
  paddingTop: 'Padding Top',
  paddingRight: 'Padding Right',
  paddingBottom: 'Padding Bottom',
  paddingLeft: 'Padding Left',
  cornerRadius: 'Corner Radius',
  strokeWeight: 'Stroke Weight',
  opacity: 'Opacity',
  fontSize: 'Font Size',
  fontWeight: 'Font Weight',
  fontName: 'Font Family',
  letterSpacing: 'Letter Spacing',
  lineHeight: 'Line Height',
  paragraphSpacing: 'Paragraph Spacing',
  paragraphIndent: 'Paragraph Indent',
  textCase: 'Text Case',
  textDecoration: 'Text Decoration',
  textAlignHorizontal: 'Text Align Horizontal',
  textAlignVertical: 'Text Align Vertical',
  topLeftRadius: 'Top Left Radius',
  topRightRadius: 'Top Right Radius',
  bottomLeftRadius: 'Bottom Left Radius',
  bottomRightRadius: 'Bottom Right Radius',
  strokeTopWeight: 'Stroke Top Weight',
  strokeBottomWeight: 'Stroke Bottom Weight',
  strokeLeftWeight: 'Stroke Left Weight',
  strokeRightWeight: 'Stroke Right Weight',
  width: 'Width',
  height: 'Height',
  // Ajoutez d'autres mappings selon vos besoins
} as const;

// Set pour garder une trace des IDs de nœuds dont la taille de police a été traitée
const processedFontSizeNodeIds = new Set<string>();

// Pour la déduplication des propriétés affichées
interface PropertyIdentifier {
  nodeId: string;
  propertyName: string;
  variableId?: string; // Pour différencier les différentes variables liées à la même propriété
}

// Set pour éviter les doublons dans l'affichage des propriétés
const processedProperties = new Set<string>();

// Génère un identifiant unique pour une propriété
function getPropertyId(nodeId: string, propertyName: string, variableId?: string): string {
  return variableId
    ? `${nodeId}|${propertyName}|${variableId}`
    : `${nodeId}|${propertyName}`;
}

// Réinitialise tous les Sets de déduplication
function resetDedupSets(): void {
  processedFontSizeNodeIds.clear();
  processedProperties.clear();
}

// Vérifie si la propriété a déjà été traitée et l'ajoute au Set
function trackProperty(nodeId: string, propertyName: string, variableId?: string): boolean {
  const propertyId = getPropertyId(nodeId, propertyName, variableId);

  // Logs de débogage améliorés
  console.log(`Checking property: ${propertyId}, propertyName: ${propertyName}, exists: ${processedProperties.has(propertyId)}`);

  // Ne pas dédupliquer les propriétés de padding et spacing
  const spacingProperties = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing', 'gap'];
  if (spacingProperties.some(prop => propertyName.includes(prop))) {
    console.log(`Skipping deduplication for spacing property: ${propertyName}`);
    processedProperties.add(propertyId); // On l'ajoute mais on retourne false pour qu'il soit traité
    return false;
  }

  // Déduplication normale pour les autres propriétés
  if (processedProperties.has(propertyId)) {
    return true; // Déjà traité
  }
  processedProperties.add(propertyId);
  return false; // Pas encore traité
}

// Charge toutes les collections de variables (locales + externes)
async function loadVariables(): Promise<Map<string, VariableDefinition>> {
  const variableMap = new Map<string, VariableDefinition>();

  // Récupère les collections locales
  const collections = figma.variables.getLocalVariableCollections();

  // D'abord, on charge toutes les variables locales
  for (const col of collections) {
    for (const id of col.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(id);
      if (!variable) continue;

      let colorValue: RGB | RGBA | undefined = undefined;
      if (variable.resolvedType === 'COLOR') {
        // Prend la valeur du premier mode trouvé
        const modeIds = Object.keys(variable.valuesByMode);
        if (modeIds.length > 0) {
          const firstModeValue = variable.valuesByMode[modeIds[0]];
          if (typeof firstModeValue === 'object' && ('r' in firstModeValue || 'g' in firstModeValue || 'b' in firstModeValue)) {
            colorValue = firstModeValue as RGB | RGBA;
          }
        }
      }

      variableMap.set(id, {
        name: variable.name,
        type: variable.resolvedType,
        origin: 'local',
        colorValue: colorValue
      });
    }
  }

  // Ensuite, on récupère les IDs manquants de la sélection actuelle
  const selection = figma.currentPage.selection;
  const allNodes = collectAllNodes(selection);
  const missingIds = new Set<string>();

  for (const node of allNodes) {
    const usages = inspectNode(node);
    for (const { id } of usages) {
      if (!variableMap.has(id)) {
        missingIds.add(id);
      }
    }
  }

  // Pour chaque ID manquant, on récupère d'abord la variable liée au nœud
  for (const id of missingIds) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(id);
      if (!variable) continue;

      // --- Fallback : on stocke toujours le nom original, même sans import publié ---
      let colorValue: RGB | RGBA | undefined = undefined;
      if (variable.resolvedType === 'COLOR') {
        const modeIds = Object.keys(variable.valuesByMode);
        if (modeIds.length > 0) {
          const firstModeValue = variable.valuesByMode[modeIds[0]];
          if (typeof firstModeValue === 'object' && ('r' in firstModeValue || 'g' in firstModeValue || 'b' in firstModeValue)) {
            colorValue = firstModeValue as RGB | RGBA;
          }
        }
      }
      variableMap.set(id, {
        name: variable.name,            // on conserve le nom de la variable
        type: variable.resolvedType,
        origin: 'external',
        colorValue: colorValue
      });

      // Si la fonction d'import est disponible, on peut écraser les infos avec la version publiée
      if (typeof figma.variables.importVariableByKeyAsync === 'function') {
        const imported = await figma.variables.importVariableByKeyAsync(variable.key);
        if (imported) {
          // On conserve la même logique pour la couleur
          let importedColor: RGB | RGBA | undefined = undefined;
          if (imported.resolvedType === 'COLOR') {
            const modeIds2 = Object.keys(imported.valuesByMode);
            if (modeIds2.length > 0) {
              const val = imported.valuesByMode[modeIds2[0]];
              if (typeof val === 'object' && ('r' in val || 'g' in val || 'b' in val)) {
                importedColor = val as RGB | RGBA;
              }
            }
          }
          variableMap.set(id, {
            name: imported.name,        // version publiée
            type: imported.resolvedType,
            origin: 'external',
            colorValue: importedColor
          });
        }
      }
    } catch (error) {
      console.warn(`Impossible de récupérer la variable ${id}:`, error);
    }
  }

  console.log('loadVariables: found', variableMap.size, 'variables');
  return variableMap;
}

// Fonctions utilitaires pour l'inspection des nœuds
function getColorUsages(node: SceneNode, usages: VariableUsage[]): void {
  const colourPaints: Paint[] = [];
  if ("fills" in node && Array.isArray(node.fills)) {
    colourPaints.push(...(node.fills as Paint[]));
  }
  if ("backgrounds" in node && Array.isArray((node as any).backgrounds)) {
    colourPaints.push(...((node as any).backgrounds as Paint[]));
  }

  const seenColorIds = new Set<string>();

  // On ne veut afficher qu'un seul remplissage par nœud
  // On combine donc tous les IDs de variables liées en un seul remplissage
  const fillVariableIds = new Set<string>();

  for (const paint of colourPaints) {
    const p = paint as any;
    const binding = p.boundVariables && p.boundVariables.color;
    if (binding && binding.id && !seenColorIds.has(binding.id)) {
      fillVariableIds.add(binding.id);
      seenColorIds.add(binding.id);
    }
  }

  // Maintenant on ajoute un seul usage pour tous les remplissages
  if (fillVariableIds.size > 0) {
    // On prend le premier ID pour l'afficher
    const firstId = Array.from(fillVariableIds)[0];
    usages.push({
      layer: node.name,
      property: PROPERTY_NAME_VALUES.FILL,
      id: firstId
    });

    // Si plusieurs remplissages ont des variables différentes, on les mentionne dans un commentaire de log
    if (fillVariableIds.size > 1) {
      console.log(`${node.name} a ${fillVariableIds.size} variables de remplissage, seule la première est affichée`);
    }
  }
}

function getStrokeUsages(node: SceneNode, usages: VariableUsage[]): void {
  if ("strokes" in node && Array.isArray(node.strokes)) {
    for (const stroke of node.strokes as Paint[]) {
      const paint = stroke as any;
      const binding = paint.boundVariables && paint.boundVariables.color;
      if (binding && binding.id) {
        // Désactivation temporaire de la déduplication pour déboguer
        // if (!trackProperty(node.id, PROPERTY_NAMES.STROKE_COLOR, binding.id)) {
        usages.push({ layer: node.name, property: PROPERTY_NAMES.STROKE_COLOR, id: binding.id });
        // }
      }
    }
  }
}

function getEffectUsages(node: SceneNode, usages: VariableUsage[]): void {
  if ("effects" in node && Array.isArray(node.effects)) {
    for (const effect of node.effects as any[]) {
      if (effect.boundVariables) {
        for (const [prop, bind] of Object.entries(effect.boundVariables)) {
          const b = bind as any;
          if (b.id) {
            // Include effect type in the display name
            const rawType = (effect.type as string) || '';
            const friendlyType = rawType
              .toLowerCase()
              .replace(/_/g, ' ')
              .replace(/\b\w/g, char => char.toUpperCase());
            const displayName = `${friendlyType} ${prop}`;
            usages.push({ layer: node.name, property: displayName, id: b.id });
          }
        }
      }
    }
  }
}

function getNodeBoundVariables(node: SceneNode, usages: VariableUsage[]): void {
  const nodeBV = (node as any).boundVariables;
  if (nodeBV) {
    // Ignorer les propriétés liées aux remplissages et à la couleur
    // car elles sont déjà traitées par getColorUsages
    const skipProps = new Set(['color', 'fills', 'fills.0']);

    for (const [prop, bind] of Object.entries(nodeBV)) {
      // Ignorer toutes les propriétés commençant par "fills."
      if (skipProps.has(prop) || prop.startsWith('fills.')) continue;

      const b = bind as any;
      if (b.id) {
        // Utilise le mapping si disponible, sinon garde le nom original
        const displayName = PROPERTY_MAPPING[prop] || prop;

        // Désactivation temporaire de la déduplication pour déboguer
        // if (!trackProperty(node.id, displayName, b.id)) {
        usages.push({ layer: node.name, property: displayName, id: b.id });
        // }
      }
    }
  }

  // Vérification spécifique des propriétés asymétriques
  const checkAsymmetricProps = [
    'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius',
    'strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight'
  ];

  for (const prop of checkAsymmetricProps) {
    if ((node as any)[prop] !== undefined && nodeBV && nodeBV[prop] && nodeBV[prop].id) {
      const displayName = PROPERTY_MAPPING[prop] || prop;

      // Désactivation temporaire de la déduplication pour déboguer
      // if (!trackProperty(node.id, displayName, nodeBV[prop].id)) {
      usages.push({ layer: node.name, property: displayName, id: nodeBV[prop].id });
      // }
    }
  }
}

function getTextNodeVariables(node: TextNode, usages: VariableUsage[]): void {
  const txtBV = (node as any).boundVariables;

  // Liste des propriétés de texte connues et leur mapping
  const fontProperties = {
    'fontSize': PROPERTY_NAMES.FONT_SIZE,
    'fontWeight': PROPERTY_NAMES.FONT_WEIGHT,
    'fontFamily': PROPERTY_NAMES.FONT_FAMILY,
    'letterSpacing': PROPERTY_NAMES.LETTER_SPACING,
    'lineHeight': PROPERTY_NAMES.LINE_HEIGHT,
    'paragraphSpacing': PROPERTY_NAMES.PARAGRAPH_SPACING
  };

  // Plusieurs façons dont les propriétés de police peuvent être liées
  if (txtBV) {
    // 1. Vérifier chaque propriété de police connue
    for (const [propName, displayName] of Object.entries(fontProperties)) {
      if (txtBV[propName] && txtBV[propName].id) {
        // Désactivation temporaire de la déduplication pour déboguer
        // if (!trackProperty(node.id, displayName, txtBV[propName].id)) {
        usages.push({
          layer: node.name,
          property: displayName,
          id: txtBV[propName].id
        });

        // Marquer cette propriété comme traitée
        if (propName === 'fontSize') {
          processedFontSizeNodeIds.add(node.id);
        }
        // }
      }
    }

    // 2. Dans certains cas, la variable peut être dans un sous-objet
    const varIdsByProperty: Record<string, string[]> = {};

    const extractIds = (obj: any, path: string[] = []) => {
      if (!obj) return;
      if (typeof obj === 'object') {
        if (obj.id && typeof obj.id === 'string') {
          const propPath = path.join('.');

          // Ignorer les chemins liés aux remplissages
          if (propPath.startsWith('fills.') || propPath === 'fills') {
            return;
          }

          if (!varIdsByProperty[propPath]) {
            varIdsByProperty[propPath] = [];
          }
          varIdsByProperty[propPath].push(obj.id);
        }

        for (const key of Object.keys(obj)) {
          // Ne pas explorer les chemins liés aux remplissages
          if (key === 'fills' || (path.length > 0 && path[0] === 'fills')) {
            continue;
          }
          extractIds(obj[key], [...path, key]);
        }
      }
    };

    extractIds(txtBV);

    // Traitement des IDs trouvés par chemin de propriété
    for (const [propPath, ids] of Object.entries(varIdsByProperty)) {
      // Déterminer le type de propriété basé sur le chemin
      let propertyName = propPath;

      // Conversion des chemins en noms de propriétés lisibles
      for (const [propKey, displayName] of Object.entries(fontProperties)) {
        if (propPath.includes(propKey)) {
          propertyName = displayName;
          if (propKey === 'fontSize') {
            processedFontSizeNodeIds.add(node.id);
          }
          break;
        }
      }

      // Si aucune correspondance n'est trouvée, utiliser le mapping ou le chemin brut
      if (propertyName === propPath) {
        propertyName = PROPERTY_MAPPING[propPath] || propPath;
      }

      // Ajouter chaque ID trouvé
      for (const id of ids) {
        // Désactivation temporaire de la déduplication pour déboguer
        // if (!trackProperty(node.id, propertyName, id)) {
        usages.push({
          layer: node.name,
          property: propertyName,
          id
        });
        // }
      }
    }
  }
}

// Inspecte un nœud pour en extraire ses usages de variables
function inspectNode(node: SceneNode): VariableUsage[] {
  // Désactivation temporaire du reset pour déboguer
  // const tempProcessedProps = new Set(processedProperties);
  // processedProperties.clear();

  const usages: VariableUsage[] = [];

  getColorUsages(node, usages);
  getStrokeUsages(node, usages);
  getEffectUsages(node, usages);

  // Gestion spécifique selon le type de nœud
  if (node.type === "TEXT") {
    getTextNodeVariables(node as TextNode, usages);
  }

  getNodeBoundVariables(node, usages);

  // Désactivation temporaire du reset pour déboguer
  // const newEntries = Array.from(processedProperties);
  // processedProperties.clear();
  // for (const entry of tempProcessedProps) {
  //   processedProperties.add(entry);
  // }
  // for (const entry of newEntries) {
  //   processedProperties.add(entry);
  // }

  return usages;
}

// Parcours récursif pour récupérer tous les nœuds d'une sélection
function collectAllNodes(nodes: readonly SceneNode[]): SceneNode[] {
  const result: SceneNode[] = [];
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);

    // Si le nœud contient des enfants, les empiler
    if ("children" in node && Array.isArray((node as any).children)) {
      stack.push(...((node as any).children as SceneNode[]));
    }
  }
  return result;
}

// Fonction utilitaire pour formater les nombres
function formatNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

// Fonctions utilitaires pour la détection des usages non liés
function getUnboundColorUsages(node: SceneNode, unboundUsages: UnboundUsage[]): void {
  // Fills non bindés
  if ("fills" in node && Array.isArray(node.fills)) {
    // On affiche tous les remplissages non variabilisés
    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[i] as Paint;
      const p = fill as any;
      const binding = p.boundVariables && p.boundVariables.color;
      if (!binding || !binding.id) {
        if (p.color) {
          const color = p.color as RGB;
          // On ne vérifie pas la déduplication pour les fills
          unboundUsages.push({
            layer: node.name,
            layerId: node.id,
            property: PROPERTY_NAME_VALUES.FILL,
            value: `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`
          });
        }
      }
    }
  }

  // Strokes non bindés - même logique, on n'affiche que le premier
  if ("strokes" in node && Array.isArray(node.strokes)) {
    let foundFirstUnboundStroke = false;
    let firstUnboundStrokeColor: RGB | undefined;

    for (let i = 0; i < node.strokes.length && !foundFirstUnboundStroke; i++) {
      const stroke = node.strokes[i] as Paint;
      const p = stroke as any;
      const binding = p.boundVariables && p.boundVariables.color;
      if (!binding || !binding.id) {
        if (p.color) {
          foundFirstUnboundStroke = true;
          firstUnboundStrokeColor = p.color as RGB;
        }
      }
    }

    if (foundFirstUnboundStroke && firstUnboundStrokeColor) {
      // Vérifie si cette propriété a déjà été traitée
      if (!trackProperty(node.id, PROPERTY_NAME_VALUES.STROKE)) {
        unboundUsages.push({
          layer: node.name,
          layerId: node.id,
          property: PROPERTY_NAME_VALUES.STROKE,
          value: `rgb(${Math.round(firstUnboundStrokeColor.r * 255)}, ${Math.round(firstUnboundStrokeColor.g * 255)}, ${Math.round(firstUnboundStrokeColor.b * 255)})`
        });
      }

      if (node.strokes.length > 1) {
        console.log(`${node.name} a ${node.strokes.length} contours, seul le premier non lié est affiché`);
      }
    }
  }
}

function getUnboundFloatUsages(node: SceneNode, unboundUsages: UnboundUsage[]): void {
  const nodeBV = (node as any).boundVariables;

  // Opacity - traitée différemment : affichée uniquement si < 1
  const opBV = nodeBV && nodeBV.opacity;
  if ("opacity" in node && typeof (node as any).opacity === 'number' && (!opBV || !opBV.id)) {
    const opacity = (node as any).opacity;
    if (opacity < 1) {
      if (!trackProperty(node.id, PROPERTY_NAMES.OPACITY)) {
        unboundUsages.push({
          layer: node.name,
          layerId: node.id,
          property: PROPERTY_NAMES.OPACITY,
          value: formatNumber(opacity)
        });
      }
    }
  }

  // Stroke weight - ignoré si = 0 ou si le nœud n'a pas de contour (stroke)
  if ("strokeWeight" in node) {
    // Vérifie si le nœud a vraiment des contours
    const hasStrokes = "strokes" in node &&
      Array.isArray((node as any).strokes) &&
      (node as any).strokes.length > 0;

    // Ne traite les poids de contour que si le nœud a des contours
    if (hasStrokes) {
      const sw = (node as any).strokeWeight as number;
      const swBV = nodeBV && nodeBV.strokeWeight;
      const isLinked = swBV && swBV.id;

      if (typeof sw === 'number' && sw !== 0 && !isLinked &&
        !('strokeTopWeight' in node || 'strokeBottomWeight' in node || 'strokeLeftWeight' in node || 'strokeRightWeight' in node)) {

        if (!trackProperty(node.id, PROPERTY_NAMES.STROKE_WEIGHT)) {
          unboundUsages.push({
            layer: node.name,
            layerId: node.id,
            property: PROPERTY_NAMES.STROKE_WEIGHT,
            value: formatNumber(sw)
          });
        }
      }

      // Poids de contour asymétriques - ignorés si = 0
      ['strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight'].forEach(prop => {
        if (prop in node) {
          const weight = (node as any)[prop] as number;
          const weightBV = nodeBV && nodeBV[prop];
          const isLinked = weightBV && weightBV.id;
          if (typeof weight === 'number' && weight !== 0 && !isLinked) {
            const displayName = PROPERTY_MAPPING[prop] || prop;

            if (!trackProperty(node.id, displayName)) {
              unboundUsages.push({
                layer: node.name,
                layerId: node.id,
                property: displayName,
                value: formatNumber(weight)
              });
            }
          }
        }
      });
    }
  }

  // Corner radius - ignoré si = 0
  if ("cornerRadius" in node) {
    const cr = (node as any).cornerRadius as number;
    const crBV = nodeBV && nodeBV.cornerRadius;
    const isLinked = crBV && crBV.id;

    if (typeof cr === 'number' && cr !== 0 && !isLinked &&
      !('topLeftRadius' in node || 'topRightRadius' in node || 'bottomLeftRadius' in node || 'bottomRightRadius' in node)) {

      if (!trackProperty(node.id, PROPERTY_NAMES.CORNER_RADIUS)) {
        unboundUsages.push({
          layer: node.name,
          layerId: node.id,
          property: PROPERTY_NAMES.CORNER_RADIUS,
          value: formatNumber(cr)
        });
      }
    }
  }

  // Rayons asymétriques - ignorés si = 0
  ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach(prop => {
    if (prop in node) {
      const radius = (node as any)[prop] as number;
      const radiusBV = nodeBV && nodeBV[prop];
      const isLinked = radiusBV && radiusBV.id;
      if (typeof radius === 'number' && radius !== 0 && !isLinked) {
        const displayName = PROPERTY_MAPPING[prop] || prop;

        if (!trackProperty(node.id, displayName)) {
          unboundUsages.push({
            layer: node.name,
            layerId: node.id,
            property: displayName,
            value: formatNumber(radius)
          });
        }
      }
    }
  });

  // Traitement des propriétés de texte non variabilisées
  if (node.type === "TEXT") {
    const txt = node as TextNode;

    // Liste des propriétés de texte à vérifier
    const textProperties = [
      { key: 'fontSize', displayName: PROPERTY_NAMES.FONT_SIZE, skipIfProcessed: true },
      { key: 'letterSpacing', displayName: PROPERTY_NAMES.LETTER_SPACING },
      { key: 'lineHeight', displayName: PROPERTY_NAMES.LINE_HEIGHT },
      { key: 'paragraphSpacing', displayName: PROPERTY_NAMES.PARAGRAPH_SPACING }
    ];

    // Vérification de chaque propriété
    for (const { key, displayName, skipIfProcessed } of textProperties) {
      // Ignorer fontSize si le nœud est déjà traité pour cette propriété
      if (skipIfProcessed && key === 'fontSize' && processedFontSizeNodeIds.has(txt.id)) {
        continue;
      }

      const value = (txt as any)[key];
      const boundVar = nodeBV && nodeBV[key];
      const isLinked = boundVar && boundVar.id;

      if (typeof value === 'number' && value !== 0 && !isLinked && !trackProperty(node.id, displayName)) {
        unboundUsages.push({
          layer: node.name,
          layerId: node.id,
          property: displayName,
          value: formatNumber(value)
        });
      } else if (typeof value === 'object' && value !== null) {
        // Pour les valeurs mixtes, ne pas les signaler comme non variabilisées
      }
    }
  }

  // Traitement des propriétés Padding et Gap (Item Spacing)
  const spacingProperties = [
    { key: 'paddingLeft', displayName: PROPERTY_NAMES.PADDING_LEFT },
    { key: 'paddingRight', displayName: PROPERTY_NAMES.PADDING_RIGHT },
    { key: 'paddingTop', displayName: PROPERTY_NAMES.PADDING_TOP },
    { key: 'paddingBottom', displayName: PROPERTY_NAMES.PADDING_BOTTOM },
    { key: 'itemSpacing', displayName: PROPERTY_NAMES.ITEM_SPACING }
  ];

  for (const { key, displayName } of spacingProperties) {
    if (key in node) {
      const value = (node as any)[key];
      const boundVar = nodeBV && nodeBV[key];
      const isLinked = boundVar && boundVar.id;

      // Ne traiter que les valeurs numériques et non liées 
      // On ignore les valeurs à 0 pour le padding et le gap
      if (typeof value === 'number' && !isLinked &&
        (value !== 0 || !['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing', 'gap'].includes(key))) {
        console.log(`Found spacing property ${key} = ${value} on node ${node.name}`);

        if (!trackProperty(node.id, displayName)) {
          unboundUsages.push({
            layer: node.name,
            layerId: node.id,
            property: displayName,
            value: formatNumber(value)
          });
        }
      }
    }
  }
}

// Detect unbound effect properties (radius, color)
function getUnboundEffectUsages(node: SceneNode, unboundUsages: UnboundUsage[]): void {
  if ("effects" in node && Array.isArray(node.effects)) {
    for (const effect of (node.effects as any[])) {
      const boundVars = effect.boundVariables || {};
      const rawType = (effect.type as string) || '';
      const friendlyType = rawType
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());

      // Radius/Blur
      if (typeof effect.radius === 'number') {
        if (!boundVars.radius || !boundVars.radius.id) {
          const propertyName = (rawType.includes('BLUR') || rawType.includes('SHADOW')) ? 'Blur' : 'Radius';
          unboundUsages.push({
            layer: node.name,
            layerId: node.id,
            property: `${friendlyType} ${propertyName}`,
            value: formatNumber(effect.radius)
          });
        }
      }

      // Offset X et Y pour les ombres
      if (rawType.includes('SHADOW') && effect.offset) {
        const offsetBoundVars = boundVars.offset || {};
        
        // Offset X
        if (typeof effect.offset.x === 'number' && (!offsetBoundVars.x || !offsetBoundVars.x.id)) {
          unboundUsages.push({
            layer: node.name,
            layerId: node.id,
            property: `${friendlyType} Offset X`,
            value: formatNumber(effect.offset.x)
          });
        }

        // Offset Y
        if (typeof effect.offset.y === 'number' && (!offsetBoundVars.y || !offsetBoundVars.y.id)) {
          unboundUsages.push({
            layer: node.name,
            layerId: node.id,
            property: `${friendlyType} Offset Y`,
            value: formatNumber(effect.offset.y)
          });
        }
      }

      // Spread
      if (typeof effect.spread === 'number' && (!boundVars.spread || !boundVars.spread.id)) {
        unboundUsages.push({
          layer: node.name,
          layerId: node.id,
          property: `${friendlyType} Spread`,
          value: formatNumber(effect.spread)
        });
      }

      // Color (for shadows)
      if (effect.color) {
        if (!boundVars.color || !boundVars.color.id) {
          const c = effect.color as RGB;
          unboundUsages.push({
            layer: node.name,
            layerId: node.id,
            property: `${friendlyType} Color`,
            value: `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`
          });
        }
      }
    }
  }
}

// Regroupe les usages par couche
function groupUsagesByLayer(allUsages: VariableUsage[]) {
  const usagesByLayerId: Record<string, VariableUsage[]> = {};
  // Log du nombre total d'usages avant regroupement
  console.log(`Grouping ${allUsages.length} usages by layer`);

  const processedLayerProperties = new Map<string, Set<string>>();

  // Tri des usages pour un ordre prévisible
  const sortedUsages = [...allUsages].sort((a, b) => {
    // D'abord par ID de couche
    const layerCompare = a.layer.localeCompare(b.layer);
    if (layerCompare !== 0) return layerCompare;

    // Puis par nom de propriété
    return a.property.localeCompare(b.property);
  });

  // Traitement des usages triés
  for (const usage of sortedUsages) {
    // Initialiser le tableau d'usages pour cette couche si nécessaire
    if (!usagesByLayerId[usage.layer]) {
      usagesByLayerId[usage.layer] = [];
      processedLayerProperties.set(usage.layer, new Set<string>());
    }

    const processedProperties = processedLayerProperties.get(usage.layer)!;
    const propertyKey = `${usage.property}_${usage.id || ''}`;

    // Ne pas dédupliquer les propriétés de padding et spacing
    const spacingProperties = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'itemSpacing', 'gap'];
    const isSpacingProperty = spacingProperties.some(prop => usage.property.includes(prop));

    // Log pour déboguer
    console.log(`Layer: ${usage.layer}, Property: ${usage.property}, isSpacing: ${isSpacingProperty}, isDuplicate: ${processedProperties.has(propertyKey)}`);

    // Ajouter l'usage si ce n'est pas un doublon ou si c'est une propriété de spacing
    if (!processedProperties.has(propertyKey) || isSpacingProperty) {
      usagesByLayerId[usage.layer].push(usage);
      processedProperties.add(propertyKey);
    }
  }

  // Log final pour vérifier la taille de chaque groupe
  for (const [layerId, usages] of Object.entries(usagesByLayerId)) {
    console.log(`Layer ${layerId}: ${usages.length} usages after grouping`);
  }

  return usagesByLayerId;
}

// Met à jour l'inspection et envoie les données à l'UI
async function updateInspector(): Promise<void> {
  // Réinitialiser les Sets avant chaque mise à jour
  resetDedupSets();

  const vars = await loadVariables();
  const selection = figma.currentPage.selection;
  const allNodes = collectAllNodes(selection);

  // Collecte des usages de variables
  const allUsages: Array<{ layer: string; layerId: string; property: string; name: string; type: VariableResolvedDataType; origin: 'local' | 'external'; colorValue?: RGB | RGBA; id: string }> = [];
  const unboundUsages: UnboundUsage[] = [];

  for (const node of allNodes) {
    const nodeUsages = inspectNode(node);
    for (const { layer, property, id } of nodeUsages) {
      const def = vars.get(id);
      if (!def) {
        // Variable provenant d'un autre fichier : on l'affiche malgré tout
        allUsages.push({
          layer: layer,
          layerId: node.id,
          property: property,
          name: id,           // on affiche l'ID en guise de nom
          type: 'STRING',     // type par défaut pour les variables inconnues
          origin: 'external', // style pill externe
          id: id
        });
        continue;
      }
      allUsages.push({
        layer,
        layerId: node.id,
        property,
        name: def.name,
        type: def.type,
        origin: def.origin,
        colorValue: def.colorValue,
        id: id
      });
    }
    getUnboundColorUsages(node, unboundUsages);
    getUnboundFloatUsages(node, unboundUsages);
    getUnboundEffectUsages(node, unboundUsages);
  }

  // Création d'une map d'information des calques basée sur les usages
  const layerInfoMap = new Map<string, LayerInfo>();
  allUsages.forEach((u, idx) => {
    if (!layerInfoMap.has(u.layerId)) {
      const node = figma.getNodeById(u.layerId) as SceneNode | null;
      if (node) {
        let layerType: string = 'UNKNOWN';
        // Prioritize component & instance types over auto-layout
        if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
          layerType = node.type;
        } else if ('layoutMode' in node) {
          const frame = node as FrameNode;
          if (frame.layoutWrap === 'WRAP') {
            layerType = 'AUTO_WRAP';
          } else if (frame.layoutMode === 'HORIZONTAL') {
            layerType = 'AUTO_HORIZONTAL';
          } else if (frame.layoutMode === 'VERTICAL') {
            layerType = 'AUTO_VERTICAL';
          } else {
            layerType = node.type;
          }
        } else {
          layerType = node.type;
        }
        layerInfoMap.set(u.layerId, {
          id: u.layerId,
          name: u.layer,
          order: idx,
          type: layerType
        });
      }
    }
  });

  // Ajouter aussi les calques n'ayant que des propriétés non variabilisées
  unboundUsages.forEach((u, idx) => {
    if (!layerInfoMap.has(u.layerId)) {
      const node = figma.getNodeById(u.layerId) as SceneNode | null;
      if (node) {
        let layerType: string = 'UNKNOWN';
        if (node.type === 'COMPONENT' || node.type === 'INSTANCE') {
          layerType = node.type;
        } else if ('layoutMode' in node) {
          const frame = node as FrameNode;
          if (frame.layoutWrap === 'WRAP') {
            layerType = 'AUTO_WRAP';
          } else if (frame.layoutMode === 'HORIZONTAL') {
            layerType = 'AUTO_HORIZONTAL';
          } else if (frame.layoutMode === 'VERTICAL') {
            layerType = 'AUTO_VERTICAL';
          } else {
            layerType = node.type;
          }
        } else {
          layerType = node.type;
        }
        layerInfoMap.set(u.layerId, {
          id: u.layerId,
          name: u.layer,
          order: allUsages.length + idx,
          type: layerType
        });
      }
    }
  });

  // Regroupe les usages par couche
  const byLayer = groupUsagesByLayer(allUsages);

  // Log pour déboguer
  console.log("Final usages count:", allUsages.length);
  console.log("Layers with variables:", Object.keys(byLayer).length);
  console.log("Unbound usages count:", unboundUsages.length);
  console.log("Total nodes in layerInfoMap:", layerInfoMap.size);

  // Vérifier si des variables ont été trouvées
  // Considérer qu'il y a des données à afficher s'il y a des variables OU des usages non variabilisés
  const noVariablesFound = allUsages.length === 0 && unboundUsages.length === 0;

  figma.ui.postMessage({
    byLayer,
    unbound: unboundUsages,
    layerInfoMap: Object.fromEntries(layerInfoMap),
    noVariablesFound: noVariablesFound
  });

}

// Initialisation du plugin
function initializePlugin() {
  figma.showUI(uiHtml.replace(
    '</head>',
    `<style>${css}</style></head>`
  ), {
    width: 300,
    height: 400,
    title: 'Variable Inspector'
  });

  // Gestion des messages UI (resize, sélection de nœud)
  figma.ui.onmessage = (msg) => {
    if (msg.type === 'resize') {
      // Redimensionnement de la fenêtre du plugin
      figma.ui.resize(msg.width, msg.height);
    } else if (msg.type === 'select-node') {
      // Sélectionner et centrer le nœud dans Figma
      const node = figma.getNodeById(msg.nodeId) as SceneNode | null;
      if (node) {
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    }
  };

  // Réagir aux changements de sélection
  figma.on("selectionchange", () => {
    updateInspector().catch(err => console.error('updateInspector error', err));
  });

  // Initial inspection
  updateInspector().catch(err => console.error('updateInspector error', err));
}

// Démarrer le plugin une fois que tout est chargé
initializePlugin();

