import OBR, { buildLabel, buildShape, isImage, isLabel, isShape, isText } from "https://unpkg.com/@owlbear-rodeo/sdk@latest/dist/index.mjs";

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
const DEFAULT_DATA = {
  enabled: true,
  minor: 0,
  serious: 0,
  body: JSON.parse(JSON.stringify(BODY_DEFAULTS)),
};

const ui = {
  roleBadge: document.getElementById("roleBadge"),
  refreshBtn: document.getElementById("refreshBtn"),
  syncBtn: document.getElementById("syncBtn"),
  allCount: document.getElementById("allCount"),
  trackedCount: document.getElementById("trackedCount"),
  allTokensList: document.getElementById("allTokensList"),
  trackedList: document.getElementById("trackedList"),
  statusBox: document.getElementById("statusBox"),
  editor: document.getElementById("editor"),
  tokenName: document.getElementById("tokenName"),
  minorValue: document.getElementById("minorValue"),
  seriousValue: document.getElementById("seriousValue"),
  partsGrid: document.getElementById("partsGrid"),
};

let playerRole = "PLAYER";
let lastSceneItems = [];
let activeTokenId = null;

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function isTrackableToken(item) { return item && (isImage(item) || isShape(item) || isText(item) || isLabel(item)); }
function tokenDisplayName(item) {
  if (!item) return "—";
  return item.name || item.text?.plainText || item.plainText || `Token ${item.id.slice(0, 6)}`;
}
function setStatus(message, kind = "info") {
  ui.statusBox.textContent = message;
  ui.statusBox.className = `status ${kind}`;
  console[kind === "error" ? "error" : "log"](`[Body HP] ${message}`);
}

function sanitizeData(raw) {
  const next = deepClone(DEFAULT_DATA);
  if (!raw || typeof raw !== "object") return next;
  next.enabled = raw.enabled !== false;
  next.minor = clamp(Number(raw.minor ?? 0) || 0, 0, 4);
  next.serious = clamp(Number(raw.serious ?? 0) || 0, 0, 2);
  for (const key of BODY_ORDER) {
    const src = raw.body?.[key] ?? {};
    const part = next.body[key];
    part.max = clamp(Number(src.max ?? part.max) || part.max, 0, 99);
    part.current = clamp(Number(src.current ?? part.current) || part.current, 0, part.max);
    part.armor = clamp(Number(src.armor ?? part.armor) || 0, 0, 99);
  }
  return next;
}
function getTokenData(item) { return sanitizeData(item?.metadata?.[META_KEY]); }
function isTracked(item) { return !!item?.metadata?.[META_KEY]?.enabled; }
function getAllTokens(items = lastSceneItems) { return items.filter(isTrackableToken); }
function getTrackedTokens(items = lastSceneItems) { return items.filter((item) => isTrackableToken(item) && isTracked(item)); }
function getTokenById(id) { return lastSceneItems.find((item) => item.id === id) || null; }

function formatOverlayText(data) {
  const b = data.body;
  return [
    `L.Arm ${b["L.Arm"].current}/${b["L.Arm"].max}(${b["L.Arm"].armor}) | Head ${b["Head"].current}/${b["Head"].max}(${b["Head"].armor}) | R.Arm ${b["R.Arm"].current}/${b["R.Arm"].max}(${b["R.Arm"].armor})`,
    `L.Leg ${b["L.Leg"].current}/${b["L.Leg"].max}(${b["L.Leg"].armor}) | Torso ${b["Torso"].current}/${b["Torso"].max}(${b["Torso"].armor}) | R.Leg ${b["R.Leg"].current}/${b["R.Leg"].max}(${b["R.Leg"].armor})`,
  ].join("\n");
}
function healthRatio(data) {
  const total = BODY_ORDER.reduce((acc, key) => {
    acc.current += data.body[key].current;
    acc.max += data.body[key].max;
    return acc;
  }, { current: 0, max: 0 });
  return total.max > 0 ? total.current / total.max : 0;
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
  const cardWidth = Math.max(360, (token.width || 140) * 2.6);
  const offsetX = (token.width || 140) / 2 + cardWidth / 2 + 16;
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
  if (!token || !isTrackableToken(token)) return;
  const data = getTokenData(token);
  await removeExistingOverlays(tokenId);
  if (!data.enabled) return;
  const overlayItems = [buildOverlayLabel(token, data), ...buildMinorDots(token, data), ...buildSeriousMarks(token, data)];
  await OBR.scene.items.addItems(overlayItems);
}

async function syncTrackedOverlays() {
  const tracked = getTrackedTokens(await OBR.scene.items.getItems());
  lastSceneItems = await OBR.scene.items.getItems();
  for (const token of tracked) await ensureOverlayForToken(token.id);
}

