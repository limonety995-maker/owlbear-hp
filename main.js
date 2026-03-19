import OBR, { buildLabel, buildShape, isImage, isShape, isText, isLabel } from "https://unpkg.com/@owlbear-rodeo/sdk@latest/dist/index.mjs";

const EXTENSION_ID = "com.openai.body-hp-tracker";
const META_KEY = `${EXTENSION_ID}/data`;
const OVERLAY_KEY = `${EXTENSION_ID}/overlayFor`;

const BODY_ORDER = [
  "L.Arm",
  "Head",
  "R.Arm",
  "L.Leg",
  "Torso",
  "R.Leg",
];

const BODY_DEFAULTS = {
  "L.Arm": { current: 2, max: 2, armor: 2 },
  Head: { current: 1, max: 1, armor: 0 },
  "R.Arm": { current: 2, max: 2, armor: 2 },
  "L.Leg": { current: 2, max: 2, armor: 2 },
  Torso: { current: 3, max: 3, armor: 6 },
  "R.Leg": { current: 2, max: 2, armor: 2 },
};

const DEFAULT_DATA = {
  enabled: true,
  minor: 0,
  serious: 0,
  body: structuredClone(BODY_DEFAULTS),
};

const ui = {
  roleBadge: document.getElementById("roleBadge"),
  registerBtn: document.getElementById("registerBtn"),
  removeBtn: document.getElementById("removeBtn"),
  selectionInfo: document.getElementById("selectionInfo"),
  editor: document.getElementById("editor"),
  tokenName: document.getElementById("tokenName"),
  minorValue: document.getElementById("minorValue"),
  seriousValue: document.getElementById("seriousValue"),
  partsGrid: document.getElementById("partsGrid"),
};

let playerRole = "PLAYER";
let currentSelectionId = null;
let lastSceneItems = [];
let syncing = false;

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeData(raw) {
  const next = deepClone(DEFAULT_DATA);
  if (!raw || typeof raw !== "object") return next;

  next.enabled = raw.enabled !== false;
  next.minor = clamp(Number(raw.minor ?? 0) || 0, 0, 4);
  next.serious = clamp(Number(raw.serious ?? 0) || 0, 0, 2);

  for (const key of BODY_ORDER) {
    const src = raw.body?.[key] ?? {};
    next.body[key].max = clamp(Number(src.max ?? next.body[key].max) || next.body[key].max, 0, 99);
    next.body[key].current = clamp(
      Number(src.current ?? next.body[key].current) || next.body[key].current,
      0,
      next.body[key].max
    );
    next.body[key].armor = clamp(Number(src.armor ?? next.body[key].armor) || 0, 0, 99);
  }

  return next;
}

function getTokenData(item) {
  return sanitizeData(item?.metadata?.[META_KEY]);
}

function isTrackableToken(item) {
  return item && (isImage(item) || isShape(item) || isText(item) || isLabel(item));
}

function getSelectedToken() {
  return lastSceneItems.find((item) => item.id === currentSelectionId) ?? null;
}

function tokenDisplayName(item) {
  return item?.name || item?.text?.plainText || `Token ${item?.id?.slice(0, 6) ?? "?"}`;
}

function healthRatio(data) {
  const totals = BODY_ORDER.reduce(
    (acc, key) => {
      acc.current += data.body[key].current;
      acc.max += data.body[key].max;
      return acc;
    },
    { current: 0, max: 0 }
  );
  return totals.max > 0 ? totals.current / totals.max : 0;
}

function overlayColor(data) {
  const ratio = healthRatio(data);
  if (ratio <= 0.25) return "#7f1d1d";
  if (ratio <= 0.6) return "#854d0e";
  return "#14532d";
}

function formatOverlayText(data) {
  const b = data.body;
  return [
    `L.Arm ${b["L.Arm"].current}/${b["L.Arm"].max}(${b["L.Arm"].armor})  |  Head ${b["Head"].current}/${b["Head"].max}(${b["Head"].armor})  |  R.Arm ${b["R.Arm"].current}/${b["R.Arm"].max}(${b["R.Arm"].armor})`,
    `L.Leg ${b["L.Leg"].current}/${b["L.Leg"].max}(${b["L.Leg"].armor})  |  Torso ${b["Torso"].current}/${b["Torso"].max}(${b["Torso"].armor})  |  R.Leg ${b["R.Leg"].current}/${b["R.Leg"].max}(${b["R.Leg"].armor})`,
  ].join("\n");
}

