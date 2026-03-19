import {
  BODY_ORDER,
  OBR,
  clamp,
  ensureOverlayForToken,
  formatOverlayText,
  getBodyTotals,
  getCharacterName,
  getTrackerData,
  isCharacterToken,
  isTrackedCharacter,
  setTrackedState,
  sortCharacters,
  syncTrackedOverlays,
  updateTrackerData,
} from "./shared.js";

const ui = {
  roleBadge: document.getElementById("roleBadge"),
  refreshBtn: document.getElementById("refreshBtn"),
  syncBtn: document.getElementById("syncBtn"),
  statusBox: document.getElementById("statusBox"),
  selectionHint: document.getElementById("selectionHint"),
  selectedTokenPanel: document.getElementById("selectedTokenPanel"),
  trackedCount: document.getElementById("trackedCount"),
  trackedList: document.getElementById("trackedList"),
  allCount: document.getElementById("allCount"),
  allTokensList: document.getElementById("allTokensList"),
};

let playerRole = "PLAYER";
let sceneItems = [];
let selectionIds = [];
let activeTokenId = null;

function setStatus(message, kind = "info") {
  ui.statusBox.textContent = message;
  ui.statusBox.className = `status ${kind}`;
  console[kind === "error" ? "error" : "log"](`[Body HP] ${message}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCharacters() {
  return sortCharacters(sceneItems.filter(isCharacterToken));
}

function getTrackedCharacters() {
  return getCharacters().filter(isTrackedCharacter);
}

function getCharacterById(tokenId) {
  return getCharacters().find((item) => item.id === tokenId) ?? null;
}

function resolveActiveTokenId() {
  const characters = getCharacters();
  const selectedCharacterId = selectionIds.find((id) =>
    characters.some((character) => character.id === id)
  );

  if (selectedCharacterId) return selectedCharacterId;
  if (activeTokenId && characters.some((character) => character.id === activeTokenId)) {
    return activeTokenId;
  }

  const firstTracked = getTrackedCharacters()[0];
  if (firstTracked) return firstTracked.id;

  return characters[0]?.id ?? null;
}

function isEditable() {
  return playerRole === "GM";
}

function renderSelectedToken() {
  activeTokenId = resolveActiveTokenId();
  const token = getCharacterById(activeTokenId);

  if (!token) {
    ui.selectionHint.textContent = "No character token selected";
    ui.selectedTokenPanel.innerHTML =
      '<div class="empty">Add a character token to the map from Owlbear Rodeo Characters, then select it.</div>';
    return;
  }

  const tracked = isTrackedCharacter(token);
  const data = getTrackerData(token);
  const totals = getBodyTotals(data);
  const selected = selectionIds.includes(token.id);

  ui.selectionHint.textContent = selected ? "Selected on map" : "Showing current focus";

  const toggleButton = isEditable()
    ? `<button type="button" data-action="toggle-tracking" class="${
        tracked ? "danger" : "success"
      }">${tracked ? "Remove Tracking" : "Track Character"}</button>`
    : "";

  const damageDisabled = !tracked || !isEditable() ? "disabled" : "";
  const fieldDisabled = !tracked || !isEditable() ? "disabled" : "";

  ui.selectedTokenPanel.innerHTML = `
    <div class="selected-card">
      <div class="selected-head">
        <div>
          <div class="token-name">${escapeHtml(getCharacterName(token))}</div>
          <div class="token-meta">${escapeHtml(token.id.slice(0, 8))} - ${
            tracked ? "Tracked" : "Not tracked"
          }</div>
        </div>
        <div class="row row-gap">
          <button type="button" data-action="focus-token" class="secondary">Select On Map</button>
          ${toggleButton}
        </div>
      </div>

      <div class="summary-strip">
        <div class="stat-chip">
          <span class="chip-label">Body HP</span>
          <span class="chip-value">${totals.current}/${totals.max}</span>
        </div>
        <div class="stat-chip">
          <span class="chip-label">Minor</span>
          <span class="chip-value">${data.minor}</span>
        </div>
        <div class="stat-chip">
          <span class="chip-label">Serious</span>
          <span class="chip-value">${data.serious}</span>
        </div>
      </div>

      <div class="damage-grid">
        <div class="damage-card">
          <div class="field-label">Minor damage dots</div>
          <div class="stepper">
            <button type="button" data-action="change-damage" data-kind="minor" data-delta="-1" ${damageDisabled}>-</button>
            <span>${data.minor}/4</span>
            <button type="button" data-action="change-damage" data-kind="minor" data-delta="1" ${damageDisabled}>+</button>
          </div>
        </div>
        <div class="damage-card">
          <div class="field-label">Serious damage bars</div>
          <div class="stepper">
            <button type="button" data-action="change-damage" data-kind="serious" data-delta="-1" ${damageDisabled}>-</button>
            <span>${data.serious}/2</span>
            <button type="button" data-action="change-damage" data-kind="serious" data-delta="1" ${damageDisabled}>+</button>
          </div>
        </div>
      </div>

      <div class="body-table-wrap">
        <table class="body-table">
          <thead>
            <tr>
              <th>Part</th>
              <th>Current</th>
              <th>Max</th>
              <th>Armor</th>
            </tr>
          </thead>
          <tbody>
            ${BODY_ORDER.map((partName) => {
              const part = data.body[partName];
              return `
                <tr>
                  <td class="part-name">${escapeHtml(partName)}</td>
                  <td>
                    <div class="inline-stepper">
                      <button type="button" data-action="change-part" data-part="${escapeHtml(
                        partName
                      )}" data-field="current" data-delta="-1" ${fieldDisabled}>-</button>
                      <input type="number" min="0" max="${part.max}" value="${part.current}" data-action="set-field" data-part="${escapeHtml(
                        partName
                      )}" data-field="current" ${fieldDisabled}>
                      <button type="button" data-action="change-part" data-part="${escapeHtml(
                        partName
                      )}" data-field="current" data-delta="1" ${fieldDisabled}>+</button>
                    </div>
                  </td>
                  <td>
                    <input class="compact-input" type="number" min="0" max="99" value="${part.max}" data-action="set-field" data-part="${escapeHtml(
                      partName
                    )}" data-field="max" ${fieldDisabled}>
                  </td>
                  <td>
                    <input class="compact-input" type="number" min="0" max="99" value="${part.armor}" data-action="set-field" data-part="${escapeHtml(
                      partName
                    )}" data-field="armor" ${fieldDisabled}>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div class="preview-box">
        <div class="field-label">Overlay preview</div>
        <pre>${escapeHtml(formatOverlayText(data))}</pre>
      </div>
    </div>`;
}

function renderTrackedList() {
  const trackedCharacters = getTrackedCharacters();
  ui.trackedCount.textContent = String(trackedCharacters.length);

  if (!trackedCharacters.length) {
    ui.trackedList.innerHTML =
      '<div class="empty">No tracked characters yet. A GM can track them from this panel or from the token context menu.</div>';
    return;
  }

  ui.trackedList.innerHTML = trackedCharacters
    .map((token) => {
      const data = getTrackerData(token);
      const totals = getBodyTotals(data);
      return `
        <button type="button" class="list-item${
          token.id === activeTokenId ? " active" : ""
        }" data-action="select-character" data-token-id="${token.id}">
          <div class="list-item-head">
            <span>${escapeHtml(getCharacterName(token))}</span>
            <span class="pill hp">${totals.current}/${totals.max}</span>
          </div>
          <div class="list-item-sub">Minor ${data.minor} - Serious ${data.serious}</div>
        </button>`;
    })
    .join("");
}

function renderAllCharacters() {
  const characters = getCharacters();
  ui.allCount.textContent = String(characters.length);

  if (!characters.length) {
    ui.allTokensList.innerHTML =
      '<div class="empty">No character tokens are on the scene yet.</div>';
    return;
  }

  ui.allTokensList.innerHTML = characters
    .map((token) => {
      const tracked = isTrackedCharacter(token);
      return `
        <div class="token-row${token.id === activeTokenId ? " active" : ""}">
          <div>
            <div class="token-row-name">${escapeHtml(getCharacterName(token))}</div>
            <div class="token-row-sub">${escapeHtml(token.id.slice(0, 8))}</div>
          </div>
          <div class="row row-gap">
            <button type="button" class="secondary" data-action="select-character" data-token-id="${
              token.id
            }">Select</button>
            ${
              isEditable()
                ? `<button type="button" class="${
                    tracked ? "danger" : "success"
                  }" data-action="toggle-track-specific" data-token-id="${token.id}">${
                    tracked ? "Untrack" : "Track"
                  }</button>`
                : `<span class="pill ${tracked ? "hp" : "armor"}">${
                    tracked ? "Tracked" : "Viewer"
                  }</span>`
            }
          </div>
        </div>`;
    })
    .join("");
}

function render() {
  ui.roleBadge.textContent = playerRole === "GM" ? "GM" : "PLAYER";
  renderSelectedToken();
  renderTrackedList();
  renderAllCharacters();
}

async function syncState(showToast = false) {
  const [role, items, selection] = await Promise.all([
    OBR.player.getRole(),
    OBR.scene.items.getItems(),
    OBR.player.getSelection(),
  ]);

  playerRole = role;
  sceneItems = items;
  selectionIds = selection ?? [];
  render();

  if (showToast) {
    setStatus(
      `Loaded ${getCharacters().length} character token(s), ${getTrackedCharacters().length} tracked.`,
      "success"
    );
  }
}

async function selectCharacter(tokenId) {
  activeTokenId = tokenId;
  await OBR.player.select([tokenId], true);
  render();
}

async function toggleTracking(tokenId) {
  if (!isEditable()) {
    setStatus("Only the GM can change tracked characters.", "error");
    return;
  }

  const token = getCharacterById(tokenId);
  if (!token) return;

  const enableTracking = !isTrackedCharacter(token);
  await setTrackedState(tokenId, enableTracking);
  activeTokenId = tokenId;
  await syncState();
  setStatus(
    enableTracking
      ? `Tracking enabled for ${getCharacterName(token)}.`
      : `Tracking removed for ${getCharacterName(token)}.`,
    "success"
  );
}

async function changeDamage(kind, delta) {
  if (!isEditable()) {
    setStatus("Only the GM can edit damage values.", "error");
    return;
  }

  const token = getCharacterById(activeTokenId);
  if (!token || !isTrackedCharacter(token)) {
    setStatus("Select a tracked character first.", "error");
    return;
  }

  await updateTrackerData(token.id, (current) => ({
    ...current,
    [kind]: clamp(
      (current[kind] ?? 0) + delta,
      0,
      kind === "minor" ? 4 : 2
    ),
  }));
  await ensureOverlayForToken(token.id);
  await syncState();
}

async function changeBodyField(partName, field, delta) {
  if (!isEditable()) {
    setStatus("Only the GM can edit body values.", "error");
    return;
  }

  const token = getCharacterById(activeTokenId);
  if (!token || !isTrackedCharacter(token)) {
    setStatus("Select a tracked character first.", "error");
    return;
  }

  await updateTrackerData(token.id, (current) => {
    const next = structuredClone(current);
    const part = next.body[partName];
    if (!part) return next;

    if (field === "current") {
      part.current = clamp(part.current + delta, 0, part.max);
    } else if (field === "max") {
      part.max = clamp(part.max + delta, 0, 99);
      part.current = clamp(part.current, 0, part.max);
    } else if (field === "armor") {
      part.armor = clamp(part.armor + delta, 0, 99);
    }

    return next;
  });
  await ensureOverlayForToken(token.id);
  await syncState();
}

async function setBodyField(partName, field, value) {
  if (!isEditable()) {
    setStatus("Only the GM can edit body values.", "error");
    return;
  }

  const token = getCharacterById(activeTokenId);
  if (!token || !isTrackedCharacter(token)) {
    setStatus("Select a tracked character first.", "error");
    return;
  }

  await updateTrackerData(token.id, (current) => {
    const next = structuredClone(current);
    const part = next.body[partName];
    if (!part) return next;

    const numericValue = clamp(Number(value) || 0, 0, 99);
    if (field === "current") {
      part.current = clamp(numericValue, 0, part.max);
    } else if (field === "max") {
      part.max = numericValue;
      part.current = clamp(part.current, 0, part.max);
    } else if (field === "armor") {
      part.armor = numericValue;
    }

    return next;
  });
  await ensureOverlayForToken(token.id);
  await syncState();
}

function bindUiEvents() {
  ui.refreshBtn.addEventListener("click", () => {
    void syncState(true).catch((error) => {
      setStatus(error?.message ?? "Refresh failed.", "error");
    });
  });

  ui.syncBtn.addEventListener("click", () => {
    if (!isEditable()) {
      setStatus("Only the GM can rebuild overlays.", "error");
      return;
    }

    void syncTrackedOverlays()
      .then(() => syncState())
      .then(() => {
        setStatus("Tracked overlays rebuilt.", "success");
      })
      .catch((error) => {
        setStatus(error?.message ?? "Overlay rebuild failed.", "error");
      });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const actionNode = target.closest("[data-action]");
    if (!(actionNode instanceof HTMLElement)) return;

    const action = actionNode.dataset.action;
    const tokenId = actionNode.dataset.tokenId;
    const partName = actionNode.dataset.part;
    const field = actionNode.dataset.field;
    const delta = Number(actionNode.dataset.delta ?? 0);

    if (action === "select-character" && tokenId) {
      void selectCharacter(tokenId).catch((error) => {
        setStatus(error?.message ?? "Unable to select token.", "error");
      });
    }

    if (action === "toggle-track-specific" && tokenId) {
      void toggleTracking(tokenId).catch((error) => {
        setStatus(error?.message ?? "Unable to toggle tracking.", "error");
      });
    }

    if (action === "toggle-tracking" && activeTokenId) {
      void toggleTracking(activeTokenId).catch((error) => {
        setStatus(error?.message ?? "Unable to toggle tracking.", "error");
      });
    }

    if (action === "focus-token" && activeTokenId) {
      void selectCharacter(activeTokenId).catch((error) => {
        setStatus(error?.message ?? "Unable to focus token.", "error");
      });
    }

    if (action === "change-damage") {
      const kind = actionNode.dataset.kind;
      if (!kind) return;
      void changeDamage(kind, delta).catch((error) => {
        setStatus(error?.message ?? "Unable to update damage.", "error");
      });
    }

    if (action === "change-part" && partName && field) {
      void changeBodyField(partName, field, delta).catch((error) => {
        setStatus(error?.message ?? "Unable to update body value.", "error");
      });
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.dataset.action !== "set-field") return;

    const partName = target.dataset.part;
    const field = target.dataset.field;
    if (!partName || !field) return;

    void setBodyField(partName, field, target.value).catch((error) => {
      setStatus(error?.message ?? "Unable to save field.", "error");
    });
  });
}

OBR.onReady(async () => {
  try {
    bindUiEvents();
    await syncState(true);
    setStatus(
      "Ready. Select a character token on the map to edit it here.",
      "info"
    );

    OBR.scene.items.onChange((items) => {
      sceneItems = items;
      render();
    });

    OBR.player.onChange(async () => {
      playerRole = await OBR.player.getRole();
      selectionIds = (await OBR.player.getSelection()) ?? [];
      render();
    });
  } catch (error) {
    setStatus(error?.message ?? "Extension failed to initialize.", "error");
  }
});
