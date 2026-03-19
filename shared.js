import OBR, { Command, buildPath, isImage } from "@owlbear-rodeo/sdk";

export { OBR };

export const EXTENSION_ID = "com.codex.body-hp";
export const META_KEY = `${EXTENSION_ID}/data`;
export const OVERLAY_KEY = `${EXTENSION_ID}/overlayFor`;
export const BODY_ORDER = ["L.Arm", "Head", "R.Arm", "L.Leg", "Torso", "R.Leg"];

const VISUAL_VERSION = 3;
const RING_COLORS = {
  full: "#73FF5A",
  half: "#FFAF22",
  kaputt: "#FF460D",
  base: "#000000",
  border: "#050505",
};

const OUTER_SEGMENTS = [
  { part: "Head", angle: -90, span: 30 },
  { part: "R.Arm", angle: -18, span: 30 },
  { part: "R.Leg", angle: 54, span: 30 },
  { part: "L.Leg", angle: 126, span: 30 },
  { part: "L.Arm", angle: 198, span: 30 },
];

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
  visualVersion: VISUAL_VERSION,
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
  next.visualVersion = VISUAL_VERSION;

  for (const partName of BODY_ORDER) {
    const source = raw.body?.[partName] ?? {};
    const part = next.body[partName];
    part.max = clamp(Number(source.max ?? part.max) || part.max, 0, 99);
    part.current = clamp(
      Number(source.current ?? part.current) || part.current,
      0,
      part.max,
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
    getCharacterName(left).localeCompare(getCharacterName(right)),
  );
}

export function getBodyTotals(data) {
  return BODY_ORDER.reduce(
    (accumulator, partName) => {
      accumulator.current += data.body[partName].current;
      accumulator.max += data.body[partName].max;
      return accumulator;
    },
    { current: 0, max: 0 },
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

async function getTokenMetrics(token) {
  const effectiveSize = getEffectiveSize(token);
  let center = token.position;
  let width = effectiveSize.width;
  let height = effectiveSize.height;

  try {
    const bounds = await OBR.scene.items.getItemBounds([token.id]);
    if (bounds?.width > 0 && bounds?.height > 0) {
      center = bounds.center;
      width = bounds.width;
      height = bounds.height;
    }
  } catch (error) {
    console.warn("[Body HP] Unable to read token bounds, using fallback size", error);
  }

  let gridDpi = 150;
  try {
    gridDpi = (await OBR.scene.grid.getDpi()) || gridDpi;
  } catch (error) {
    console.warn("[Body HP] Unable to read grid dpi, using fallback size", error);
  }

  const scaleFactor = Math.max(
    Math.abs(token.scale?.x ?? 1),
    Math.abs(token.scale?.y ?? 1),
    1,
  );
  const visibleDiameter = Math.max(
    width,
    height,
    effectiveSize.width,
    effectiveSize.height,
    gridDpi * scaleFactor,
    56,
  );
  const outerRadius = visibleDiameter * 0.78;
  const outerThickness = Math.max(12, visibleDiameter * 0.12);
  const outerInnerRadius = outerRadius - outerThickness;
  const ringGap = Math.max(6, visibleDiameter * 0.035);
  const torsoOuterRadius = outerInnerRadius - ringGap;
  const torsoThickness = Math.max(7, visibleDiameter * 0.05);
  const torsoInnerRadius = torsoOuterRadius - torsoThickness;

  return {
    center,
    visibleDiameter,
    outerRadius,
    outerInnerRadius,
    torsoOuterRadius,
    torsoInnerRadius,
  };
}

function polar(radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: radius * Math.cos(radians),
    y: radius * Math.sin(radians),
  };
}

function arcPoints(radius, startAngle, endAngle, segments = 18) {
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const ratio = index / segments;
    const angle = startAngle + (endAngle - startAngle) * ratio;
    points.push(polar(radius, angle));
  }
  return points;
}

