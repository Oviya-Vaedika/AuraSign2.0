# Aura Sign (Beta)

A responsive educational prototype for exploring text-to-sign animation concepts and camera hand-landmark visualization.

## Files
- `index.html` — application structure
- `style.css` — responsive dark purple/cyan UI
- `app.js` — navigation, modes, shared state and small interactions
- `avatar.js` — animated Canvas wireframe avatar and articulated illustrative fingers
- `translator.js` — phrase tokenization, playback controls and dictionary UI
- `dictionary.js` — sample phrase catalog
- `camera.js` — webcam access and optional MediaPipe Hands landmark overlay

## Run it
1. Extract the ZIP.
2. Open the folder in an editor.
3. Run it with a local web server (for example, VS Code Live Server) or deploy it to an HTTPS host.
4. Camera access requires browser permission and generally works only on HTTPS or localhost.
5. An internet connection is needed for Google Fonts and the MediaPipe CDN. The camera loader tries two CDN hosts, but network restrictions can still block the model.

## Important limitations
- Text-to-sign is an **illustrative animation demo**, not a validated sign-language translator. The Canvas avatar's movements are generic and are not accurate ASL/International Sign gloss-to-motion mappings.
- The camera module uses MediaPipe Hands to track 21 landmarks and a lightweight rule-based classifier for a limited set of visible hand poses (open hand, closed fist, pointing, V-shape, L-shape, thumbs-up, and a few related shapes). It can fail with poor lighting, occlusion, unusual angles, or fingers outside the frame. These are **hand-pose labels, not sign-language translation**. Recognizing real signs and converting them into words requires a trained temporal model and a properly labeled sign-language dataset.
- ASL and International Sign are not interchangeable. Have fluent signers review any real educational or accessibility content before public use.

## Camera testing tips
- Use Chrome or Edge on `localhost` or an HTTPS deployment.
- Allow camera permission when prompted; close other apps that may be using the camera.
- Put one hand fully inside the frame, palm facing the camera, in bright even lighting.
- Hold each pose steadily for about one second. The output should show a pose label after it remains stable.
- If the model does not load, check internet access to jsDelivr/unpkg and reload the page.
