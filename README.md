# Pshop Music — E-Commerce Site

Static, dark-mode/gold e-commerce site for Pshop Music (DJ & audio equipment, Nha Trang). Built as vanilla HTML/CSS/JS — no build step, deploy as-is.

## Structure

```
index.html          Customer-facing site (hero, product grid, services, contact, modal)
admin.html           Password-gated admin panel (CRUD)
css/style.css         Shared site styles (dark/gold theme)
css/admin.css         Admin panel styles
js/db.js              Data layer — localStorage today, Firebase-swappable API
js/products-seed.js   Auto-generated seed data (41 products extracted from the original site)
js/main.js            Customer site logic: render, filter, search, pagination, modal
js/admin.js           Admin panel logic: auth gate, CRUD, JSON import/export
data/products.json    Same product data as products-seed.js, plain JSON for reference/backup
scripts/extract.js    One-off script that generated products.json / products-seed.js from the legacy pshopmusic.html
netlify.toml          Netlify deploy config
```

## Running locally

No build step needed. Either:
- Open `index.html` directly in a browser, or
- Serve the folder with any static server (recommended, avoids `file://` quirks):
  ```
  npx serve .
  ```

## Data & storage

Product data lives in the browser's `localStorage` (key `pshop_products`), seeded on first load from `js/products-seed.js`. This means:
- Each browser/device has its own copy until you sync via export/import (see Admin below).
- Data persists across reloads on the same browser, but is **not shared** between visitors — this is a development-grade setup, matching the "localStorage (development)" option in the spec.

## Admin panel

Go to `/admin.html`. Default password: **`pshop2024`** — change it in `js/admin.js` (`ADMIN_PASSWORD` constant) before deploying.

⚠️ This is a **client-side-only** password gate (JS check against a constant in the shipped source). It stops casual browsing, not a determined attacker who reads the source. Do not use it to protect anything sensitive — see "Upgrading to Firebase" below for real auth.

Admin features:
- Add / edit / delete products, all fields (name, category, brand, specs line, price, badge text, description, image URL, New/Used status).
- Search/filter the product list.
- **Export JSON** — downloads current product data. Use this to back up or to hand off data after editing.
- **Import JSON** — replaces all products with a JSON file (accepts either `{ "products": [...] }` or a raw array).
- **Khôi phục dữ liệu gốc** — resets back to the original seed data.

### Publishing admin edits to your live site

Because storage is per-browser localStorage, edits made in the admin panel on your machine won't automatically appear for site visitors. Workflow:
1. Edit products in `/admin.html`.
2. Click **Xuất JSON** to download the updated data.
3. Replace `data/products.json`'s contents into `js/products-seed.js` (wrap in `const SEED_PRODUCTS = ...;`), or re-run `node scripts/extract.js`-style regeneration with the new JSON.
4. Redeploy.

This manual step goes away once you move to Firebase (next section), where admin writes go straight to the live database.

## Upgrading to Firebase Realtime Database + Auth

The spec calls out Firebase as the production option. `js/db.js` is written so this swap only touches that one file — nothing in `main.js` or `admin.js` needs to change, since they only call `DB.getAll()`, `DB.add()`, `DB.update()`, `DB.remove()`.

1. Create a Firebase project, enable Realtime Database and Authentication (Email/Password).
2. Add the Firebase SDK `<script>` tags to `index.html` and `admin.html`, with your project config.
3. Rewrite the body of each `DB.*` function in `js/db.js` to call `firebase.database().ref('products')` instead of `localStorage` — same function names, same return shapes (Promises), so callers don't change.
4. Replace the password check in `js/admin.js` with `firebase.auth().signInWithEmailAndPassword(...)`.
5. Products already follow the schema from the original spec (`name`, `category`, `brand`, `description`, `price`, `image`, `status`, `createdAt`), so no data remodeling is needed — just push `data/products.json`'s `products` array into `/products/{id}` nodes once.

## Image hosting (optional Cloudinary)

Product images are plain URLs (`image` field) — paste any hosted image URL into the admin form. To use Cloudinary: upload images there, paste the resulting `https://res.cloudinary.com/...` URL into the image field. No code changes required since the site just renders whatever URL is given (with `onerror` fallback to hide broken images).

## Deploying to Netlify

1. Push this folder to a Git repo, or drag-and-drop the folder into Netlify's dashboard.
2. Netlify will use `netlify.toml` (publish directory `.`, no build command needed — static files).
3. Set a custom domain / HTTPS via Netlify's dashboard as usual.
4. **Change `ADMIN_PASSWORD` in `js/admin.js` before deploying** — the default is for local development only.

## Contact integration

- Phone / Zalo: `0901952999` — used in `tel:` links and Zalo deep link (`https://zalo.me/0901952999`) throughout the product modal, nav, and footer.
- Facebook: `https://www.facebook.com/ChoThueThietBiDJ` — used as the modal's secondary CTA for non-accessory categories.
- Shopee: `https://shopee.vn/music_store_79` — used as the modal's secondary CTA for accessories (phụ kiện), plus the "Xem trên Shopee" section on the products page.

## Notes

- Responsive: mobile-first breakpoints at 900px / 700px / 600px / 400px, matching the original design system.
- Product grid: search (debounced) + category tabs + "Xem thêm" pagination (12 products per page) to keep the DOM light with 40+ items.
- All 41 products from the legacy `pshopmusic.html` were extracted programmatically (see `scripts/extract.js`) — names, brand/specs lines, full descriptions, images, New/Used status, and the one product that had an explicit price (Lexar JumpDrive P30) all carried over intact.
