import OBR, {
  buildLabel,
  buildShape,
  isImage,
  isLabel,
  isShape,
  isText,
} from "https://unpkg.com/@owlbear-rodeo/sdk@latest/dist/index.mjs";

const EXTENSION_ID = "com.openai.body-hp-tracker";
const META_KEY = `${EXTENSION_ID}/data`;
const OVERLAY_KEY = `${EXTENSION_ID}/overlayFor`;

const BODY_ORDER = ["L.Arm", "Head", "R.Arm", "L.Leg", "Torso", "R.Leg"];
const BODY_DEFAULTS = {
  "L.Arm": { current: 2, max: 2, armor: 2 },
  Head: { current: 1, max: 1, armor: 0 },
  "R.Arm": { current: 2, max: 2, armor: 2 },
  "L.Leg": { current: 2, max: 2, armor: 2 },
  Torso: { current: 3, max: 3, armor: 6 },
  "R.Leg": { current: 2, max: 2, armor: 2 },
};
const DEFAULT_DATA = { enabled: true, minor: 0, serious: 0, body: structuredClone(BODY_DEFAULTS) };

const ui = {
  roleBadge: document.getElementById("roleBadge"),
  registerBtn: document.getElementById("registerBtn"),
  removeBtn: document.getElementById("removeBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  selectionInfo: document.getElementById("selectionInfo"),
  statusBox: document.getElementById("statusBox"),
  editor: document.getElementById("editor"),
  tokenName: document.getElementById("tokenName"),
  minorValue: document.getElementById("minorValue"),
  seriousValue: document.getElementById("seriousValue"),
  partsGrid: document.getElementById("partsGrid"),
};

let playerRole = "PLAYER";
let currentSelectionId = null;
let currentToken = null;
let lastSceneItems = [];
let syncInFlight = false;
let watchTimer = null;

function setStatus(message, kind = "info") {
  ui.statusBox.textContent = message;
  ui.statusBox.className = `status ${kind}`;
  console[kind === "error" ? "error" : "log"](`[Body HP] ${message}`);
}

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function isTrackableToken(item) { return item && (isImage(item) || isShape(item) || isText(item) || isLabel(item)); }
function tokenDisplayName(item) { return item?.name || item?.text?.plainText || `Token ${item?.id?.slice(0, 6) ?? "?"}`; }

function sanitizeData(raw) {
  const next = deepClone(DEFAULT_DATA);
  if (!raw || typeof raw !== "object") return next;
  next.enabled = raw.enabled !== false;
  next.minor = clamp(Number(raw.minor ?? 0) || 0, 0, 4);
  next.serious = clamp(Number(raw.serious ?? 0) || 0, 0, 2);
  for (const key of BODY_ORDER) {
    const src = raw.body?.[key] ?? {};
    const base = next.body[key];
    base.max = clamp(Number(src.max ?? base.max) || base.max, 0, 99);
    base.current = clamp(Number(src.current ?? base.current) || base.current, 0, base.max);
    base.armor = clamp(Number(src.armor ?? base.armor) || 0, 0, 99);
  }
  return next;
}

function getTokenData(item) {
  return sanitizeData(item?.metadata?.[META_KEY]);
}

function formatOverlayText(data) {
  const b = data.body;
  return [
    `L.Arm ${b["L.Arm"].current}/${b["L.Arm"].max}(${b["L.Arm"].armor}) | Head ${b["Head"].current}/${b["Head"].max}(${b["Head"].armor}) | R.Arm ${b["R.Arm"].current}/${b["R.Arm"].max}(${b["R.Arm"].armor})`,
    `L.Leg ${b["L.Leg"].current}/${b["L.Leg"].max}(${b["L.Leg"].armor}) | Torso ${b["Torso"].current}/${b["Torso"].max}(${b["Torso"].armor}) | R.Leg ${b["R.Leg"].current}/${b["R.Leg"].max}(${b["R.Leg"].armor})`,
  ].join("\n");
}

function healthRatio(data) {
  const totals = BODY_ORDER.reduce((acc, key) => {
    acc.current += data.body[key].current;
    acc.max += data.body[key].max;
    return acc;
  }, { current: 0, max: 0 });
  return totals.max > 0 ? totals.current / totals.max : 0;
}

function overlayColor(data) {
  const ratio = healthRatio(data);
  if (ratio <= 0.25) return "#7f1d1d";
  if (ratio <= 0.6) return "#854d0e";
  return "#14532d";
}

function buildMinorDots(token, data) {
  const items = [];
  const startX = -token.width / 2 + 12;
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
  const x = token.width / 2 - 12;
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
  const cardWidth = Math.max(360, token.width * 2.6);
  const offsetX = token.width / 2 + cardWidth / 2 + 16;
  return buildLabel()
    .name(`Body HP: ${tokenDisplayName(token)}`)
    .plainText(formatOverlayText(data))
    .width(cardWidth)
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

async function getLiveSelectionToken() {
  const ids = await OBR.player.getSelection();
  const id = ids?.[0] ?? null;
  currentSelectionId = id;
  if (!id) {
    currentToken = null;
    return null;
  }
  const items = await OBR.scene.items.getItems();
  lastSceneItems = items;
  const token = items.find((item) => item.id === id) ?? null;
  currentToken = token;
  return token;
}

async function updateTokenData(tokenId, updater) {
  await OBR.scene.items.updateItems([tokenId], (items) => {
    const token = items[0];
    if (!token) return;
    const current = getTokenData(token);
    token.metadata[META_KEY] = sanitizeData(updater(current));
  });
}

async function removeExistingOverlays(tokenId) {
  const attachments = await OBR.scene.items.getItemAttachments([tokenId]);
  const overlayIds = attachments
    .filter((item) => item.id !== tokenId && item.metadata?.[OVERLAY_KEY] === tokenId)
    .map((item) => item.id);
  if (overlayIds.length) await OBR.scene.items.deleteItems(overlayIds);
}

async function ensureOverlayForToken(tokenId) {
  const items = await OBR.scene.items.getItems();
  lastSceneItems = items;
  const token = items.find((item) => item.id === tokenId);
  if (!token || !isTrackableToken(token)) throw new Error("Выбранный объект не поддерживается");

  const data = getTokenData(token);
  await removeExistingOverlays(tokenId);
  if (!data.enabled) return;

  const overlayItems = [buildOverlayLabel(token, data), ...buildMinorDots(token, data), ...buildSeriousMarks(token, data)];
  await OBR.scene.items.addItems(overlayItems);
}

async function syncTrackedOverlays() {
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const items = await OBR.scene.items.getItems();
    lastSceneItems = items;
    const trackedIds = items.filter((item) => item.metadata?.[META_KEY]?.enabled).map((item) => item.id);
    for (const id of trackedIds) {
      await ensureOverlayForToken(id);
    }
  } finally {
    syncInFlight = false;
  }
}

function renderEditor(token) {
  if (!token) {
    ui.selectionInfo.textContent = "Нет выбранного токена.";
    ui.editor.classList.add("hidden");
    return;
  }
  const data = getTokenData(token);
  ui.selectionInfo.textContent = `Выбран: ${tokenDisplayName(token)}`;
  ui.tokenName.textContent = tokenDisplayName(token);
  ui.minorValue.textContent = String(data.minor);
  ui.seriousValue.textContent = String(data.serious);
  ui.editor.classList.remove("hidden");
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
      </div>`;
    ui.partsGrid.appendChild(card);
  }

  ui.registerBtn.disabled = playerRole !== "GM";
  ui.removeBtn.disabled = playerRole !== "GM";
}

async function refreshSelection(showStatus = false) {
  const token = await getLiveSelectionToken();
  renderEditor(token);
  if (showStatus) {
    if (!token) setStatus("Токен не выбран. Выдели один токен на карте и нажми «Обновить выбор».", "warn");
    else setStatus(`Выбран токен: ${tokenDisplayName(token)}`, "success");
  }
  return token;
}

async function registerSelectedToken() {
  try {
    if (playerRole !== "GM") throw new Error("Только GM может менять значения");
    const token = await refreshSelection();
    if (!token) throw new Error("Сначала выдели один токен на карте");
    if (!isTrackableToken(token)) throw new Error("Этот объект не поддерживается");

    await updateTokenData(token.id, (current) => ({ ...current, enabled: true }));
    await ensureOverlayForToken(token.id);
    await refreshSelection();
    await OBR.notification.show(`Трекер включён для ${tokenDisplayName(token)}`, "SUCCESS");
    setStatus(`Трекер включён для ${tokenDisplayName(token)}. Карточка должна появиться справа от токена.`, "success");
  } catch (error) {
    const message = error?.message || "Не удалось включить трекер";
    await OBR.notification.show(message, "ERROR");
    setStatus(message, "error");
  }
}

async function unregisterSelectedToken() {
  try {
    if (playerRole !== "GM") throw new Error("Только GM может менять значения");
    const token = await refreshSelection();
    if (!token) throw new Error("Сначала выдели один токен на карте");
    await updateTokenData(token.id, (current) => ({ ...current, enabled: false }));
    await removeExistingOverlays(token.id);
    await refreshSelection();
    await OBR.notification.show(`Трекер убран у ${tokenDisplayName(token)}`, "SUCCESS");
    setStatus(`Трекер убран у ${tokenDisplayName(token)}.`, "success");
  } catch (error) {
    const message = error?.message || "Не удалось убрать трекер";
    await OBR.notification.show(message, "ERROR");
    setStatus(message, "error");
  }
}

async function changeStep(type, delta) {
  try {
    if (playerRole !== "GM") throw new Error("Только GM может менять значения");
    const token = await refreshSelection();
    if (!token) throw new Error("Сначала выдели один токен на карте");
    await updateTokenData(token.id, (current) => ({
      ...current,
      [type]: clamp((current[type] ?? 0) + delta, 0, type === "minor" ? 4 : 2),
    }));
    await ensureOverlayForToken(token.id);
    await refreshSelection();
    setStatus(`Обновлено: ${type} у ${tokenDisplayName(token)}.`, "success");
  } catch (error) {
    setStatus(error?.message || "Не удалось обновить значение", "error");
  }
}

async function updatePartField(partName, field, value) {
  try {
    if (playerRole !== "GM") throw new Error("Только GM может менять значения");
    const token = await refreshSelection();
    if (!token) throw new Error("Сначала выдели один токен на карте");
    await updateTokenData(token.id, (current) => {
      const next = deepClone(current);
      const part = next.body[partName];
      const number = clamp(Number(value) || 0, 0, 99);
      part[field] = number;
      if (field === "max" || field === "current") part.current = clamp(part.current, 0, part.max);
      return next;
    });
    await ensureOverlayForToken(token.id);
    await refreshSelection();
    setStatus(`Обновлён ${partName}: ${field}.`, "success");
  } catch (error) {
    setStatus(error?.message || "Не удалось обновить часть тела", "error");
  }
}

function bindUiEvents() {
  ui.registerBtn.addEventListener("click", registerSelectedToken);
  ui.removeBtn.addEventListener("click", unregisterSelectedToken);
  ui.refreshBtn.addEventListener("click", () => refreshSelection(true));
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
    icons: [{ icon: "heart.svg", label: "Toggle Body HP Tracker" }],
    onClick: async (context) => {
      try {
        const role = await OBR.player.getRole();
        if (role !== "GM") return;
        for (const item of context.items) {
          if (!isTrackableToken(item)) continue;
          const enabled = !!item.metadata?.[META_KEY]?.enabled;
          await updateTokenData(item.id, (current) => ({ ...current, enabled: !enabled }));
          if (!enabled) await ensureOverlayForToken(item.id);
          else await removeExistingOverlays(item.id);
        }
        await refreshSelection();
        setStatus("Контекстное меню отработало успешно.", "success");
      } catch (error) {
        setStatus(error?.message || "Ошибка контекстного меню", "error");
      }
    },
  });
}

OBR.onReady(async () => {
  try {
    playerRole = await OBR.player.getRole();
    ui.roleBadge.textContent = playerRole === "GM" ? "GM" : "PLAYER";
    bindUiEvents();
    setupContextMenu();

    lastSceneItems = await OBR.scene.items.getItems();
    await refreshSelection();
    setStatus("Расширение загружено. Выдели токен и нажми «Обновить выбор».", "info");

    OBR.player.onChange(async () => {
      playerRole = await OBR.player.getRole();
      ui.roleBadge.textContent = playerRole === "GM" ? "GM" : "PLAYER";
      await refreshSelection();
    });

    OBR.scene.items.onChange(async (items) => {
      lastSceneItems = items;
      if (currentSelectionId && !items.find((item) => item.id === currentSelectionId)) {
        currentSelectionId = null;
        currentToken = null;
      }
      renderEditor(currentToken);
    });

    watchTimer = setInterval(() => {
      refreshSelection().catch((error) => setStatus(error?.message || "Ошибка обновления выбора", "error"));
    }, 700);

    window.addEventListener("beforeunload", () => {
      if (watchTimer) clearInterval(watchTimer);
    });
  } catch (error) {
    setStatus(error?.message || "Ошибка инициализации расширения", "error");
  }
});
