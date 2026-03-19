import OBR, { buildImage, isImage } from "@owlbear-rodeo/sdk";

export { OBR };

export const EXTENSION_ID = "com.codex.body-hp";
export const META_KEY = `${EXTENSION_ID}/data`;
export const OVERLAY_KEY = `${EXTENSION_ID}/overlayFor`;
export const BODY_ORDER = ["L.Arm", "Head", "R.Arm", "L.Leg", "Torso", "R.Leg"];

const SVG_SIZE = 512;
const SVG_CENTER = SVG_SIZE / 2;
const OUTER_RADIUS = 244;
const INNER_RADIUS = 170;
const TEXT_RADIUS = (OUTER_RADIUS + INNER_RADIUS) / 2;
const SECTOR_HALF_SPAN = 26;
const RING_COLORS = {
  full: "#73FF5A",
  half: "#FFAF22",
  kaputt: "#FF460D",
  border: "#2A1200",
  shadow: "rgba(0, 0, 0, 0.24)",
  text: "#0A0F12",
  textStroke: "rgba(255, 255, 255, 0.72)",
};
const BODY_RING_LAYOUT = [
  { part: "Head", angle: -90 },
  { part: "R.Arm", angle: -30 },
  { part: "R.Leg", angle: 30 },
  { part: "Torso", angle: 90 },
  { part: "L.Leg", angle: 150 },
  { part: "L.Arm", angle: 210 },
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

export function formatOverlayText(data) {
  const body = data.body;
  return [
    `Head ${body.Head.current}/${body.Head.max} | R.Arm ${body["R.Arm"].current}/${body["R.Arm"].max} | L.Arm ${body["L.Arm"].current}/${body["L.Arm"].max}`,
    `L.Leg ${body["L.Leg"].current}/${body["L.Leg"].max} | Torso ${body.Torso.current}/${body.Torso.max} | R.Leg ${body["R.Leg"].current}/${body["R.Leg"].max}`,
  ].join("\n");
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

  return {
    center,
    width,
    height,
    gridDpi,
    visibleDiameter,
    overlayDiameter: visibleDiameter * 1.52,
  };
}

function toPolarPoint(radius, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: SVG_CENTER + radius * Math.cos(radians),
    y: SVG_CENTER + radius * Math.sin(radians),
  };
}

function describeSectorPath(startAngle, endAngle) {
  const outerStart = toPolarPoint(OUTER_RADIUS, startAngle);
  const outerEnd = toPolarPoint(OUTER_RADIUS, endAngle);
  const innerEnd = toPolarPoint(INNER_RADIUS, endAngle);
  const innerStart = toPolarPoint(INNER_RADIUS, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${largeArcFlag} 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArcFlag} 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

function getPartColor(part) {
  if (part.current <= 0 || part.max <= 0) return RING_COLORS.kaputt;
  if (part.current < part.max) return RING_COLORS.half;
  return RING_COLORS.full;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildRingSvg(data) {
  const sectors = BODY_RING_LAYOUT.map(({ part, angle }) => {
    const bodyPart = data.body[part];
    const path = describeSectorPath(angle - SECTOR_HALF_SPAN, angle + SECTOR_HALF_SPAN);
    const textPoint = toPolarPoint(TEXT_RADIUS, angle);
    const label = `${bodyPart.current}/${bodyPart.max}`;

    return `
      <path
        d="${path}"
        fill="${getPartColor(bodyPart)}"
        stroke="${RING_COLORS.border}"
        stroke-width="6"
        stroke-linejoin="round"
      />
      <text
        x="${textPoint.x.toFixed(2)}"
        y="${textPoint.y.toFixed(2)}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Segoe UI, Arial, sans-serif"
        font-size="30"
        font-weight="800"
        fill="${RING_COLORS.text}"
        stroke="${RING_COLORS.textStroke}"
        stroke-width="6"
        paint-order="stroke"
      >${escapeXml(label)}</text>
    `;
  }).join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${SVG_SIZE}" height="${SVG_SIZE}" viewBox="0 0 ${SVG_SIZE} ${SVG_SIZE}">
      <defs>
        <filter id="ringShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="${RING_COLORS.shadow}" />
        </filter>
      </defs>
      <g filter="url(#ringShadow)">
        ${sectors}
        <circle
          cx="${SVG_CENTER}"
          cy="${SVG_CENTER}"
          r="${OUTER_RADIUS - 2}"
          fill="none"
          stroke="${RING_COLORS.border}"
          stroke-width="4"
        />
        <circle
          cx="${SVG_CENTER}"
          cy="${SVG_CENTER}"
          r="${INNER_RADIUS + 2}"
          fill="none"
          stroke="${RING_COLORS.border}"
          stroke-width="4"
        />
      </g>
    </svg>
  `.trim();
}

function buildRingOverlay(token, data, metrics) {
  const svg = buildRingSvg(data);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const imageDpi = (SVG_SIZE * metrics.gridDpi) / metrics.overlayDiameter;

  return buildImage(
    {
      width: SVG_SIZE,
      height: SVG_SIZE,
      mime: "image/svg+xml",
      url: dataUrl,
    },
    {
      offset: { x: 0, y: 0 },
      dpi: imageDpi,
    },
  )
    .name(`Body Ring: ${getCharacterName(token)}`)
    .position(metrics.center)
    .rotation(0)
    .attachedTo(token.id)
    .disableAttachmentBehavior(["ROTATION"])
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .metadata({ [OVERLAY_KEY]: token.id, kind: "body-ring" })
    .build();
}

export function buildOverlayItems(token, data, metrics) {
  return [buildRingOverlay(token, data, metrics)];
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