function buildAnnulusCommands(radiusOuter, radiusInner) {
  const outer = arcPoints(radiusOuter, -180, 180, 36);
  const inner = arcPoints(radiusInner, -180, 180, 36);
  const commands = [[Command.MOVE, outer[0].x, outer[0].y]];

  for (const point of outer.slice(1)) {
    commands.push([Command.LINE, point.x, point.y]);
  }

  commands.push([Command.CLOSE]);
  commands.push([Command.MOVE, inner[0].x, inner[0].y]);

  for (const point of inner) {
    commands.push([Command.LINE, point.x, point.y]);
  }

  commands.push([Command.CLOSE]);
  return commands;
}

function buildSectorCommands(radiusOuter, radiusInner, centerAngle, spanAngle) {
  const startAngle = centerAngle - spanAngle / 2;
  const endAngle = centerAngle + spanAngle / 2;
  const outer = arcPoints(radiusOuter, startAngle, endAngle, 10);
  const inner = arcPoints(radiusInner, endAngle, startAngle, 10);
  const commands = [[Command.MOVE, outer[0].x, outer[0].y]];

  for (const point of outer.slice(1)) {
    commands.push([Command.LINE, point.x, point.y]);
  }

  for (const point of inner) {
    commands.push([Command.LINE, point.x, point.y]);
  }

  commands.push([Command.CLOSE]);
  return commands;
}

function getPartColor(part) {
  if (part.max <= 0 || part.current <= 0) return RING_COLORS.kaputt;
  if (part.current < part.max) return RING_COLORS.half;
  return RING_COLORS.full;
}

function buildRingItem(token, metrics, kind, commands, fillColor, zIndex = 0, fillRule = "nonzero") {
  return buildPath()
    .name(`${kind}: ${getCharacterName(token)}`)
    .commands(commands)
    .fillRule(fillRule)
    .fillColor(fillColor)
    .fillOpacity(1)
    .strokeColor(RING_COLORS.border)
    .strokeOpacity(1)
    .strokeWidth(1)
    .position(metrics.center)
    .rotation(0)
    .zIndex(Date.now() + zIndex)
    .attachedTo(token.id)
    .disableAttachmentBehavior(["ROTATION"])
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .metadata({
      [OVERLAY_KEY]: token.id,
      kind,
      visualVersion: VISUAL_VERSION,
    })
    .build();
}

export function buildOverlayItems(token, data, metrics) {
  const items = [];

  items.push(
    buildRingItem(
      token,
      metrics,
      "outer-base",
      buildAnnulusCommands(metrics.outerRadius, metrics.outerInnerRadius),
      RING_COLORS.base,
      0,
      "evenodd",
    ),
  );

  for (const segment of OUTER_SEGMENTS) {
    items.push(
      buildRingItem(
        token,
        metrics,
        `segment-${segment.part}`,
        buildSectorCommands(
          metrics.outerRadius,
          metrics.outerInnerRadius,
          segment.angle,
          segment.span,
        ),
        getPartColor(data.body[segment.part]),
        1,
      ),
    );
  }

  items.push(
    buildRingItem(
      token,
      metrics,
      "torso-ring",
      buildAnnulusCommands(metrics.torsoOuterRadius, metrics.torsoInnerRadius),
      getPartColor(data.body.Torso),
      2,
      "evenodd",
    ),
  );

  return items;
}

export async function updateTrackerData(tokenId, updater) {
  await OBR.scene.items.updateItems([tokenId], (items) => {
    const token = items[0];
    if (!token) return;
    token.metadata ??= {};
    token.metadata[META_KEY] = sanitizeTrackerData(
      updater(getTrackerData(token)),
    );
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

  const metrics = await getTokenMetrics(token);
  await OBR.scene.items.addItems(
    buildOverlayItems(token, getTrackerData(token), metrics),
  );
}

export async function setTrackedState(tokenId, enabled) {
  if (enabled) {
    await updateTrackerData(tokenId, (current) => ({
      ...current,
      enabled: true,
    }));
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
  const trackedTokens = items.filter(isTrackedCharacter);

  const overlayIds = items.filter(isOverlayItem).map((item) => item.id);
  if (overlayIds.length) {
    await OBR.scene.items.deleteItems(overlayIds);
  }

  for (const token of trackedTokens) {
    const metrics = await getTokenMetrics(token);
    await OBR.scene.items.addItems(
      buildOverlayItems(token, getTrackerData(token), metrics),
    );
  }
}