async function updateTokenData(tokenId, updater) {
  await OBR.scene.items.updateItems([tokenId], (items) => {
    const token = items[0];
    if (!token) return;
    const current = getTokenData(token);
    token.metadata[META_KEY] = sanitizeData(updater(current));
  });
}

async function setTracked(tokenId, enabled) {
  if (playerRole !== "GM") throw new Error("Только GM может включать трекер");
  const token = getTokenById(tokenId);
  if (!token) throw new Error("Токен не найден на сцене");

  if (enabled) {
    await updateTokenData(tokenId, (current) => ({ ...current, enabled: true }));
    await ensureOverlayForToken(tokenId);
    activeTokenId = tokenId;
    setStatus(`Трекер включён: ${tokenDisplayName(token)}.`, "success");
  } else {
    await OBR.scene.items.updateItems([tokenId], (items) => {
      if (!items[0]) return;
      delete items[0].metadata[META_KEY];
    });
    await removeExistingOverlays(tokenId);
    if (activeTokenId === tokenId) activeTokenId = null;
    setStatus(`Трекер отключён: ${tokenDisplayName(token)}.`, "success");
  }

  await refreshAll();
}

function renderAllTokensList() {
  const allTokens = getAllTokens();
  ui.allCount.textContent = String(allTokens.length);
  if (!allTokens.length) {
    ui.allTokensList.innerHTML = '<div class="empty">На сцене пока нет подходящих токенов.</div>';
    return;
  }
  ui.allTokensList.innerHTML = "";

  for (const token of allTokens) {
    const tracked = isTracked(token);
    const row = document.createElement("div");
    row.className = `token-row${token.id === activeTokenId ? " active" : ""}`;
    row.innerHTML = `
      <div class="token-row-head">
        <div class="token-row-name">${escapeHtml(tokenDisplayName(token))}</div>
        <div class="pill ${tracked ? "hp" : "armor"}">${tracked ? "В трекере" : "Обычный"}</div>
      </div>
      <div class="token-row-sub">${token.type} · ${token.id.slice(0, 8)}</div>
      <div class="token-row-actions"></div>`;
    const actions = row.querySelector(".token-row-actions");

    const focusBtn = document.createElement("button");
    focusBtn.className = "secondary";
    focusBtn.textContent = "Выбрать";
    focusBtn.addEventListener("click", async () => {
      activeTokenId = token.id;
      renderAllTokensList();
      renderTrackedList();
      renderEditor();
      try { await OBR.player.select([token.id], true); } catch {}
      setStatus(`Активен токен: ${tokenDisplayName(token)}.`, "info");
    });
    actions.appendChild(focusBtn);

    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = tracked ? "Убрать" : "Добавить";
    toggleBtn.className = tracked ? "danger" : "success";
    toggleBtn.disabled = playerRole !== "GM";
    toggleBtn.addEventListener("click", () => setTracked(token.id, !tracked).catch((e) => setStatus(e?.message || "Ошибка переключения трекера", "error")));
    actions.appendChild(toggleBtn);

    ui.allTokensList.appendChild(row);
  }
}

