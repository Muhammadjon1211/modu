# Multi-Vendor Clothing Marketplace — Full Specification & Build Prompt

> **Working title:** _(rename freely)_
> **Stack:** Backend — **NestJS** · Frontend — **Next.js** · Database — **MongoDB**
> **Legend:** Plain text = your original requirement, reworded for clarity. **`[ADDED]`** = a recommendation I added because it is crucial business/technical logic. **`[DECISION NEEDED]`** = a choice you should make before building.

---

## 0. Reading Notes

- This is a **multi-vendor marketplace**, not a single-shop store. Many independent clothing shops register, get a storefront, and sell their own products under one shared platform. Think "Amazon / Coupang for clothing," not "one brand's website."
- **`[MISSING INPUT]`** You mentioned uploading a design image to match. No image was attached to the message. The Frontend section below lists every screen and component you asked for, but the **visual style (colors, typography, spacing, layout personality) is left as a placeholder** — please share the image and I'll lock the design tokens to it.

---

## 1. Product Vision

A platform where:

1. **Customers** browse, search, and buy clothing from many shops in one place.
2. **Shop owners** register a shop, list products, run promotions, manage orders, and talk to customers.
3. **A super admin** oversees all users and shops, monitors performance and profit, and controls shop status.

All shops share **one common category system** so products are filterable and comparable across the whole platform.

---

## 2. User Roles & Permissions

| Role | Who | Core capability |
|------|-----|-----------------|
| **Customer (User)** | Anyone who signs up | Browse, buy, review, follow, chat |
| **Shop Owner / Shop Admin** | A verified seller | Manage their own shop, products, orders, promotions, customers |
| **Super Admin** | Platform operator | Full visibility over all users & shops; controls shop lifecycle |

**`[ADDED]` — Access control:** Use **Role-Based Access Control (RBAC)** with NestJS Guards. A shop admin may only ever touch data belonging to their own shop (enforce ownership checks on every write, not just the role). Super admin bypasses shop scoping.

**`[ADDED]` — Shop onboarding flow:** When a seller registers a shop, it should start in a **`pending`** state and require **super-admin approval** before it goes `active` and becomes publicly visible. This prevents spam/fraud shops. _(See shop status below.)_

---

## 3. Shared Domain Model (applies to all shops)

### 3.1 Categories (shared taxonomy)
Every product belongs to one shared category, and every category belongs to one of **two top-level groups**. These two groups are the site's two main catalog tabs (see §8.1):

