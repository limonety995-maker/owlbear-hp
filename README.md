# Body HP Tracker

Static Owlbear Rodeo extension for shared body-part HP overlays.

## What it does

- Tracks only tokens on the `CHARACTER` layer, which matches tokens dropped from the Owlbear Rodeo Characters dock.
- Lets the GM choose exactly which character tokens are tracked.
- Shows a translucent panel to the right of each tracked token.
- Shows minor damage dots in the lower-left corner of the token.
- Shows serious damage bars in the upper-right corner of the token.
- Shares the overlays with everyone in the room because they are real scene attachments.

## Files

- `manifest.json` - Owlbear Rodeo extension manifest
- `background.html` and `background.js` - background page for context menu and startup sync
- `index.html`, `main.js`, `styles.css` - action popover UI
- `shared.js` - tracker data and overlay helpers

## Install

1. Host this folder on any static HTTPS host.
2. Install the hosted `manifest.json` URL in Owlbear Rodeo.
3. Enable the extension in the room.

## GM flow

1. Add character tokens to the map from Owlbear Rodeo Characters.
2. Either use the token context menu or the extension panel to track a token.
3. Select a tracked token on the map.
4. Edit body HP, armor, minor damage, and serious damage in the panel.

## Notes

- Players can view the tracked state in the extension and will always see the shared overlays on the map.
- Only the GM can add or remove tracking and edit values.

## Repository fixes included

- Fixed the remove action in the token context menu so it only appears for tracked character tokens.
- Added automatic overlay re-sync in the background page so shared panels recover if overlays are deleted or the token changes size/name.
- Namespaced overlay metadata to avoid collisions with other extensions.
