import OBR, {
  buildLabel,
  buildShape,
  isImage,
} from "https://unpkg.com/@owlbear-rodeo/sdk@latest/dist/index.mjs";

export { OBR };

export const EXTENSION_ID = "com.codex.body-hp";
export const META_KEY = `${EXTENSION_ID}/data`;
export const OVERLAY_KEY = `${EXTENSION_ID}/overlayFor`;
export const OVERLAY_META_KEY = `${EXTENSION_ID}/overlayMeta`;
export const BODY_ORDER = ["L.Arm", "Head", "R.Arm", "L.Leg", "Torso", "R.Leg"];

export const BODY_DEFAULTS = {
  "L.Arm": { current: 2, max: 2, armor: 2 },
  Head: { current: 1, max: 1, armor: 0 },
  "R.Arm": { current: 2, max: 2, armor: 2 },
  "L.Leg": { current: 2, max: 2, armor: 2 },
  Torso: { current: 3, max: 3, armor: 6 },
  "R.Leg": { current: 2, max: 2, armor: 2 },
};

export const DEFAULT_TRACKER_DATA = {
  enabled: true,
  minor: 0,
  serious: 0,
  body: structuredClone(BODY_DEFAULTS),
};

export function deepClone(value) {
  return structuredClone(value);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeTrackerData(raw) {
  const next = deepClone(DEFAULT_TRACKER_DATA);
  if (!raw || typeof raw !== "object") return next;

  next.enabled = raw.enabled !== false;
  next.minor = clamp(Number(raw.minor ?? 0) || 0, 0, 4);
  next.serious = clamp(Number(raw.serious ?? 0) || 0, 0, 2);

  for (const partName of BODY_ORDER) {
    const source = raw.body?.[partName] ?? {};
    const part = next.body[partName];
    part.max = clamp(Number(source.max ?? part.max) || part.max, 0, 99);
    part.current = clamp(
      Number(source.current ?? part.current) || part.current,
      0,
      part.max
    );
    part.armor = clamp(Number(source.armor ?? part.armor) || part.armor, 0, 99);
  }

  return next;
}

export function getTrackerData(item) {
  return sanitizeTrackerData(item?.metadata?.[META_KEY]);
}

export function isCharacterToken(item) {
  return Boolean(item) && isImage(item) && item.layer === "CHARACTER";
}

export function isTrackedCharacter(item) {
  return isCharacterToken(item) && item.metadata?.[META_KEY]?.enabled === true;
}

export function isOverlayItem(item) {
  return Boolean(item?.metadata?.[OVERLAY_KEY]);
}

export function getCharacterName(item) {
  if (!item) return "Unnamed character";
  const byName = typeof item.name === "string" ? item.name.trim() : "";
  if (byName) return byName;
  return `Character ${item.id.slice(0, 6)}`;
}

export function sortCharacters(items) {
  return [...items].sort((left, right) =>
    getCharacterName(left).localeCompare(getCharacterName(right))
  );
}

export function formatOverlayText(data) {
  const body = data.body;
  return [
    `L.Arm ${body["L.Arm"].current}/${body["L.Arm"].max}(${body["L.Arm"].armor}) | Head ${body["Head"].current}/${body["Head"].max}(${body["Head"].armor}) | R.Arm ${body["R.Arm"].current}/${body["R.Arm"].max}(${body["R.Arm"].armor})`,
    `L.Leg ${body["L.Leg"].current}/${body["L.Leg"].max}(${body["L.Leg"].armor}) | Torso ${body["Torso"].current}/${body["Torso"].max}(${body["Torso"].armor}) | R.Leg ${body["R.Leg"].current}/${body["R.Leg"].max}(${body["R.Leg"].armor})`,
  ].join("\n");
}

export function getBodyTotals(data) {
  return BODY_ORDER.reduce(
    (accumulator, partName) => {
      accumulator.current += data.body[partName].current;
      accumulator.max += data.body[partName].max;
      return accumulator;
    },
    { current: 0, max: 0 }
  );
}

function getOverlayMetadata(tokenId, kind, index = null) {
  return {
    [OVERLAY_KEY]: tokenId,
    [OVERLAY_META_KEY]: {
      kind,
      index,
    },
  };
}

function getTokenDimensions(token) {
  return {
    width: Math.max(1, Number(token?.width) || 140),
    height: Math.max(1, Number(token?.height) || 140),
  };
}

function buildOverlayCard(token, data) {
  const { width: tokenWidth } = getTokenDimensions(token);
  const width = Math.max(360, Math.round(tokenWidth * 2.55));
  const height = 72;
  const offsetX = tokenWidth / 2 + width / 2 + 18;

  return buildLabel()
    .name(`Body HP: ${getCharacterName(token)}`)
    .plainText(formatOverlayText(data))
    .width(width)
    .height(height)
    .padding(10)
    .fontSize(13)
    .fontWeight(600)
    .lineHeight(1.18)
    .textAlign("LEFT")
    .textAlignVertical("MIDDLE")
    .fillColor("#f8fafc")
    .backgroundColor("#020617")
    .backgroundOpacity(0.58)
    .strokeColor("#cbd5e1")
    .strokeOpacity(0.45)
    .strokeWidth(1)
    .cornerRadius(12)
    .pointerDirection("LEFT")
    .pointerWidth(10)
    .pointerHeight(12)
    .position({ x: offsetX, y: 0 })
    .attachedTo(token.id)
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .metadata(getOverlayMetadata(token.id, "body-card"))
    .build();
}

function buildMinorDots(token, data) {
  const items = [];
  const { width, height } = getTokenDimensions(token);
  const startX = -width / 2 + 12;
  const y = height / 2 - 12;

  for (let index = 0; index < data.minor; index += 1) {
    items.push(
      buildShape()
        .shapeType("CIRCLE")
        .width(8)
        .height(8)
        .position({ x: startX + index * 10, y })
        .attachedTo(token.id)
        .layer("ATTACHMENT")
        .locked(true)
        .disableHit(true)
        .fillColor("#f59e0b")
        .fillOpacity(0.98)
        .strokeColor("#111827")
        .strokeWidth(1)
        .metadata(getOverlayMetadata(token.id, "minor", index))
        .build()
    );
  }

  return items;
}

function buildSeriousBars(token, data) {
  const items = [];
  const { width, height } = getTokenDimensions(token);
  const x = width / 2 - 12;
  const startY = -height / 2 + 13;

  for (let index = 0; index < data.serious; index += 1) {
    items.push(
      buildShape()
        .shapeType("RECTANGLE")
        .width(4)
        .height(18)
        .position({ x: x - index * 8, y: startY })
        .attachedTo(token.id)
        .layer("ATTACHMENT")
        .locked(true)
        .disableHit(true)
        .fillColor("#ef4444")
        .fillOpacity(0.98)
        .strokeColor("#111827")
        .strokeWidth(1)
        .cornerRadius(2)
        .metadata(getOverlayMetadata(token.id, "serious", index))
        .build()
    );
  }

  return items;
}

export function buildOverlayItems(token, data) {
  return [
    buildOverlayCard(token, data),
    ...buildMinorDots(token, data),
    ...buildSeriousBars(token, data),
  ];
}

export async function updateTrackerData(tokenId, updater) {
  await OBR.scene.items.updateItems([tokenId], (items) => {
    const token = items[0];
    if (!token) return;
    token.metadata ??= {};
    token.metadata[META_KEY] = sanitizeTrackerData(updater(getTrackerData(token)));
  });
}

export async function removeOverlaysForToken(tokenId, items) {
  const sceneItems = items ?? (await OBR.scene.items.getItems());
  const overlayIds = sceneItems
    .filter((item) => item.metadata?.[OVERLAY_KEY] === tokenId)
    .map((item) => item.id);

  if (overlayIds.length) {
    await OBR.scene.items.deleteItems(overlayIds);
  }
}

export async function ensureOverlayForToken(tokenId, items) {
  const sceneItems = items ?? (await OBR.scene.items.getItems());
  const token = sceneItems.find((item) => item.id === tokenId);
  if (!token || !isCharacterToken(token)) return;

  const existingOverlays = sceneItems.filter((item) => item.metadata?.[OVERLAY_KEY] === tokenId);

  if (!isTrackedCharacter(token)) {
    if (existingOverlays.length) {
      await OBR.scene.items.deleteItems(existingOverlays.map((item) => item.id));
    }
    return;
  }

  const data = getTrackerData(token);
  const overlaySignature = JSON.stringify(
    existingOverlays.map((item) => ({
      kind: item.metadata?.[OVERLAY_META_KEY]?.kind ?? null,
      index: item.metadata?.[OVERLAY_META_KEY]?.index ?? null,
      text: typeof item.text?.plainText === "string" ? item.text.plainText : null,
      width: item.width ?? null,
      height: item.height ?? null,
      position: item.position ?? null,
      attachedTo: item.attachedTo ?? null,
      name: item.name ?? null,
    }))
  );

  const expectedItems = buildOverlayItems(token, data);
  const expectedSignature = JSON.stringify(
    expectedItems.map((item) => ({
      kind: item.metadata?.[OVERLAY_META_KEY]?.kind ?? null,
      index: item.metadata?.[OVERLAY_META_KEY]?.index ?? null,
      text: typeof item.text?.plainText === "string" ? item.text.plainText : null,
      width: item.width ?? null,
      height: item.height ?? null,
      position: item.position ?? null,
      attachedTo: item.attachedTo ?? null,
      name: item.name ?? null,
    }))
  );

  if (existingOverlays.length && overlaySignature === expectedSignature) {
    return;
  }

  if (existingOverlays.length) {
    await OBR.scene.items.deleteItems(existingOverlays.map((item) => item.id));
  }

  await OBR.scene.items.addItems(expectedItems);
}

export async function setTrackedState(tokenId, enabled) {
  if (enabled) {
    await updateTrackerData(tokenId, (current) => ({ ...current, enabled: true }));
    await ensureOverlayForToken(tokenId);
    return;
  }

  await OBR.scene.items.updateItems([tokenId], (items) => {
    const token = items[0];
    if (!token) return;
    token.metadata ??= {};
    delete token.metadata[META_KEY];
  });

  await removeOverlaysForToken(tokenId);
}

export async function syncTrackedOverlays() {
  const items = await OBR.scene.items.getItems();
  const byId = new Map(items.map((item) => [item.id, item]));

  const staleOverlayIds = items
    .filter(isOverlayItem)
    .filter((item) => {
      const token = byId.get(item.metadata[OVERLAY_KEY]);
      return !token || !isTrackedCharacter(token);
    })
    .map((item) => item.id);

  if (staleOverlayIds.length) {
    await OBR.scene.items.deleteItems(staleOverlayIds);
  }

  const trackedTokens = items.filter(isTrackedCharacter);
  for (const token of trackedTokens) {
    await ensureOverlayForToken(token.id, items);
  }
}
