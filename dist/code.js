const P=`<!DOCTYPE html>
<html>

<head>
  <meta charset="UTF-8" />
</head>

<body>
  <div id="app"></div>
  <div class="resize-handle"></div>

  <script>
    // Gestion du redimensionnement
    const resizeHandle = document.querySelector('.resize-handle');
    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = window.innerWidth;
      startHeight = window.innerHeight;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const width = Math.max(300, startWidth + (e.clientX - startX));
      const height = Math.max(200, startHeight + (e.clientY - startY));

      // Envoie le message de redimensionnement au plugin
      parent.postMessage({
        pluginMessage: {
          type: 'resize',
          width: width,
          height: height
        }
      }, '*');
    });

    document.addEventListener('mouseup', () => {
      isResizing = false;
    });

    // Empêche la sélection de texte pendant le redimensionnement
    document.addEventListener('selectstart', (e) => {
      if (isResizing) {
        e.preventDefault();
      }
    });

    function formatRGBA(color) {
      if (!color) return '#ccc'; // Couleur par défaut si non définie
      const r = Math.round(color.r * 255);
      const g = Math.round(color.g * 255);
      const b = Math.round(color.b * 255);
      const a = color.a === undefined ? 1 : color.a;
      return \`rgba(\${r}, \${g}, \${b}, \${a})\`;
    }

    window.onmessage = (event) => {
      const msg = event.data.pluginMessage;
      const { byLayer, unbound, layerInfoMap, noVariablesFound } = msg;
      const unboundMap = {};
      if (unbound) {
        unbound.forEach(({ layer, property, value }) => {
          if (!unboundMap[layer]) unboundMap[layer] = [];
          unboundMap[layer].push({ property, value });
        });
      }
      const container = document.getElementById("app");
      container.innerHTML = "";

      // Vérifier s'il n'y a aucune variable ni propriété non liée
      if (noVariablesFound) {
        const emptyMessage = document.createElement("div");
        emptyMessage.style.padding = "2rem";
        emptyMessage.style.textAlign = "center";
        emptyMessage.style.color = "#666";
        emptyMessage.innerHTML = \`
          <h3 style="margin-bottom: 1rem;">Aucune propriété détectée</h3>
          <p>La sélection actuelle ne contient aucune propriété détectable.</p>
          <p>Sélectionnez un élément avec des propriétés à inspecter.</p>
        \`;
        container.appendChild(emptyMessage);
        return;
      }

      // Prépare les informations pour l'affichage
      // Combiner les infos des calques qui ont des variables et des calques qui ont des propriétés non variabilisées
      const allLayerNames = new Set([
        ...Object.keys(byLayer || {}),
        ...Object.keys(unboundMap || {})
      ]);

      // Structure pour stocker toutes les infos des calques avec leur ordre
      const allLayersWithOrderInfo = [];

      // Pour chaque calque qui a des variables liées ou non liées
      for (const layerName of allLayerNames) {
        // Chercher l'ID du calque et son info d'ordre
        let layerId = '';
        let orderInfo = null;

        // D'abord, essayer de trouver l'ID via les variables liées
        if (byLayer && byLayer[layerName] && byLayer[layerName].length > 0) {
          layerId = byLayer[layerName][0].layerId;
          orderInfo = layerInfoMap[layerId];

          // Déduplication des propriétés de remplissage
          // Si un calque a à la fois "Fill" et "fills.0", ne garder que "Fill"
          const items = byLayer[layerName];
          const dedupedItems = [];
          const seenProps = new Set();

          for (const item of items) {
            // Si la propriété est "fills.0" ou commence par "fills.", la renommer en "Fill"
            let propName = item.property;
            if (propName === "fills.0" || propName.startsWith("fills.")) {
              propName = "Fill";
            }

            // Créer une clé de déduplication
            const dedupKey = \`\${propName}|\${item.name}\`;

            // Ne pas ajouter si on a déjà vu cette propriété
            if (!seenProps.has(dedupKey)) {
              seenProps.add(dedupKey);
              dedupedItems.push({ ...item, property: propName });
            }
          }

          // Remplacer les items par les items dédupliqués
          byLayer[layerName] = dedupedItems;
        }

        // Si nous n'avons pas trouvé l'ID/ordre, parcourir tous les layerInfoMap pour trouver le calque par son nom
        if (!orderInfo) {
          for (const [id, info] of Object.entries(layerInfoMap)) {
            if (info.name === layerName) {
              layerId = id;
              orderInfo = info;
              break;
            }
          }
        }

        // Ajouter ce calque avec son info d'ordre
        allLayersWithOrderInfo.push({
          layerName: layerName,
          // Éléments liés à des variables (peut être vide)
          items: (byLayer && byLayer[layerName]) || [],
          // Propriétés non liées (peut être vide)
          unboundItems: (unboundMap && unboundMap[layerName]) || [],
          // Info d'ordre pour trier
          order: orderInfo ? orderInfo.order : Number.MAX_SAFE_INTEGER,
          layerId: layerId
        });
      }

      // Trier tous les calques selon l'ordre de Figma
      allLayersWithOrderInfo.sort((a, b) => a.order - b.order);

      // Afficher toutes les sections pour chaque calque
      for (const { layerName, items, unboundItems, layerId } of allLayersWithOrderInfo) {
        // Ne créer une section que si le calque a des variables liées ou non liées
        if ((items && items.length > 0) || (unboundItems && unboundItems.length > 0)) {
          const section = document.createElement("div");
          section.className = "layer-section";

          // Créer le titre du calque
          const title = document.createElement("h2");
          title.textContent = layerName;

          // Ajouter le type de calque si disponible
          const layerInfo = layerInfoMap[layerId];
          if (layerInfo && layerInfo.type) {
            const typeSpan = document.createElement('span');
            typeSpan.className = 'layer-type-label';
            typeSpan.textContent = \`(\${layerInfo.type})\`;
            title.appendChild(typeSpan);
          }

          section.appendChild(title);



          // Ajouter les propriétés non variabilisées s'il y en a
          if (unboundItems && unboundItems.length > 0) {
            // Grouper aussi les propriétés non liées
            const groupedUnboundItems = groupSimilarUnboundProperties(unboundItems);

            const warn = document.createElement("div");
            warn.className = "warning";
            const wt = document.createElement("h3");
            wt.appendChild(document.createTextNode("🚨 Non‑variabilisé"));

            warn.appendChild(wt);
            const ulWarn = document.createElement("ul");

            for (const item of groupedUnboundItems) {
              if (item.isGroup) {
                // Groupe de propriétés
                const groupLi = document.createElement("li");

                // Titre du groupe
                const groupTitle = document.createElement("div");
                groupTitle.className = "property-group-title";
                groupTitle.textContent = item.groupName;
                groupLi.appendChild(groupTitle);

                // Sous-liste pour ce groupe
                const subList = document.createElement("ul");
                subList.className = "property-sub-list";

                for (const subItem of item.properties) {
                  const subLi = document.createElement("li");

                  // Nom et valeur de la sous-propriété
                  const subPropContainer = document.createElement("div");
                  // Pas de classe spécifique ici

                  const subPropName = document.createElement("span");
                  subPropName.className = "sub-property-name";
                  subPropName.textContent = subItem.subName;
                  subPropContainer.appendChild(subPropName);

                  // Valeur de la propriété
                  subPropContainer.appendChild(document.createTextNode(\`: \${subItem.value}\`));

                  subLi.appendChild(subPropContainer);
                  subList.appendChild(subLi);
                }

                groupLi.appendChild(subList);
                ulWarn.appendChild(groupLi);
              } else {
                // Propriété simple
                const li = document.createElement("li");
                // Pas de conteneur "property-with-icon"
                li.textContent = \`\${item.property}: \${item.value}\`;
                ulWarn.appendChild(li);
              }
            }

            warn.appendChild(ulWarn);
            section.appendChild(warn);
          }

          // Ajouter les variables liées s'il y en a
          if (items && items.length > 0) {
            // Grouper les propriétés similaires
            const groupedItems = groupSimilarProperties(items);
            const ul = document.createElement("ul");

            for (const item of groupedItems) {
              const li = document.createElement("li");

              // Si c'est un groupe de propriétés
              if (item.isGroup) {
                // Titre du groupe
                const groupTitle = document.createElement("div");
                groupTitle.className = "property-group-title";
                groupTitle.textContent = item.groupName;
                li.appendChild(groupTitle);

                // Liste des sous-propriétés
                const subList = document.createElement("ul");
                subList.className = "property-sub-list";

                for (const subItem of item.properties) {
                  const subLi = document.createElement("li");

                  // Nom de la sous-propriété
                  const subPropName = document.createElement("span");
                  subPropName.className = "sub-property-name";
                  subPropName.textContent = subItem.subName;
                  subLi.appendChild(subPropName);

                  // Pill de la variable
                  const pill = createVariablePill(subItem);
                  subLi.appendChild(pill);

                  subList.appendChild(subLi);
                }

                li.appendChild(subList);
              } else {
                // Propriété simple (non groupée)
                // Créer un conteneur pour la propriété principale
                const propContainer = document.createElement("div");
                propContainer.className = "main-property-container";

                // Nom de la propriété
                const propName = document.createElement("strong");
                propName.className = "main-property-name";
                propName.textContent = item.property;
                propContainer.appendChild(propName);

                // Pill de la variable en dessous
                const pill = createVariablePill(item);
                pill.className = pill.className + " main-property-pill";
                propContainer.appendChild(pill);

                li.appendChild(propContainer);
              }

              ul.appendChild(li);
            }

            section.appendChild(ul);
          }



          container.appendChild(section);
        }
      }
    };

    // Icônes SVG pour les types de variables
    const variableTypeIcons = {
      "COLOR": '<svg viewBox="0 0 24 24" fill="none"><path d="M7.312 6.803C8.64423 5.60135 10.387 4.9571 12.1805 5.00325C13.974 5.0494 15.6813 5.78243 16.95 7.051L17.23 7.349C18.4495 8.72011 19.0819 10.5153 18.991 12.348L18.962 12.728C18.807 14.222 17.446 15.002 16.242 15.002H13.5C13.3674 15.002 13.2402 15.0547 13.1464 15.1484C13.0527 15.2422 13 15.3694 13 15.502V16C13 16.82 12.66 17.603 12.08 18.127C11.478 18.669 10.612 18.927 9.71 18.617C8.589 18.2286 7.58506 17.5617 6.79244 16.6789C5.99981 15.7962 5.44448 14.7265 5.17857 13.5703C4.91266 12.4141 4.94489 11.2093 5.27224 10.0689C5.59958 8.92858 6.21131 7.89012 7.05 7.051L7.312 6.803ZM16.243 7.759C15.1178 6.63387 13.5917 6.00178 12.0005 6.00178C10.4093 6.00178 8.88321 6.63387 7.758 7.759L7.545 7.982C6.88107 8.71757 6.40965 9.60613 6.17285 10.5683C5.93604 11.5305 5.94122 12.5363 6.18793 13.496C6.43464 14.4557 6.91519 15.3394 7.58667 16.0681C8.25814 16.7968 9.09964 17.3478 10.036 17.672C11.015 18.01 11.885 17.216 11.989 16.205L12 16.001V15.501C12 14.726 12.59 14.086 13.346 14.009L13.5 14.002H16.242L16.401 13.995C17.134 13.938 17.792 13.482 17.944 12.778L17.968 12.624C18.0547 11.7945 17.9675 10.956 17.712 10.1621C17.4565 9.36816 17.0383 8.63623 16.484 8.013L16.243 7.759ZM9 12C9.13132 12.0001 9.26135 12.026 9.38265 12.0763C9.50395 12.1266 9.61415 12.2003 9.70696 12.2932C9.79978 12.3862 9.87338 12.4964 9.92357 12.6178C9.97377 12.7391 9.99957 12.8692 9.9995 13.0005C9.99944 13.1318 9.97351 13.2618 9.92319 13.3831C9.87288 13.5044 9.79916 13.6146 9.70626 13.7075C9.61335 13.8003 9.50308 13.8739 9.38172 13.9241C9.26037 13.9743 9.13032 14.0001 8.999 14C8.73379 13.9999 8.47949 13.8944 8.29204 13.7068C8.1046 13.5191 7.99937 13.2647 7.9995 12.9995C7.99964 12.7343 8.10512 12.48 8.29275 12.2925C8.48038 12.1051 8.73479 11.9999 9 12ZM15 10C15.1315 10.0001 15.2616 10.0262 15.383 10.0766C15.5044 10.127 15.6147 10.2008 15.7075 10.2939C15.8004 10.3869 15.874 10.4974 15.9242 10.6189C15.9744 10.7404 16.0001 10.8705 16 11.002C15.9999 11.1335 15.9739 11.2636 15.9234 11.385C15.873 11.5064 15.7992 11.6167 15.7061 11.7095C15.6131 11.8024 15.5026 11.876 15.3811 11.9262C15.2596 11.9764 15.1295 12.0021 14.998 12.002C14.7325 12.0017 14.478 11.896 14.2905 11.7081C14.1029 11.5202 13.9977 11.2655 13.998 11C13.9983 10.7345 14.104 10.48 14.2919 10.2925C14.4798 10.1049 14.7345 9.99973 15 10ZM10 9C10.2652 9 10.5196 9.10536 10.7071 9.29289C10.8946 9.48043 11 9.73478 11 10C11 10.2652 10.8946 10.5196 10.7071 10.7071C10.5196 10.8946 10.2652 11 10 11C9.73479 11 9.48043 10.8946 9.2929 10.7071C9.10536 10.5196 9 10.2652 9 10C9 9.73478 9.10536 9.48043 9.2929 9.29289C9.48043 9.10536 9.73479 9 10 9ZM13 8C13.2655 8 13.5201 8.10546 13.7078 8.29318C13.8955 8.48091 14.001 8.73552 14.001 9.001C14.001 9.26648 13.8955 9.52109 13.7078 9.70881C13.5201 9.89654 13.2655 10.002 13 10.002C12.7347 10.002 12.4802 9.89659 12.2925 9.70896C12.1049 9.52133 11.9995 9.26685 11.9995 9.0015C11.9995 8.73615 12.1049 8.48167 12.2925 8.29404C12.4802 8.10641 12.7347 8.001 13 8.001" fill="currentColor" /></svg>',
      "STRING": '<svg viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 7H16C16.2652 7 16.5196 7.10536 16.7071 7.29289C16.8946 7.48043 17 7.73478 17 8V16C17 16.2652 16.8946 16.5196 16.7071 16.7071C16.5196 16.8946 16.2652 17 16 17H8C7.73478 17 7.48043 16.8946 7.29289 16.7071C7.10536 16.5196 7 16.2652 7 16V8C7 7.73478 7.10536 7.48043 7.29289 7.29289C7.48043 7.10536 7.73478 7 8 7ZM6 8C6 7.46957 6.21071 6.96086 6.58579 6.58579C6.96086 6.21071 7.46957 6 8 6H16C16.5304 6 17.0391 6.21071 17.4142 6.58579C17.7893 6.96086 18 7.46957 18 8V16C18 16.5304 17.7893 17.0391 17.4142 17.4142C17.0391 17.7893 16.5304 18 16 18H8C7.46957 18 6.96086 17.7893 6.58579 17.4142C6.21071 17.0391 6 16.5304 6 16V8ZM9.5 9C9.36739 9 9.24021 9.05268 9.14645 9.14645C9.05268 9.24021 9 9.36739 9 9.5V10.5C9 10.6326 9.05268 10.7598 9.14645 10.8536C9.24021 10.9473 9.36739 11 9.5 11C9.63261 11 9.75979 10.9473 9.85355 10.8536C9.94732 10.7598 10 10.6326 10 10.5V10H11.5V14H11C10.8674 14 10.7402 14.0527 10.6464 14.1464C10.5527 14.2402 10.5 14.3674 10.5 14.5C10.5 14.6326 10.5527 14.7598 10.6464 14.8536C10.7402 14.9473 10.8674 15 11 15H13C13.1326 15 13.2598 14.9473 13.3536 14.8536C13.4473 14.7598 13.5 14.6326 13.5 14.5C13.5 14.3674 13.4473 14.2402 13.3536 14.1464C13.2598 14.0527 13.1326 14 13 14H12.5V10H14V10.5C14 10.6326 14.0527 10.7598 14.1464 10.8536C14.2402 10.9473 14.3674 11 14.5 11C14.6326 11 14.7598 10.9473 14.8536 10.8536C14.9473 10.7598 15 10.6326 15 10.5V9.5C15 9.36739 14.9473 9.24021 14.8536 9.14645C14.7598 9.05268 14.6326 9 14.5 9H9.5Z" fill="currentColor"/></svg>',
      "FLOAT": '<svg viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M11.498 9.55C11.5113 9.41806 11.4716 9.28625 11.3876 9.18357C11.3037 9.08089 11.1824 9.01576 11.0505 9.0025C10.9186 8.98924 10.7867 9.02894 10.6841 9.11286C10.5814 9.19678 10.5163 9.31806 10.503 9.45L10.447 10H9.5C9.36739 10 9.24021 10.0527 9.14645 10.1464C9.05268 10.2402 9 10.3674 9 10.5C9 10.6326 9.05268 10.7598 9.14645 10.8536C9.24021 10.9473 9.36739 11 9.5 11H10.348L10.148 13H9.5C9.36739 13 9.24021 13.0527 9.14645 13.1464C9.05268 13.2402 9 13.3674 9 13.5C9 13.6326 9.05268 13.7598 9.14645 13.8536C9.24021 13.9473 9.36739 14 9.5 14H10.047L10.002 14.45C9.98874 14.5819 10.0284 14.7138 10.1124 14.8164C10.1963 14.9191 10.3176 14.9842 10.4495 14.9975C10.5814 15.0108 10.7133 14.9711 10.8159 14.8871C10.9186 14.8032 10.9837 14.6819 10.997 14.55L11.053 14H12.547L12.502 14.45C12.4954 14.5153 12.5018 14.5813 12.5207 14.6442C12.5397 14.7071 12.5708 14.7656 12.6124 14.8164C12.6539 14.8673 12.7051 14.9094 12.7629 14.9405C12.8208 14.9716 12.8842 14.9909 12.9495 14.9975C13.0148 15.0041 13.0808 14.9977 13.1437 14.9788C13.2066 14.9598 13.2651 14.9287 13.3159 14.8871C13.3668 14.8456 13.4089 14.7944 13.44 14.7366C13.4711 14.6787 13.4904 14.6153 13.497 14.55L13.553 14H14.5C14.6326 14 14.7598 13.9473 14.8536 13.8536C14.9473 13.7598 15 13.6326 15 13.5C15 13.3674 14.9473 13.2402 14.8536 13.1464C14.7598 13.0527 14.6326 13 14.5 13H13.652L13.852 11H14.5C14.6326 11 14.7598 10.9473 14.8536 10.8536C14.9473 10.7598 15 10.6326 15 10.5C15 10.3674 14.9473 10.2402 14.8536 10.1464C14.7598 10.0527 14.6326 10 14.5 10H13.953L13.998 9.55C14.0046 9.48467 13.9982 9.41868 13.9793 9.35581C13.9603 9.29294 13.9292 9.23441 13.8876 9.18357C13.8461 9.13273 13.7949 9.09057 13.7371 9.05951C13.6792 9.02844 13.6158 9.00907 13.5505 9.0025C13.4852 8.99593 13.4192 9.0023 13.3563 9.02124C13.2934 9.04017 13.2349 9.07131 13.1841 9.11286C13.1332 9.15441 13.0911 9.20557 13.06 9.26342C13.0289 9.32127 13.0096 9.38467 13.003 9.45L12.947 10H11.453L11.498 9.55ZM11.153 13L11.353 11H12.848L12.648 13H11.153Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M8 6C7.46957 6 6.96086 6.21071 6.58579 6.58579C6.21071 6.96086 6 7.46957 6 8V16C6 16.5304 6.21071 17.0391 6.58579 17.4142C6.96086 17.7893 7.46957 18 8 18H16C16.5304 18 17.0391 17.7893 17.4142 17.4142C17.7893 17.0391 18 16.5304 18 16V8C18 7.46957 17.7893 6.96086 17.4142 6.58579C17.0391 6.21071 16.5304 6 16 6H8ZM7 8C7 7.73478 7.10536 7.48043 7.29289 7.29289C7.48043 7.10536 7.73478 7 8 7H16C16.2652 7 16.5196 7.10536 16.7071 7.29289C16.8946 7.48043 17 7.73478 17 8V16C17 16.2652 16.8946 16.5196 16.7071 16.7071C16.5196 16.8946 16.2652 17 16 17H8C7.73478 17 7.48043 16.8946 7.29289 16.7071C7.10536 16.5196 7 16.2652 7 16V8Z" fill="currentColor"/></svg>',
      // Ajouter BOOLEAN au cas où
      "BOOLEAN": '<svg viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M8 6C7.46957 6 6.96086 6.21071 6.58579 6.58579C6.21071 6.96086 6 7.46957 6 8V16C6 16.5304 6.21071 17.0391 6.58579 17.4142C6.96086 17.7893 7.46957 18 8 18H16C16.5304 18 17.0391 17.7893 17.4142 17.4142C17.7893 17.0391 18 16.5304 18 16V8C18 7.46957 17.7893 6.96086 17.4142 6.58579C17.0391 6.21071 16.5304 6 16 6H8ZM7 8C7 7.73478 7.10536 7.48043 7.29289 7.29289C7.48043 7.10536 7.73478 7 8 7H16C16.2652 7 16.5196 7.10536 16.7071 7.29289C16.8946 7.48043 17 7.73478 17 8V16C17 16.2652 16.8946 16.5196 16.7071 16.7071C16.5196 16.8946 16.2652 17 16 17H8C7.73478 17 7.48043 16.8946 7.29289 16.7071C7.10536 16.5196 7 16.2652 7 16V8ZM10.7071 9.29289C10.5196 9.10536 10.2652 9 10 9C9.73478 9 9.48043 9.10536 9.29289 9.29289C9.10536 9.48043 9 9.73478 9 10V14C9 14.2652 9.10536 14.5196 9.29289 14.7071C9.48043 14.8946 9.73478 15 10 15C10.2652 15 10.5196 14.8946 10.7071 14.7071C10.8946 14.5196 11 14.2652 11 14V10C11 9.73478 10.8946 9.48043 10.7071 9.29289ZM14.7071 9.29289C14.5196 9.10536 14.2652 9 14 9C13.7348 9 13.4804 9.10536 13.2929 9.29289C13.1054 9.48043 13 9.73478 13 10V14C13 14.2652 13.1054 14.5196 13.2929 14.7071C13.4804 14.8946 13.7348 15 14 15C14.2652 15 14.5196 14.8946 14.7071 14.7071C14.8946 14.5196 15 14.2652 15 14V10C15 9.73478 14.8946 9.48043 14.7071 9.29289Z" fill="currentColor"/></svg>'
    };

    // Crée un élément d'icône SVG pour un type de variable
    function createVariableTypeIconElement(variableType) {
      const svgString = variableTypeIcons[variableType];
      if (!svgString) return null; // Retourne null si pas d'icône pour ce type

      const icon = document.createElement('span');
      icon.className = 'variable-type-svg-icon'; // Utiliser une classe spécifique
      icon.innerHTML = svgString;
      return icon;
    }

    // Fonction pour créer le pill d'une variable
    function createVariablePill(item) {
      const pill = document.createElement("span");
      pill.className = \`variable-pill \${item.origin === 'local' ? 'local-variable' : 'external-variable'}\`;

      // Remplacer le carré de couleur par l'icône SVG
      const icon = createVariableTypeIconElement(item.type);

      if (icon) {
        // Si c'est une couleur et qu'on a la valeur, on peut colorer l'icône (optionnel)
        // if (item.type === 'COLOR' && item.colorValue) {
        //   icon.style.color = formatRGBA(item.colorValue); // Colorer le SVG
        // }
        pill.appendChild(icon);
      } else {
        // Fallback si pas d'icône (peut-être pour BOOLEAN etc.)
        const fallbackIcon = document.createElement("span");
        fallbackIcon.className = 'variable-type-icon'; // Utiliser l'ancien style
        fallbackIcon.style.backgroundColor = '#ccc';
        pill.appendChild(fallbackIcon);
      }

      pill.appendChild(document.createTextNode(item.name));

      return pill;
    }

    // Fonction pour grouper les propriétés similaires
    function groupSimilarProperties(items) {
      const result = [];
      const processed = new Set();

      // Groupes potentiels et leurs préfixes
      const groups = [
        {
          prefix: "Radius",
          pattern: /^(Top|Bottom) (Left|Right) Radius$/,
          extractSubName: (prop) => prop.replace(" Radius", ""),
          groupName: "Radius"
        },
        {
          prefix: "Stroke Weight",
          pattern: /^Stroke (Top|Bottom|Left|Right) Weight$/,
          extractSubName: (prop) => prop.replace("Stroke ", "").replace(" Weight", ""),
          groupName: "Stroke Weight"
        },
        {
          prefix: "Padding",
          pattern: /^Padding (Top|Bottom|Left|Right)$/,
          extractSubName: (prop) => prop.replace("Padding ", ""),
          groupName: "Padding"
        }
      ];

      // Chercher les groupes potentiels
      for (const group of groups) {
        const matchingProps = items.filter(item =>
          group.pattern.test(item.property) && !processed.has(item)
        );

        if (matchingProps.length > 1) {
          // Créer un groupe
          result.push({
            isGroup: true,
            groupName: group.groupName,
            properties: matchingProps.map(prop => ({
              ...prop,
              subName: group.extractSubName(prop.property)
            }))
          });

          // Marquer ces propriétés comme traitées
          matchingProps.forEach(p => processed.add(p));
        }
      }

      // Ajouter les propriétés restantes non groupées
      for (const item of items) {
        if (!processed.has(item)) {
          result.push(item);
        }
      }

      return result;
    }

    // Fonction pour grouper les propriétés non liées similaires
    function groupSimilarUnboundProperties(items) {
      const result = [];
      const processed = new Set();

      // Groupes potentiels et leurs préfixes
      const groups = [
        {
          prefix: "Radius",
          pattern: /^(Top|Bottom) (Left|Right) Radius$/,
          extractSubName: (prop) => prop.replace(" Radius", ""),
          groupName: "Radius"
        },
        {
          prefix: "Stroke Weight",
          pattern: /^Stroke (Top|Bottom|Left|Right) Weight$/,
          extractSubName: (prop) => prop.replace("Stroke ", "").replace(" Weight", ""),
          groupName: "Stroke Weight"
        },
        {
          prefix: "Padding",
          pattern: /^Padding (Top|Bottom|Left|Right)$/,
          extractSubName: (prop) => prop.replace("Padding ", ""),
          groupName: "Padding"
        }
      ];

      // Chercher les groupes potentiels
      for (const group of groups) {
        const matchingProps = items.filter(item =>
          group.pattern.test(item.property) && !processed.has(item)
        );

        if (matchingProps.length > 1) {
          // Créer un groupe
          result.push({
            isGroup: true,
            groupName: group.groupName,
            properties: matchingProps.map(prop => ({
              ...prop,
              subName: group.extractSubName(prop.property)
            }))
          });

          // Marquer ces propriétés comme traitées
          matchingProps.forEach(p => processed.add(p));
        }
      }

      // Ajouter les propriétés restantes non groupées
      for (const item of items) {
        if (!processed.has(item)) {
          result.push(item);
        }
      }

      return result;
    }
  <\/script>
</body>

</html>`,T=`body {
    font-family: Inter, sans-serif;
    margin: 0;
    padding: 1rem;
    position: relative;
    min-height: 100vh;
    box-sizing: border-box;
    overflow: auto;
    min-height: 200px;
  }

  h2 {
    font-size: 1.125rem;
    font-weight: bold;
    margin: 1em 0 0.5em;
  }

  strong {
    font-weight: 600;
  }

  .layer-section h3 {
    margin: 0.5em 0 1em;
    font-size: 1rem;
    font-weight: bold;
  }

  .layer-section ul {
    padding-left: 8px;
    margin: 0;
  }

  .layer-section li {
    list-style: none;
    margin-bottom: 0.5em;
  }

  .warning {
    background: #ffdcdc;
    padding: 12px;
    margin-bottom: 1em;
    border-radius: 6px;
    color: #B12020;
  }

  .warning h3 {
    margin-top: 0;
    font-size: 1rem;
    line-height: 1rem;
    color: #8F0000;
  }

  .resize-handle {
    position: fixed;
    bottom: 0;
    right: 0;
    width: 20px;
    height: 20px;
    cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 50%, #ccc 50%);
    z-index: 1000;
  }

  .resize-handle:hover {
    background: linear-gradient(135deg, transparent 50%, #999 50%);
  }

  /* Assure que le contenu ne cache pas la poignée */
  #app {
    padding-bottom: 20px;
    margin-right: 20px;
    min-height: 200px;
  }

  .section {
    margin-bottom: 24px;
  }

  .section-header {
    font-weight: 600;
    font-size: 12px;
    margin-bottom: 8px;
    color: #333;
    letter-spacing: 0.01em;
    text-transform: uppercase;
  }

  .layer-section {
    margin-bottom: 16px;
    border-bottom: 1px solid #e6e6e6;
    padding-bottom: 16px;
  }

  .layer-section:last-child {
    border-bottom: none;
  }

  .layer-name {
    font-weight: 500;
    margin-bottom: 8px;
    font-size: 13px;
    color: #000;
  }

  .layer-type-label {
    font-size: 0.8em;
    color: #666;
    margin-left: 0.5em;
    font-weight: normal;
  }

  .variable-pill {
    padding: 6px 12px 6px 6px;
    border-radius: 6px;
    font-size: 12px;
    display: flex;
    gap: 2px;
    align-items: center;
    font-weight: 500;
    white-space: nowrap;
    line-height: 20px;
    transition: all 0.15s ease;
    width: fit-content;
  }

  .local-variable {
    background-color: #e3f1ff;
    color: #1969d2;
  }

  .external-variable {
    background-color: #eee8ff;
    color: #6451cf;
  }

  /* Styles pour les groupes de propriétés */
  .property-group-title {
    font-weight: 600;
    margin-bottom: 0.3em;
    display: flex;
    align-items: center;
  }

  .property-sub-list {
    padding-left: 1em;
    margin: 0.3em 0 0.8em;
  }

  .property-sub-list li {
    display: flex;
    align-items: center;
    margin-bottom: 0.3em;
  }

  .sub-property-name {
    width: 100px;
    font-size: 0.9em;
    color: #555;
  }

  /* Styles pour les propriétés principales */
  .main-property-container {
    display: flex;
    flex-direction: column;
    margin-bottom: 0.8em;
  }

  .main-property-name {
    font-weight: 600;
    margin-bottom: 0.4em;
  }

  /* Ancien style pour les icônes carrées */
  .variable-type-icon {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-right: 0.4em;
    border-radius: 2px;
  }

  /* Nouveaux styles pour les icônes SVG de type */
  .variable-type-svg-icon {
    width: 20px;
    height: 20px;
  }

  .variable-type-svg-icon svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }`,d={FILL:"Fill",STROKE:"Stroke",STROKE_COLOR:"Stroke Color",OPACITY:"Opacity",STROKE_WEIGHT:"Stroke Weight",CORNER_RADIUS:"Corner Radius",FONT_SIZE:"Font Size",FONT_WEIGHT:"Font Weight",FONT_FAMILY:"Font Family",LETTER_SPACING:"Letter Spacing",LINE_HEIGHT:"Line Height",PARAGRAPH_SPACING:"Paragraph Spacing",PADDING_LEFT:"Padding Left",PADDING_RIGHT:"Padding Right",PADDING_TOP:"Padding Top",PADDING_BOTTOM:"Padding Bottom",ITEM_SPACING:"Gap"},N={FILL:"Fill",STROKE:"Stroke",STROKE_COLOR:"Stroke Color",OPACITY:"Opacity",STROKE_WEIGHT:"Stroke Weight",CORNER_RADIUS:"Corner Radius",FONT_SIZE:"Font Size",FONT_WEIGHT:"Font Weight",FONT_FAMILY:"Font Family",LETTER_SPACING:"Letter Spacing",LINE_HEIGHT:"Line Height",PARAGRAPH_SPACING:"Paragraph Spacing"},b={itemSpacing:"Gap",paddingTop:"Padding Top",paddingRight:"Padding Right",paddingBottom:"Padding Bottom",paddingLeft:"Padding Left",cornerRadius:"Corner Radius",strokeWeight:"Stroke Weight",opacity:"Opacity",fontSize:"Font Size",fontWeight:"Font Weight",fontName:"Font Family",letterSpacing:"Letter Spacing",lineHeight:"Line Height",paragraphSpacing:"Paragraph Spacing",paragraphIndent:"Paragraph Indent",textCase:"Text Case",textDecoration:"Text Decoration",textAlignHorizontal:"Text Align Horizontal",textAlignVertical:"Text Align Vertical",topLeftRadius:"Top Left Radius",topRightRadius:"Top Right Radius",bottomLeftRadius:"Bottom Left Radius",bottomRightRadius:"Bottom Right Radius",strokeTopWeight:"Stroke Top Weight",strokeBottomWeight:"Stroke Bottom Weight",strokeLeftWeight:"Stroke Left Weight",strokeRightWeight:"Stroke Right Weight",width:"Width",height:"Height"},k=P.replace("</head>",`<style>${T}</style></head>`);figma.showUI(k,{width:300,height:400,title:"Variable Inspector"});figma.ui.onmessage=e=>{e.type==="resize"&&figma.ui.resize(e.width,e.height)};figma.on("selectionchange",R);R();const I=new Set,C=new Set;function f(e,a,i){return i?`${e}|${a}|${i}`:`${e}|${a}`}function E(){I.clear(),C.clear()}function m(e,a,i){const s=f(e,a,i);return console.log(`Checking property: ${s}, propertyName: ${a}, exists: ${C.has(s)}`),["paddingLeft","paddingRight","paddingTop","paddingBottom","itemSpacing","gap"].some(t=>a.includes(t))?(console.log(`Skipping deduplication for spacing property: ${a}`),C.add(s),!1):C.has(s)?!0:(C.add(s),!1)}async function A(){const e=new Map,a=figma.variables.getLocalVariableCollections();for(const t of a)for(const n of t.variableIds){const o=await figma.variables.getVariableByIdAsync(n);if(!o)continue;let p;if(o.resolvedType==="COLOR"){const c=Object.keys(o.valuesByMode);if(c.length>0){const l=o.valuesByMode[c[0]];typeof l=="object"&&("r"in l||"g"in l||"b"in l)&&(p=l)}}e.set(n,{name:o.name,type:o.resolvedType,origin:"local",colorValue:p})}const i=figma.currentPage.selection,s=v(i),r=new Set;for(const t of s){const n=S(t);for(const{id:o}of n)e.has(o)||r.add(o)}for(const t of r)try{const n=await figma.variables.getVariableByIdAsync(t);if(!n)continue;const o=await figma.variables.importVariableByKeyAsync(n.key);if(o){let p;if(o.resolvedType==="COLOR"){const c=Object.keys(o.valuesByMode);if(c.length>0){const l=o.valuesByMode[c[0]];typeof l=="object"&&("r"in l||"g"in l||"b"in l)&&(p=l)}}e.set(t,{name:o.name,type:o.resolvedType,origin:"external",colorValue:p})}}catch(n){console.warn(`Failed to import variable ${t}:`,n)}return console.log("loadVariables: found",e.size,"variables"),e}function x(e,a){const i=[];"fills"in e&&Array.isArray(e.fills)&&i.push(...e.fills),"backgrounds"in e&&Array.isArray(e.backgrounds)&&i.push(...e.backgrounds);const s=new Set,r=new Set;for(const t of i){const n=t,o=n.boundVariables&&n.boundVariables.color;o&&o.id&&!s.has(o.id)&&(r.add(o.id),s.add(o.id))}if(r.size>0){const t=Array.from(r)[0];a.push({layer:e.name,property:N.FILL,id:t}),r.size>1&&console.log(`${e.name} a ${r.size} variables de remplissage, seule la première est affichée`)}}function O(e,a){if("strokes"in e&&Array.isArray(e.strokes))for(const i of e.strokes){const s=i,r=s.boundVariables&&s.boundVariables.color;r&&r.id&&a.push({layer:e.name,property:d.STROKE_COLOR,id:r.id})}}function V(e,a){if("effects"in e&&Array.isArray(e.effects)){for(const i of e.effects)if(i.boundVariables)for(const[s,r]of Object.entries(i.boundVariables)){const t=r;if(t.id){const n=`Effect ${s}`;a.push({layer:e.name,property:n,id:t.id})}}}}function M(e,a){const i=e.boundVariables;if(i){const r=new Set(["color","fills","fills.0"]);for(const[t,n]of Object.entries(i)){if(r.has(t)||t.startsWith("fills."))continue;const o=n;if(o.id){const p=b[t]||t;a.push({layer:e.name,property:p,id:o.id})}}}const s=["topLeftRadius","topRightRadius","bottomLeftRadius","bottomRightRadius","strokeTopWeight","strokeBottomWeight","strokeLeftWeight","strokeRightWeight"];for(const r of s)if(e[r]!==void 0&&i&&i[r]&&i[r].id){const t=b[r]||r;a.push({layer:e.name,property:t,id:i[r].id})}}function w(e,a){const i=e.boundVariables,s={fontSize:d.FONT_SIZE,fontWeight:d.FONT_WEIGHT,fontFamily:d.FONT_FAMILY,letterSpacing:d.LETTER_SPACING,lineHeight:d.LINE_HEIGHT,paragraphSpacing:d.PARAGRAPH_SPACING};if(i){for(const[n,o]of Object.entries(s))i[n]&&i[n].id&&(a.push({layer:e.name,property:o,id:i[n].id}),n==="fontSize"&&I.add(e.id));const r={},t=(n,o=[])=>{if(n&&typeof n=="object"){if(n.id&&typeof n.id=="string"){const p=o.join(".");if(p.startsWith("fills.")||p==="fills")return;r[p]||(r[p]=[]),r[p].push(n.id)}for(const p of Object.keys(n))p==="fills"||o.length>0&&o[0]==="fills"||t(n[p],[...o,p])}};t(i);for(const[n,o]of Object.entries(r)){let p=n;for(const[c,l]of Object.entries(s))if(n.includes(c)){p=l,c==="fontSize"&&I.add(e.id);break}p===n&&(p=b[n]||n);for(const c of o)a.push({layer:e.name,property:p,id:c})}}}function S(e){const a=[];return x(e,a),O(e,a),V(e,a),e.type==="TEXT"&&w(e,a),M(e,a),a}function v(e){const a=[],i=[...e];for(;i.length>0;){const s=i.pop();a.push(s),"children"in s&&Array.isArray(s.children)&&i.push(...s.children)}return a}function H(e,a){if("fills"in e&&Array.isArray(e.fills))for(let i=0;i<e.fills.length;i++){const r=e.fills[i],t=r.boundVariables&&r.boundVariables.color;if(!t||!t.id){const n=r.color;a.push({layer:e.name,property:N.FILL,value:`rgb(${Math.round(n.r*255)}, ${Math.round(n.g*255)}, ${Math.round(n.b*255)})`})}}if("strokes"in e&&Array.isArray(e.strokes)){let i=!1,s;for(let r=0;r<e.strokes.length&&!i;r++){const n=e.strokes[r],o=n.boundVariables&&n.boundVariables.color;(!o||!o.id)&&(i=!0,s=n.color)}i&&s&&(m(e.id,N.STROKE)||a.push({layer:e.name,property:N.STROKE,value:`rgb(${Math.round(s.r*255)}, ${Math.round(s.g*255)}, ${Math.round(s.b*255)})`}),e.strokes.length>1&&console.log(`${e.name} a ${e.strokes.length} contours, seul le premier non lié est affiché`))}}function W(e,a){const i=e.boundVariables,s=i&&i.opacity;if("opacity"in e&&typeof e.opacity=="number"&&(!s||!s.id)){const t=e.opacity;t<1&&(f(e.id,d.OPACITY),m(e.id,d.OPACITY)||a.push({layer:e.name,property:d.OPACITY,value:t.toString()}))}if("strokeWeight"in e&&"strokes"in e&&Array.isArray(e.strokes)&&e.strokes.length>0){const n=e.strokeWeight,o=i&&i.strokeWeight,p=o&&o.id;typeof n=="number"&&n!==0&&!p&&!("strokeTopWeight"in e||"strokeBottomWeight"in e||"strokeLeftWeight"in e||"strokeRightWeight"in e)&&(f(e.id,d.STROKE_WEIGHT),m(e.id,d.STROKE_WEIGHT)||a.push({layer:e.name,property:d.STROKE_WEIGHT,value:n.toString()})),["strokeTopWeight","strokeBottomWeight","strokeLeftWeight","strokeRightWeight"].forEach(c=>{if(c in e){const l=e[c],u=i&&i[c],g=u&&u.id;if(typeof l=="number"&&l!==0&&!g){const y=b[c]||c;f(e.id,y),m(e.id,y)||a.push({layer:e.name,property:y,value:l.toString()})}}})}if("cornerRadius"in e){const t=e.cornerRadius,n=i&&i.cornerRadius,o=n&&n.id;typeof t=="number"&&t!==0&&!o&&!("topLeftRadius"in e||"topRightRadius"in e||"bottomLeftRadius"in e||"bottomRightRadius"in e)&&(f(e.id,d.CORNER_RADIUS),m(e.id,d.CORNER_RADIUS)||a.push({layer:e.name,property:d.CORNER_RADIUS,value:t.toString()}))}if(["topLeftRadius","topRightRadius","bottomLeftRadius","bottomRightRadius"].forEach(t=>{if(t in e){const n=e[t],o=i&&i[t],p=o&&o.id;if(typeof n=="number"&&n!==0&&!p){const c=b[t]||t;f(e.id,c),m(e.id,c)||a.push({layer:e.name,property:c,value:n.toString()})}}}),e.type==="TEXT"){const t=e,n=[{key:"fontSize",displayName:d.FONT_SIZE,skipIfProcessed:!0},{key:"letterSpacing",displayName:d.LETTER_SPACING},{key:"lineHeight",displayName:d.LINE_HEIGHT},{key:"paragraphSpacing",displayName:d.PARAGRAPH_SPACING}];for(const{key:o,displayName:p,skipIfProcessed:c}of n){if(c&&o==="fontSize"&&I.has(t.id))continue;const l=t[o],u=i&&i[o],g=u&&u.id;f(e.id,p),typeof l=="number"&&l!==0&&!g&&!m(e.id,p)&&a.push({layer:e.name,property:p,value:l.toString()})}}const r=[{key:"paddingLeft",displayName:d.PADDING_LEFT},{key:"paddingRight",displayName:d.PADDING_RIGHT},{key:"paddingTop",displayName:d.PADDING_TOP},{key:"paddingBottom",displayName:d.PADDING_BOTTOM},{key:"itemSpacing",displayName:d.ITEM_SPACING}];for(const{key:t,displayName:n}of r)if(t in e){const o=e[t],p=i&&i[t],c=p&&p.id;typeof o=="number"&&!c&&(o!==0||!["paddingLeft","paddingRight","paddingTop","paddingBottom","itemSpacing","gap"].includes(t))&&(console.log(`Found spacing property ${t} = ${o} on node ${e.name}`),m(e.id,n)||a.push({layer:e.name,property:n,value:o.toString()}))}}function G(e){const a={};console.log(`Grouping ${e.length} usages by layer`);const i=new Map,s=[...e].sort((r,t)=>{const n=r.layer.localeCompare(t.layer);return n!==0?n:r.property.localeCompare(t.property)});for(const r of s){a[r.layer]||(a[r.layer]=[],i.set(r.layer,new Set));const t=i.get(r.layer),n=`${r.property}_${r.id||""}`,p=["paddingLeft","paddingRight","paddingTop","paddingBottom","itemSpacing","gap"].some(c=>r.property.includes(c));console.log(`Layer: ${r.layer}, Property: ${r.property}, isSpacing: ${p}, isDuplicate: ${t.has(n)}`),(!t.has(n)||p)&&(a[r.layer].push(r),t.add(n))}for(const[r,t]of Object.entries(a))console.log(`Layer ${r}: ${t.length} usages after grouping`);return a}async function R(){E();const e=await A(),a=figma.currentPage.selection,i=v(a),s=[],r=[],t=new Map;let n=0;const o=(l,u)=>{if(t.set(l.id,{id:l.id,name:l.name,order:n++,parent:u,type:l.type}),"children"in l&&Array.isArray(l.children))for(const g of l.children)o(g,l.id)};for(const l of i)if(!t.has(l.id)){let u;"parent"in l&&l.parent&&"id"in l.parent&&(u=l.parent.id),o(l,u)}for(const l of i){const u=S(l);for(const{layer:g,property:y,id:L}of u){const h=e.get(L);h&&s.push({layer:g,layerId:l.id,property:y,name:h.name,type:h.type,origin:h.origin,colorValue:h.colorValue,id:L})}H(l,r),W(l,r)}const p=G(s);console.log("Final usages count:",s.length),console.log("Layers with variables:",Object.keys(p).length),console.log("Unbound usages count:",r.length),console.log("Total nodes in layerInfoMap:",t.size);const c=s.length===0&&r.length===0;figma.ui.postMessage({byLayer:p,unbound:r,layerInfoMap:Object.fromEntries(t),noVariablesFound:c})}