function renderTrackedList() {
  const tracked = getTrackedTokens();
  ui.trackedCount.textContent = String(tracked.length);
  if (!tracked.length) {
    ui.trackedList.innerHTML = '<div class="empty">Пока пусто. Нажми «Добавить» у нужного токена выше.</div>';
    ui.editor.classList.add("hidden");
    return;
  }
  if (!activeTokenId || !tracked.some((token) => token.id === activeTokenId)) activeTokenId = tracked[0].id;
  ui.trackedList.innerHTML = "";

  for (const token of tracked) {
    const data = getTokenData(token);
    const totalCurrent = BODY_ORDER.reduce((sum, key) => sum + data.body[key].current, 0);
    const totalMax = BODY_ORDER.reduce((sum, key) => sum + data.body[key].max, 0);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tracked-item${token.id === activeTokenId ? " active" : ""}`;
    btn.innerHTML = `
      <div class="tracked-item-head">
        <div class="tracked-item-name">${escapeHtml(tokenDisplayName(token))}</div>
        <div class="pill hp">${totalCurrent}/${totalMax}</div>
      </div>
      <div class="tracked-item-sub">Minor ${data.minor} · Serious ${data.serious}</div>`;
    btn.addEventListener("click", async () => {
      activeTokenId = token.id;
      renderAllTokensList();
      renderTrackedList();
      renderEditor();
      try { await OBR.player.select([token.id], true); } catch {}
      setStatus(`Редактирование: ${tokenDisplayName(token)}.`, "success");
    });
    ui.trackedList.appendChild(btn);
  }
}

function renderEditor() {
  const token = getTokenById(activeTokenId);
  if (!token || !isTracked(token)) {
    ui.editor.classList.add("hidden");
    return;
  }
  const data = getTokenData(token);
  ui.editor.classList.remove("hidden");
  ui.tokenName.textContent = tokenDisplayName(token);
  ui.minorValue.textContent = String(data.minor);
  ui.seriousValue.textContent = String(data.serious);
  ui.partsGrid.innerHTML = "";

  for (const key of BODY_ORDER) {
    const part = data.body[key];
    const card = document.createElement("div");
    card.className = "part-card";
    card.innerHTML = `
      <div class="part-header">
        <div class="part-title">${escapeHtml(key)}</div>
        <div class="row row-gap">
          <span class="pill hp">HP ${part.current}/${part.max}</span>
          <span class="pill armor">ARM ${part.armor}</span>
        </div>
      </div>
      <div class="field">
        <label>Текущие криты</label>
        <input type="number" min="0" max="${part.max}" value="${part.current}" data-part="${escapeHtml(key)}" data-field="current" ${playerRole !== "GM" ? "disabled" : ""}>
      </div>
      <div class="field">
        <label>Макс. криты</label>
        <input type="number" min="0" max="99" value="${part.max}" data-part="${escapeHtml(key)}" data-field="max" ${playerRole !== "GM" ? "disabled" : ""}>
      </div>
      <div class="field">
        <label>Броня</label>
        <input type="number" min="0" max="99" value="${part.armor}" data-part="${escapeHtml(key)}" data-field="armor" ${playerRole !== "GM" ? "disabled" : ""}>
      </div>`;
    ui.partsGrid.appendChild(card);
  }
}

async function changeStep(type, delta) {
  try {
    if (playerRole !== "GM") throw new Error("Только GM может менять значения");
    const token = getTokenById(activeTokenId);
    if (!token || !isTracked(token)) throw new Error("Сначала выбери токен из отслеживаемых");
    await updateTokenData(token.id, (current) => ({
      ...current,
      [type]: clamp((current[type] ?? 0) + delta, 0, type === "minor" ? 4 : 2),
    }));
    await ensureOverlayForToken(token.id);
    await refreshAll();
    setStatus(`Обновлено: ${type} у ${tokenDisplayName(token)}.`, "success");
  } catch (error) {
    setStatus(error?.message || "Не удалось обновить значение", "error");
  }
}

async function updatePartField(partName, field, value) {
  try {
    if (playerRole !== "GM") throw new Error("Только GM может менять значения");
    const token = getTokenById(activeTokenId);
    if (!token || !isTracked(token)) throw new Error("Сначала выбери токен из отслеживаемых");
    await updateTokenData(token.id, (current) => {
      const next = deepClone(current);
      const part = next.body[partName];
      if (!part) return next;
      const number = clamp(Number(value) || 0, 0, 99);
      part[field] = number;
      if (field === "max" || field === "current") part.current = clamp(part.current, 0, part.max);
      return next;
    });
    await ensureOverlayForToken(token.id);
    await refreshAll();
    setStatus(`Обновлён ${partName}: ${field}.`, "success");
  } catch (error) {
    setStatus(error?.message || "Не удалось обновить часть тела", "error");
  }
}

async function refreshAll(showToast = false) {
  lastSceneItems = await OBR.scene.items.getItems();
  renderAllTokensList();
  renderTrackedList();
  renderEditor();
  if (showToast) setStatus(`Список обновлён. Всего токенов: ${getAllTokens().length}, с трекером: ${getTrackedTokens().length}.`, "success");
}

function bindUiEvents() {
  ui.refreshBtn.addEventListener("click", () => refreshAll(true).catch((e) => setStatus(e?.message || "Ошибка обновления", "error")));
  ui.syncBtn.addEventListener("click", async () => {
    try {
      await syncTrackedOverlays();
      await refreshAll();
      setStatus("Оверлеи перерисованы.", "success");
    } catch (e) {
      setStatus(e?.message || "Не удалось перерисовать оверлеи", "error");
    }
  });

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

OBR.onReady(async () => {
  try {
    playerRole = await OBR.player.getRole();
    ui.roleBadge.textContent = playerRole === "GM" ? "GM" : "PLAYER";
    bindUiEvents();
    await refreshAll();
    setStatus("Расширение загружено. Добавь токен из списка сцены, затем редактируй его ниже.", "info");

    OBR.scene.items.onChange((items) => {
      lastSceneItems = items;
      renderAllTokensList();
      renderTrackedList();
      renderEditor();
    });

    OBR.player.onChange(async () => {
      playerRole = await OBR.player.getRole();
      ui.roleBadge.textContent = playerRole === "GM" ? "GM" : "PLAYER";
      renderAllTokensList();
      renderEditor();
    });
  } catch (error) {
    setStatus(error?.message || "Ошибка инициализации расширения", "error");
  }
});
