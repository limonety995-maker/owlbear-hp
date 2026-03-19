import {
  OBR,
  META_KEY,
  getCharacterName,
  isCharacterToken,
  isTrackedCharacter,
  setTrackedState,
  syncTrackedOverlays,
} from "./shared.js?v=1.0.1";

const EXTENSION_MENU_ID = "com.codex.body-hp/context-menu";
let currentRole = "PLAYER";
const ADD_ICON_URL = new URL("./add.svg", import.meta.url).href;
const REMOVE_ICON_URL = new URL("./remove.svg", import.meta.url).href;

async function updateBadge() {
  try {
    const items = await OBR.scene.items.getItems();
    const trackedCount = items.filter(isTrackedCharacter).length;
    await OBR.action.setBadgeText(trackedCount ? String(trackedCount) : undefined);
  } catch (error) {
    console.warn("[Body HP] Unable to update badge", error);
  }
}

async function toggleTracking(items) {
  const characters = items.filter(isCharacterToken);
  if (!characters.length) return;

  const enableTracking = characters.every((item) => !isTrackedCharacter(item));

  for (const character of characters) {
    await setTrackedState(character.id, enableTracking);
  }

  console.log(
    `[Body HP] ${enableTracking ? "Tracking" : "Untracking"}: ${characters
      .map(getCharacterName)
      .join(", ")}`
  );

  await updateBadge();
}

async function setupContextMenu() {
  await OBR.contextMenu.create({
    id: EXTENSION_MENU_ID,
    roles: ["GM"],
    icons: [
      {
        icon: ADD_ICON_URL,
        label: "Track Body HP",
        filter: {
          every: [
            { key: "layer", value: "CHARACTER" },
            { key: ["metadata", META_KEY], value: undefined },
          ],
        },
      },
      {
        icon: REMOVE_ICON_URL,
        label: "Remove Body HP",
        filter: {
          every: [{ key: "layer", value: "CHARACTER" }],
        },
      },
    ],
    onClick(context) {
      return toggleTracking(context.items).catch((error) => {
        console.error("[Body HP] Context menu failed", error);
      });
    },
  });
}

OBR.onReady(async () => {
  try {
    currentRole = await OBR.player.getRole();

    await setupContextMenu();
    await updateBadge();

    if (currentRole === "GM") {
      await syncTrackedOverlays();
    }

    OBR.scene.items.onChange(() => {
      void updateBadge();
    });

    OBR.player.onChange(async () => {
      const nextRole = await OBR.player.getRole();
      if (nextRole !== currentRole && nextRole === "GM") {
        await syncTrackedOverlays();
      }
      currentRole = nextRole;
    });

    console.log("[Body HP] Background ready");
  } catch (error) {
    console.error("[Body HP] Background init failed", error);
  }
});
