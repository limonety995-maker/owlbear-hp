import OBR, {
  buildLabel,
  buildShape,
  isImage,
} from "@owlbear-rodeo/sdk";

export { OBR };

export const EXTENSION_ID = "com.codex.body-hp";
export const META_KEY = `${EXTENSION_ID}/data`;
export const OVERLAY_KEY = `${EXTENSION_ID}/overlayFor`;
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

function getEffectiveSize(token) {
  const scaleX = Math.abs(token.scale?.x ?? 1);
  const scaleY = Math.abs(token.scale?.y ?? 1);
  return {
    width: (token.width || 140) * scaleX,
    height: (token.height || 140) * scaleY,
  };
}

function getWorldPosition(token, offsetX, offsetY) {
  const radians = ((token.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: token.position.x + offsetX * cos - offsetY * sin,
    y: token.position.y + offsetX * sin + offsetY * cos,
  };
}

function buildOverlayCard(token, data) {
  const size = getEffectiveSize(token);
  const width = Math.max(360, Math.round(size.width * 2.55));
  const height = 72;
  const offsetX = size.width / 2 + width / 2 + 18;

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
    .position(getWorldPosition(token, offsetX, 0))
    .attachedTo(token.id)
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .metadata({ [OVERLAY_KEY]: token.id, kind: "body-card" })
    .build();
}

function buildMinorDots(token, data) {
  const items = [];
  const size = getEffectiveSize(token);
  const startX = -size.width / 2 + 12;
  const y = size.height / 2 - 12;

  for (let index = 0; index < data.minor; index += 1) {
    items.push(
      buildShape()
        .shapeType("CIRCLE")
        .width(8)
        .height(8)
        .position(getWorldPosition(token, startX + index * 10, y))
        .attachedTo(token.id)
        .layer("ATTACHMENT")
        .locked(true)
        .disableHit(true)
        .fillColor("#f59e0b")
        .fillOpacity(0.98)
        .strokeColor("#111827")
        .strokeWidth(1)
        .metadata({ [OVERLAY_KEY]: token.id, kind: "minor", index })
        .build()
    );
  }

  return items;
}

function buildSeriousBars(token, data) {
  const items = [];
  const size = getEffectiveSize(token);
  const x = size.width / 2 - 12;
  const startY = -size.height / 2 + 13;

  for (let index = 0; index < data.serious; index += 1) {
    items.push(
      buildShape()
        .shapeType("RECTANGLE")
        .width(4)
        .height(18)
        .position(getWorldPosition(token, x - index * 8, startY))
        .attachedTo(token.id)
        .layer("ATTACHMENT")
        .locked(true)
        .disableHit(true)
        .fillColor("#ef4444")
        .fillOpacity(0.98)
        .strokeColor("#111827")
        .strokeWidth(1)
        .cornerRadius(2)
        .metadata({ [OVERLAY_KEY]: token.id, kind: "serious", index })
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

  await removeOverlaysForToken(tokenId, sceneItems);

  if (!isTrackedCharacter(token)) return;

  await OBR.scene.items.addItems(buildOverlayItems(token, getTrackerData(token)));
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