function buildMinorDots(token, data) {
  const items = [];
  const startX = -14;
  const y = token.height / 2 - 12;
  for (let i = 0; i < data.minor; i += 1) {
    items.push(
      buildShape()
        .shapeType("CIRCLE")
        .width(8)
        .height(8)
        .position({ x: startX + i * 10, y })
        .attachedTo(token.id)
        .layer("ATTACHMENT")
        .locked(true)
        .disableHit(true)
        .fillColor("#f59e0b")
        .fillOpacity(0.95)
        .strokeColor("#111827")
        .strokeWidth(1)
        .metadata({ [OVERLAY_KEY]: token.id, kind: "minor", index: i })
        .build()
    );
  }
  return items;
}

function buildSeriousMarks(token, data) {
  const items = [];
  const x = token.width / 2 - 14;
  const startY = -token.height / 2 + 12;
  for (let i = 0; i < data.serious; i += 1) {
    items.push(
      buildShape()
        .shapeType("RECTANGLE")
        .width(4)
        .height(18)
        .position({ x: x - i * 8, y: startY })
        .attachedTo(token.id)
        .layer("ATTACHMENT")
        .locked(true)
        .disableHit(true)
        .fillColor("#ef4444")
        .fillOpacity(0.95)
        .strokeColor("#111827")
        .strokeWidth(1)
        .cornerRadius(2)
        .metadata({ [OVERLAY_KEY]: token.id, kind: "serious", index: i })
        .build()
    );
  }
  return items;
}

function buildOverlayLabel(token, data) {
  const cardWidth = Math.max(300, token.width * 2.2);
  const offsetX = token.width / 2 + cardWidth / 2 + 16;
  return buildLabel()
    .name(`Body HP: ${tokenDisplayName(token)}`)
    .plainText(formatOverlayText(data))
    .fontSize(13)
    .fontWeight(600)
    .lineHeight(1.2)
    .padding(10)
    .textAlign("LEFT")
    .textAlignVertical("MIDDLE")
    .fillColor("#f8fafc")
    .backgroundColor(overlayColor(data))
    .backgroundOpacity(0.58)
    .strokeColor("#111827")
    .strokeOpacity(0.6)
    .strokeWidth(1)
    .pointerDirection("LEFT")
    .pointerWidth(10)
    .pointerHeight(12)
    .cornerRadius(12)
    .attachedTo(token.id)
    .layer("ATTACHMENT")
    .locked(true)
    .disableHit(true)
    .position({ x: offsetX, y: 0 })
    .metadata({ [OVERLAY_KEY]: token.id, kind: "card" })
    .build();
}

async function upsertTokenData(tokenId, updater) {
  await OBR.scene.items.updateItems([tokenId], (items) => {
    const token = items[0];
    if (!token) return;
    const current = getTokenData(token);
    const next = sanitizeData(updater(current));
    token.metadata[META_KEY] = next;
  });
}

async function ensureOverlayForToken(tokenId) {
  const token = lastSceneItems.find((item) => item.id === tokenId);
  if (!token || !isTrackableToken(token)) return;

  const data = getTokenData(token);
  const attachments = await OBR.scene.items.getItemAttachments([tokenId]);
  const ownedOverlays = attachments.filter((item) => item.metadata?.[OVERLAY_KEY] === tokenId && item.id !== tokenId);
  const ownedIds = ownedOverlays.map((item) => item.id);

  if (!data.enabled) {
    if (ownedIds.length) await OBR.scene.items.deleteItems(ownedIds);
    return;
  }

  if (ownedIds.length) {
    await OBR.scene.items.deleteItems(ownedIds);
  }

  const newItems = [
    buildOverlayLabel(token, data),
    ...buildMinorDots(token, data),
    ...buildSeriousMarks(token, data),
  ];
  await OBR.scene.items.addItems(newItems);
}

async function syncAllOverlays() {
  if (syncing) return;
  syncing = true;
  try {
    const tracked = lastSceneItems.filter((item) => item.metadata?.[META_KEY]?.enabled);
    for (const item of tracked) {
      await ensureOverlayForToken(item.id);
    }
  } finally {
    syncing = false;
  }
}

