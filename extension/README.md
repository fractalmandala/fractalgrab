# FractalGrab Clipper (Chrome / Edge / Brave / Arc)

A free companion clipper. Right-click anything on the web — a page, link,
image, or a text selection — and it lands in your FractalGrab library as a
**real file**. It only ever talks to the app on your own machine
(`http://127.0.0.1:48123`); nothing leaves your Mac.

## Install (unpacked, for now)

1. Open the app and go to **Settings → Browser extension server** — turn it on.
2. In Chrome/Edge/Brave/Arc: open `chrome://extensions` (or the equivalent
   `edge://extensions` / `brave://extensions`).
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and choose this `extension/` folder.

## Use

- **Right-click a page / link / image / selection** → *Save … to FractalGrab*.
- **Right-click a page** → *Pick an element to save…*, then click any element:
  links save as `.webloc`, images save as real image files, anything else saves
  as a text note.
- **Toolbar popup** — quick "Save this page", element picking, and an app
  status indicator.

Images are downloaded and stored as files; links become `.webloc` files that
open in your browser; selections become `.md` notes. Everything lands in your
library folder, ready to tag, file, and find.