**Group A — Clothes**
- **Top** (t-shirt, shirt, hoodie, sweater, …)
- **Bottom** (jeans, trousers, skirts, shorts, …)
- **`[ADDED]` Outerwear** (jackets, coats)
- **`[ADDED]` Dresses / One-piece**
- **`[ADDED]` Activewear / Sportswear**
- **`[ADDED]` Underwear & Loungewear**
- **Shoes** — **`[DECISION NEEDED]`** placed under Clothes by default (footwear = "worn"). If you'd rather it live under Accessories, that's a one-field change (the category's `group` value) — no other logic changes.

**Group B — Accessories**
- **Bags**
- **`[ADDED]` Hats & Caps**
- **`[ADDED]` Belts**
- **`[ADDED]` Jewelry & Watches**
- **`[ADDED]` Scarves & Gloves**
- **`[ADDED]` Sunglasses**
- **`[ADDED]` Other accessories** (catch-all)

**`[ADDED]` — Group logic (the change you asked for):** the catalog splits into **Clothes** and **Accessories** at the top level instead of one "All Products" list. A product's group is **derived from its category's `group` field** — the shop owner only picks a leaf category, and the tab the product appears under follows automatically. This keeps the taxonomy single-sourced and makes it impossible to mis-tab a product.

**`[ADDED]`** Make categories **hierarchical** within each group (e.g., `Clothes → Top → T-shirt / Shirt / Hoodie`). Store as a tree (parent reference) with a top-level `group`. Only the super admin edits the taxonomy so it stays consistent across all shops.

### 3.2 Filters (customer-facing)
Products are filterable by:

- **Gender fit:** Male, Female, Unisex
- **Season:** Summer, Winter, Autumn, Spring
- **Price** (range slider)
- **Sale** (currently discounted)
- **Newest** (recently added)
- **Oversize** (fit type)
- **`[ADDED]` Size** (XS–XXL, numeric shoe sizes)
- **`[ADDED]` Color**
- **`[ADDED]` Shop / Brand**
- **`[ADDED]` Rating** (e.g., 4★ & up)
- **`[ADDED]` Availability** (in stock only)
- **`[ADDED]` Material / Fabric** (optional)
- **`[ADDED]` Sort options:** best-selling, price ↑/↓, newest, top-rated

**`[ADDED]` — Tab scoping:** the active top-level tab (**Clothes** or **Accessories**) pre-scopes the catalog to that group, and the **Category** filter inside then lists only that group's categories. Global **search** may still span both groups (a query can return clothes and accessories together) unless the user is already inside a specific tab.

### 3.3 Product Status
- **Active** — visible and buyable
- **Out of stock** — visible but not buyable
- **Deleted** — hidden (soft delete; keep record for order history & analytics)
- **`[ADDED]` Draft** — being prepared, not yet published
- **`[ADDED]` Paused** — temporarily hidden by the shop owner

> **`[ADDED]` — Soft delete everywhere.** Never hard-delete products, shops, or users that appear in past orders. Mark them deleted/inactive so historical orders, reviews, and analytics stay intact.

### 3.4 Product Data (input fields)
- Name
- Description
- Images (multiple)
- Category
- Sizes
- Colors
- Price
- Quantity
- **`[ADDED]` Gender fit** (male / female / unisex)
- **`[ADDED]` Season** (one or more)
- **`[ADDED]` Fit type** (regular / oversize / slim)
- **`[ADDED]` Tags** (free-text keywords for search & filters)
- **`[ADDED]` Material / care info**
- **`[ADDED]` SKU** (auto-generated per variant)

> ### 3.5 `[ADDED]` — Product Variants & Stock (critical logic)
> A clothing item's stock is **not** a single number. It depends on **size × color**. Model it as **variants**:
>
> ```
> Product "Basic Hoodie"
>   ├─ Variant: Black / M  → SKU, stock: 12, (optional price override)
>   ├─ Variant: Black / L  → SKU, stock: 3
>   └─ Variant: White / M  → SKU, stock: 0  (this combo out of stock)
> ```
>
> - "Quantity" therefore lives **per variant**, not per product.
> - Product-level status `out of stock` = **all** variants at 0.
> - Checkout decrements the **specific variant's** stock, guarded against overselling (atomic update / conditional decrement).

### 3.6 Product Actions & Metrics
- **Save** (add to wishlist)
- **Share** (copy link / social share)
- **`[ADDED]` Add to cart / Buy now**
- **Metrics tracked per product:**
  - Views (card viewed / detail viewed)
  - Units sold
  - Saves count
- **Badges:** best-selling products get a **"Top" / "Best"** badge automatically (derived from units sold over a rolling window — not set manually).
  - **`[ADDED]`** Also support **"New"** (recently added) and **"Sale"** badges.

### 3.7 Reviews & Ratings
- Product cards show **review stars** (average rating).
- **`[ADDED]`** Only customers who **actually bought** the product (verified purchase, tied to an order) can leave a rating/review — this protects rating integrity.
- **`[ADDED]`** A shop's overall star rating is the aggregate of its products' reviews.

### 3.8 Comments (separate from reviews)
- Customers can **comment** on a product.
- Customers can **reply** to another comment (threaded / nested).
- Customers can **like** others' comments.
- **`[ADDED]`** Shop owners can reply to comments from their admin panel (see §5.6). Shop replies are visually marked as "from the seller."
- **`[ADDED]` Moderation:** allow reporting of abusive comments; super admin can remove them.

### 3.9 Follow
- Customers can **follow shops**. Following drives a personalized feed and notifications about that shop's new products and promos.

### 3.10 Chat
- Real-time **chat between customers and shop admins**.
- **`[ADDED]`** Implement over **WebSockets (Socket.IO)** with persisted message history; support unread counts and basic online/last-seen status. One conversation per (customer, shop) pair.

---

## 4. Customer (User) Area

The customer's personal space includes:

- **Orders** — current and past orders with status tracking.
- **History** — visited products and visited shops.
- **Activity** — the user's own likes, comments, and replies.
- **Following** — shops the user follows.
- **Settings** — edit profile image and name.
- **Payment methods** — save payment details for faster checkout.
  - **`[ADDED]` — Security:** Do **not** store raw card numbers. Use a payment provider's tokenization; store only the provider token + last-4 + card brand. This is a hard PCI-DSS requirement. **`[DECISION NEEDED]`** pick a gateway (in Korea: **Toss Payments** or **KakaoPay**; internationally: **Stripe**).

**`[ADDED]` — Also needed in the customer area:**
- **Shopping cart** (multi-shop aware — see §7).
- **Wishlist / saved items** (the "Save" action's destination).
- **Shipping addresses** (add/edit/default).
- **Coupons & promo codes wallet** (codes the user has, plus targeted coupons from shops — see §5.5).
- **Notifications** (order updates, chat replies, promos from followed shops).
- **`[ADDED]` AI-recommendation profile** — gender, height, weight, preferred style (the questions you mentioned for recommendations). **Privacy note:** height/weight are sensitive personal data — collect them optionally, with consent, and store them access-controlled.

---

## 5. Shop Owner / Shop Admin Panel

For the owner of a single shop, scoped strictly to that shop's data.

### 5.1 Customers List
- List of the shop's customers with basic info: name + what they've bought (items, totals).
- Purpose: identify **top customers** and reward them with **coupons**.
- **`[ADDED]`** Show per-customer: total spent, number of orders, last order date; sortable to surface VIPs.

### 5.2 Products List & Product Filters
Filter the shop's own products by:
- Sold
- Active
- Out of stock
- Most sold
- Least sold (most _not_ sold)
- **`[ADDED]`** Draft / paused, and by category.

### 5.3 Product Input — Step-by-Step Wizard
A clear, guided multi-step form:
1. **Basics** — name, description, category, gender, season, tags
2. **Media** — upload images (with reordering + primary image)
3. **Variants** — sizes × colors → generate variants, set stock per variant
4. **Pricing** — base price + optional per-variant price
5. **Discount** — see §5.4
6. **Review & publish** — draft or publish

### 5.4 Discount Logic
- Per-product discount: **percentage** or **fixed amount**, with optional start/end dates.
- Discounted products automatically qualify for the **Sale** filter/badge.
- **`[ADDED]`** Guardrails: discounted price must be > 0 and below original; validate date ranges.

### 5.5 Promotions & Promo Codes
- Shop can issue promo codes (e.g., **`NEWYEAR2026`**).
- Active promo codes surface on the **main page's promo section**, and optionally in the **hero section**.
- **`[ADDED]` — Promotion types:**
  - Code-based discount (percentage / fixed)
  - **Threshold offers** — e.g., "buy 5 items, get 10% off" (your example) — shown on the shop page as promo news.
  - **Targeted coupons** — issued to specific top customers (ties to §5.1).
- **`[ADDED]`** Each promo has: validity window, usage limit (total + per user), min-spend/min-items conditions, and visibility flags (`showOnHome`, `showInHero`, `showOnShopPage`).

### 5.6 Comments Management
- A tab listing comments left on the shop's products, showing **which product** each comment is on, with the ability to **reply directly** from the admin panel.

### 5.7 Public Shop Page (customer-facing storefront)
When a customer opens a shop, they see:
- Shop name
- Followers count
- Products in stock
- Number of customers who bought
- Total products
- Review star rating
- Contact & address
- Visible **promo codes / discount news** (e.g., "buy 5 get 10% off")
- **`[ADDED]`** Shop logo/banner, description, social links, and the shop's product grid with the same filters as the global catalog.

### 5.8 Shop Settings
- Shop image (logo/banner)
- Name
- Description
- Location
- Contact
- Social media links

**`[ADDED]` — Also crucial for shops:**
- **Order management** — view incoming orders, update fulfillment status (processing → shipped → delivered), attach tracking numbers.
- **Dashboard** — revenue, units sold, views→sales conversion, top products, low-stock alerts.
- **Payout/settlement view** — **`[DECISION NEEDED]`** define the platform commission model (see §9).

---

## 6. Super Admin Panel

Platform-wide oversight.

### 6.1 All Users List (full profile per user)
- Name
- Products bought
- Followed shops (able to see **which** shops)
- History of bought items
- History of liked & saved products
- Total money spent
- Total time spent on the website
- Height, weight (for AI recommendation)

> **`[ADDED]` — Sensitive data:** total-time-on-site and height/weight are personal/behavioral data. Gate access to super admin only, log access, and expose only what's needed. Consider a privacy policy + consent for the AI-profile fields.

### 6.2 AI Recommendation (foundation)
- Collect **gender, height, weight, preferred style** via onboarding questions.
- Use these to show **personalized recommendations** that differ per user.
- **`[ADDED]`** Phase 1: rule-based/similarity recommendations (by style, size, gender, purchase history). Phase 2: swap in an ML model. Design the data capture now (events + profile) so the model has training data later.

### 6.3 Per-Shop Detail
- Number of products
- Followers
- Comments
- Reviews
- Per-product info: units sold and **profit**
- **`[ADDED]`** Revenue trend, conversion, refund rate.

### 6.4 Shop Lifecycle Control
Super admin can change shop status:
- **Active**
- **Paused**
- **Deleted**
- **`[ADDED]` Pending** (awaiting approval, from onboarding).

---

## 7. `[ADDED]` — Cart, Checkout & Orders (critical marketplace logic)

You listed "orders" and "payment methods" but not the flow that connects them. This is the backbone of any marketplace:

1. **Cart** — a customer can add items from **multiple shops** into one cart.
2. **Checkout** — one payment, but the order **splits by shop** into **sub-orders (fulfillments)**, because each shop ships independently.
   - `Order` (customer-level: payment, totals, shipping address)
   - `→ ShopOrder / Fulfillment` (per shop: its items, its status, its tracking)
3. **Order status lifecycle:** `pending_payment → paid → processing → shipped → delivered → completed`; plus `cancelled` and `refunded`.
4. **Stock:** decrement variant stock atomically on successful payment; restore on cancel/refund.
5. **Returns/refunds:** basic flow so orders can be reversed and metrics corrected.
6. **Shipping:** address, method, and (later) delivery tracking.

---

## 8. Cross-Cutting Frontend Requirements (Next.js)

### 8.1 Screens & Sections you listed
- **Home page** with: hero section, top products, top shops, recommendations, promo-codes section, FAQ.
- **Two main catalog tabs — Clothes and Accessories** (replacing a single "All Products" tab): each is a catalog scoped to its category group, with the full filter set + sort + search. The two tabs share the same layout and Product Card; only the category group differs.
- **Shops tab** (browse all shops).
- **Product card** (compact): image, name, price, sale badge, stars, save & share, top/best badge.
- **Product detail page ("inner card page")**: gallery, variant selectors (size/color), price/discount, add-to-cart/buy, description, reviews & stars, comments section (threaded, likeable), related products.
- **Comments section** and **reviews section** (distinct).
- **FAQ** section.
- **Search bar** (global).

### 8.2 Global UI
- **Languages:** Korean (KR), English (EN), Russian (RU) — full i18n.
  - **`[ADDED]`** Separate **UI translation** (static strings via i18n) from **content translation** (product names/descriptions written by shops). **`[DECISION NEEDED]`** will shops enter content in all three languages, or do you auto-translate/fallback to one default language?
- **Theme:** dark and light mode.
- **`[ADDED]` Responsive** (mobile-first) and **SEO** — use Next.js SSR/SSG for product & shop pages so they're indexable and fast.

### 8.3 Design system
- **`[MISSING INPUT]`** Match the uploaded design image. Once provided, define design tokens (color palette, typography scale, spacing, radius, shadows, component styles) and build reusable components (Card, Button, Badge, Rating, FilterBar, etc.) from them.

---

## 9. `[ADDED]` — Business & Platform Decisions Needed

1. **Revenue model** — commission per sale? Monthly shop subscription? Both? (Super admin sees "profit," so the platform's cut must be defined.)
2. **Payment gateway** — Toss / KakaoPay / Stripe (affects payment-method storage & payouts).
3. **Payout/settlement** — how and when shops get paid.
4. **Content i18n** — per §8.2.
5. **Image hosting** — object storage (e.g., S3-compatible) + CDN + image optimization; don't store images in MongoDB.
6. **Verified reviews** — confirm reviews require a purchase.
7. **Shop approval** — confirm the pending→approved flow.

---

## 10. Data Model (MongoDB Collections)

High-level shapes — refine during build. Use references (not deep embedding) for anything queried independently; embed only tightly-owned sub-data (like product variants).

```
users
  _id, role (customer|shop_owner|super_admin)
  name, email, passwordHash, avatar
  addresses[], paymentMethods[] (provider tokens only, last4, brand)
  aiProfile { gender, height, weight, preferredStyle }   // sensitive
  metrics { totalSpent, totalTimeMs }
  createdAt, status

shops
  _id, ownerId → users
  name, slug, description, logo, banner
  location, contact, socials{}
  status (pending|active|paused|deleted)
  ratingAvg, ratingCount, followersCount
  commissionRate                        // platform cut
  createdAt

categories
  _id, name, parentId (nullable), slug
  group (clothes|accessories)            // top-level tab this category lives under
  // shared, super-admin managed

products
  _id, shopId → shops
  name, description, images[], categoryId
  group (clothes|accessories)            // denormalized from category → fast tab queries
  gender (male|female|unisex), seasons[], fitType, tags[], material
  basePrice, discount { type, value, startsAt, endsAt }
  variants[ { sku, size, color, priceOverride, stock } ]   // stock lives here
  status (draft|active|paused|out_of_stock|deleted)
  metrics { views, saves, unitsSold }
  badges[] (top|new|sale)               // top/best derived, not manual
  ratingAvg, ratingCount, createdAt

carts
  _id, userId, items[ { productId, variantSku, qty } ]

orders
  _id, userId, shippingAddress, paymentStatus, paymentRef
  totals { subtotal, discount, shipping, grandTotal }
  createdAt

fulfillments   // per-shop sub-order
  _id, orderId, shopId
  items[ { productId, variantSku, qty, unitPrice } ]
  status (paid|processing|shipped|delivered|completed|cancelled|refunded)
  tracking

reviews
  _id, userId, productId, orderId (verified purchase)
  rating (1..5), text, images[], createdAt

comments
  _id, productId, userId, parentId (nullable → reply)
  text, likes[] (userIds), isSellerReply, createdAt

follows
  _id, userId, shopId, createdAt

wishlist
  _id, userId, productId, createdAt

promotions
  _id, shopId (or null = platform-wide)
  code, type (percentage|fixed|threshold), value
  conditions { minSpend, minItems }
  usageLimit, perUserLimit, usedCount
  startsAt, endsAt
  visibility { showOnHome, showInHero, showOnShopPage }

coupons          // targeted to specific users (top customers)
  _id, shopId, userId, promotionId, redeemed

conversations    // chat
  _id, userId, shopId, lastMessageAt
messages
  _id, conversationId, senderRole, senderId, text, readAt, createdAt

notifications
  _id, userId, type, payload, readAt, createdAt

events           // analytics: views, time-on-site, history
  _id, userId, type (view_product|view_shop|...), refId, meta, createdAt
```

---

## 11. Backend Architecture (NestJS)

Organize by **feature module**, each with controller / service / schema / DTOs. Suggested modules:

- `auth` (JWT + refresh, RBAC guards, email verification, password reset; **`[ADDED]`** OAuth — Google/Kakao given Korea)
- `users`
- `shops` (+ approval, status, public storefront endpoints)
- `categories` (two-group taxonomy: `clothes` / `accessories`; group drives the two catalog tabs)
- `products` (+ variants, discounts, badge computation job; list endpoint filters by `group` for the Clothes / Accessories tabs)
- `search` (MongoDB text indexes; **`[ADDED]`** consider Atlas Search / Meilisearch later)
- `cart`
- `orders` + `fulfillments`
- `payments` (gateway adapter; webhooks for payment confirmation)
- `reviews`
- `comments`
- `follows`
- `wishlist`
- `promotions` + `coupons`
- `chat` (WebSocket gateway)
- `notifications`
- `analytics` / `events`
- `admin` (super-admin aggregations & shop lifecycle)
- `recommendations` (rule-based now, ML-ready later)
- `uploads` (signed URLs to object storage)

**`[ADDED]` — Cross-cutting:**
- Global validation pipe + DTO validation (`class-validator`).
- Centralized error handling & response shape.
- Rate limiting, Helmet, CORS.
- Ownership guards (a shop admin can only mutate their own shop's resources).
- Background jobs (badge recomputation, promo expiry) via a queue (e.g., BullMQ).
- Pagination + indexing on every list endpoint.

---

## 12. Frontend Architecture (Next.js)

- **App Router**, server components for catalog/detail (SEO), client components for interactive bits (cart, chat, filters).
- **State:** server state via React Query/SWR; light global state (cart, theme, locale) via context/zustand.
- **i18n:** `next-intl` or `next-i18next` for KR/EN/RU.
- **Theming:** CSS variables + a `dark`/`light` toggle persisted to the user profile.
- **Routes (indicative):**
  - `/` home (hero, top products, top shops, promos, recommendations, FAQ)
  - `/clothes` Clothes tab — catalog scoped to the clothes group + filters + search
  - `/accessories` Accessories tab — catalog scoped to the accessories group + filters + search
  - `/search` cross-group search results (can span both tabs)
  - `/products/[id]` product detail (inner card page)
  - `/shops` all shops
  - `/shops/[slug]` public shop page
  - `/cart`, `/checkout`
  - `/account/*` orders, history, activity, following, wishlist, addresses, payment methods, settings, AI profile
  - `/shop-admin/*` (shop owner) dashboard, products, product wizard, orders, customers, promotions, comments, settings
  - `/super-admin/*` users, shops, shop detail, moderation

---

## 13. Suggested Build Phases

1. **Foundation** — auth + RBAC, users, shops (with approval), category tree, product + variants, image upload, i18n + theme, basic catalog & product page.
2. **Commerce** — cart, checkout, payment gateway, orders + per-shop fulfillments, stock decrement, order tracking.
3. **Engagement** — reviews (verified), comments/replies/likes, follow, wishlist, save/share, badges.
4. **Shop tools** — shop admin dashboard, product wizard, discounts, promotions/promo codes, customers list & coupons, comment replies.
5. **Platform** — super-admin users & shops oversight, profit/analytics, shop lifecycle, moderation.
6. **Chat & notifications** — real-time chat, notifications.
7. **AI recommendations** — capture profile + events; rule-based recs first, ML later.

---

## 14. `[ADDED]` — Summary of Crucial Additions

These weren't in the original prompt but the marketplace can't function without them:

1. **Cart + checkout + multi-shop order splitting** (§7)
2. **Product variants with per-variant stock** (§3.5)
3. **Auth + RBAC + ownership enforcement** (§2)
4. **Shop approval / lifecycle (pending state)** (§2, §6.4)
5. **Payment tokenization (no raw card storage)** (§4)
6. **Verified-purchase reviews** (§3.7)
7. **Order/fulfillment status & returns** (§7)
8. **Image/object storage + CDN** (§9)
9. **Commission / payout model** (§9)
10. **Content vs UI i18n decision** (§8.2)
11. **Analytics event capture (feeds metrics + AI)** (§6.1–6.2)
12. **Two-group taxonomy — Clothes & Accessories tabs** replacing "All Products" (§3.1, §8.1)