function renderEditor(token) {
  if (!token) {
    ui.selectionInfo.textContent = "Нет выбранного токена.";
    ui.editor.classList.add("hidden");
    ui.registerBtn.disabled = true;
    ui.removeBtn.disabled = true;
    return;
  }

  const data = getTokenData(token);
  ui.selectionInfo.textContent = `Выбран: ${tokenDisplayName(token)}`;
  ui.tokenName.textContent = tokenDisplayName(token);
  ui.minorValue.textContent = String(data.minor);
  ui.seriousValue.textContent = String(data.serious);
  ui.editor.classList.remove("hidden");
  ui.registerBtn.disabled = playerRole !== "GM";
  ui.removeBtn.disabled = playerRole !== "GM";

  ui.partsGrid.innerHTML = "";
  for (const key of BODY_ORDER) {
    const part = data.body[key];
    const card = document.createElement("div");
    card.className = "part-card";
    card.innerHTML = `
      <div class="part-header">
        <div class="part-title">${key}</div>
        <div class="row">
          <span class="pill hp">HP ${part.current}/${part.max}</span>
          <span class="pill armor">ARM ${part.armor}</span>
        </div>
      </div>
      <div class="field">
        <label>Текущие криты</label>
        <input type="number" min="0" max="${part.max}" value="${part.current}" data-part="${key}" data-field="current" ${playerRole !== "GM" ? "disabled" : ""}>
      </div>
      <div class="field">
        <label>Макс. криты</label>
        <input type="number" min="0" max="99" value="${part.max}" data-part="${key}" data-field="max" ${playerRole !== "GM" ? "disabled" : ""}>
      </div>
      <div class="field">
        <label>Броня</label>
        <input type="number" min="0" max="99" value="${part.armor}" data-part="${key}" data-field="armor" ${playerRole !== "GM" ? "disabled" : ""}>
      </div>
    `;
    ui.partsGrid.appendChild(card);
  }
}

async function refreshSelection() {
  const ids = await OBR.player.getSelection();
  currentSelectionId = ids?.[0] ?? null;
  renderEditor(getSelectedToken());
}

async function registerSelectedToken() {
  const token = getSelectedToken();
  if (!token || playerRole !== "GM") return;
  await upsertTokenData(token.id, (current) => ({ ...current, enabled: true }));
  await ensureOverlayForToken(token.id);
  await refreshSelection();
}

async function unregisterSelectedToken() {
  const token = getSelectedToken();
  if (!token || playerRole !== "GM") return;
  await upsertTokenData(token.id, (current) => ({ ...current, enabled: false }));
  await ensureOverlayForToken(token.id);
  await refreshSelection();
}

async function changeStep(type, delta) {
  const token = getSelectedToken();
  if (!token || playerRole !== "GM") return;
  await upsertTokenData(token.id, (current) => ({
    ...current,
    [type]: clamp((current[type] ?? 0) + delta, 0, type === "minor" ? 4 : 2),
  }));
  await ensureOverlayForToken(token.id);
  await refreshSelection();
}

async function updatePartField(partName, field, value) {
  const token = getSelectedToken();
  if (!token || playerRole !== "GM") return;
  await upsertTokenData(token.id, (current) => {
    const next = deepClone(current);
    const part = next.body[partName];
    const number = clamp(Number(value) || 0, 0, 99);
    part[field] = number;
    if (field === "max") {
      part.current = clamp(part.current, 0, part.max);
    }
    if (field === "current") {
      part.current = clamp(part.current, 0, part.max);
    }
    return next;
  });
  await ensureOverlayForToken(token.id);
  await refreshSelection();
}

function bindUiEvents() {
  ui.registerBtn.addEventListener("click", registerSelectedToken);
  ui.removeBtn.addEventListener("click", unregisterSelectedToken);

  document.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", async () => {
      await changeStep(button.dataset.step, Number(button.dataset.delta));
    });
  });

  ui.partsGrid.addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const part = target.dataset.part;
    const field = target.dataset.field;
    if (!part || !field) return;
    await updatePartField(part, field, target.value);
  });
}

function setupContextMenu() {
  OBR.contextMenu.create({
    id: `${EXTENSION_ID}/toggle`,
    icons: [
      {
        icon: "./heart.svg",
        label: "Toggle Body HP Tracker",
      },
    ],
    onClick: async (context) => {
      const role = await OBR.player.getRole();
      if (role !== "GM") return;
      for (const item of context.items) {
        if (!isTrackableToken(item)) continue;
        const enabled = !!item.metadata?.[META_KEY]?.enabled;
        await upsertTokenData(item.id, (current) => ({ ...current, enabled: !enabled }));
        await ensureOverlayForToken(item.id);
      }
    },
  });
}

OBR.onReady(async () => {
  playerRole = await OBR.player.getRole();
  ui.roleBadge.textContent = playerRole === "GM" ? "GM" : "PLAYER";
  bindUiEvents();
  setupContextMenu();

  OBR.player.onChange(async () => {
    playerRole = await OBR.player.getRole();
    ui.roleBadge.textContent = playerRole === "GM" ? "GM" : "PLAYER";
    renderEditor(getSelectedToken());
  });

  OBR.scene.items.onChange(async (items) => {
    lastSceneItems = items;
    await refreshSelection();
    await syncAllOverlays();
  });

  await refreshSelection();
  lastSceneItems = await OBR.scene.items.getItems();
  await syncAllOverlays();
});
