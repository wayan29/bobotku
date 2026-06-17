# AGENTS.md — Guide for Agents Working in This Repo

This document provides conventions, architecture notes, and safe‑change guidelines for agents working on this project. Its scope is the entire repository unless explicitly stated otherwise. Where this document conflicts with direct user instructions, always follow the user.

## Project Overview
- Telegram bot for digital product transactions across providers.
- Current providers: Digiflazz and TokoVoucher.
- User flow is implemented with Telegraf Scenes and session state.
- Transactions are persisted and summarized in a unified collection `transactions_log` via the Mongoose model `TransactionLog`.

## Key Directories
- `src/index.js` — Bot bootstrap, global middlewares, and command handlers.
- `src/scenes/*` — Multi‑step chat flows:
  - `botMenu`, `selectCategory`, `selectBrand`, `selectProduct`, `productDetail`, `enterDestinationNumber`, `enterServerId`.
- `src/middleware/*` — Provider status checkers and list commands:
  - `CheckTOV.js` and `Digiflazz.js` (also export raw status functions).
- `src/services/*` — HTTP integrations and utilities:
  - `http.js` (Digiflazz), `http_toko.js` (TokoVoucher), `ffNickname.js` (FF nickname), `receipt.js` (PNG struk), `keyboard.js`.
- `src/models/*` — Mongoose models: `transactionLog.js`, `trxdigi.js`, `tov.js`, `mongoose.js` (User whitelist).
- `src/utils/refid.js` — Unified Ref ID generator.

## Unified Transaction Log
- All transactions should be represented in `TransactionLog` with the following important fields:
  - `id` (ref_id), `provider` (`digiflazz` | `tokovoucher`), `status`, `productName`, `buyerSkuCode`, `originalCustomerNo`, `serialNumber`.
  - Category/brand: `productCategoryFromProvider` | `categoryKey`, and `productBrandFromProvider` | `iconName`.
- Status refreshes must upsert (not insert) to avoid duplicate key errors.
- New features should read from `TransactionLog` first, then fall back to provider‑specific collections only if strictly necessary.

## Ref ID Generation
- Helper: `src/utils/refid.js` with `generateRefId(prefix)`.
- Format: `<PREFIX><YYYYMMDDHHMMSS><NNN>` where `NNN` is count of today’s transactions + 1 (zero‑padded).
  - Digiflazz uses `DF…`.
  - TokoVoucher uses `TV…`.
- Timezone for counting and display is controlled by `.env` `TZ` (default set to `Asia/Makassar`).

## Commands
- Access is managed through `white_id` users with `role` (`owner` | `admin` | `user`) plus `isPremium` for normal user access.
- `OWNER_CHAT_ID` can pin the owner; otherwise the first user bootstraps as owner.
- Access commands live in `src/handlers/accessCommands.js` and must be registered before `premiumAccessMiddleware`.
- `/tov [ref_id]` — Check TokoVoucher status (alias `/tovcheck`).
- `/dg [ref_id]` — Check Digiflazz status (aliases `/digi`, `/digicheck`).
- `/struk [ref_id]` —
  - Without argument: shows last 15 ref_ids from `TransactionLog`.
  - With ref_id: if status Pending, the bot calls the proper provider API to refresh status; when Sukses, it asks for selling price and returns a PNG receipt.
- Provider autodetection is applied: `/tov` or `/dg` redirect to the correct provider if `TransactionLog.provider` indicates the other provider.

## Receipt (Struk)
- Generator: `src/services/receipt.js` (pure JS using `pureimage`).
- Visual style roughly matches the provided example (success header, structured details, payment box, SN block).
- Inputs: provider, status, refId, timeText, tzLabel, productName, customerNo, category/brand, serialNumber, sellingPrice.
- Font fallback: attempts to register DejaVu/Liberation if available; otherwise still works (may warn once).

## Free Fire Nickname Verification
- Service: `src/services/ffNickname.js` (Codashop/GoPay fallback).
- Digiflazz and TokoVoucher product confirmation will auto‑call `inquireFFNickname` when the product name contains "Free Fire" and include the nickname (or a friendly warning if not available).

## Provider Integrations
- Digiflazz: `src/services/http.js` (price list, transaction, balance) and `src/middleware/Digiflazz.js` (status checks). Where possible, rely on `TransactionLog` to derive `buyerSkuCode` and `originalCustomerNo` for status calls.
- TokoVoucher: `src/services/http_toko.js` (category/operator/product list and create trx) and `src/middleware/CheckTOV.js` (status checks).

## Coding Conventions
- Keep changes minimal and focused on the requested task.
- Prefer upserts for logs and idempotent behavior.
- Use existing utilities (e.g., `generateRefId`, keyboard helpers) instead of re‑implementing.
- Respect mobile‑friendly formatting in message blocks (short lines, clear separators).
- When adding messages with `parse_mode: 'HTML'`, escape angle brackets in placeholders: use `&lt;ref_id&gt;`.
- Avoid hard‑coding secrets; always use `.env` variables.

## Session & Scenes
- Session keys already used: `selectedBot`, `selectedCategory`, `selectedBrand`, `selectedProduct`, `list`, `listJenis`, `codeList`, `serverId`, `nomorTujuan`, `customerNo`, `refId`, `digiStep`, `tovStep`, `pendingReceipt`.
- When introducing new flow state, clear it after finishing to avoid cross‑scene leaks.

## Environment & Setup
- `.env` must include (examples):
  - Telegram `TOKEN`, Mongo `MONGO_URL`.
  - Digiflazz `username`, `apikey`.
  - TokoVoucher `member_code`, `signature`, `secret`.
  - `TZ=Asia/Makassar` (used for timestamps and daily counters).
- Start locally: `npm install && npm start`.

## Validation Tips
- If adding status refreshes or new logs, prefer verifying with `/transactions`, `/dg <ref_id>`, `/tov <ref_id>`, and `/struk <ref_id>`.
- Keep provider calls resilient; catch errors and inform the user without crashing.

## Safe‑Change Rules (Important)
- Do not introduce breaking changes to existing scene flows unless requested.
- Do not store secrets in the repository; rely on `.env`.
- When changing message formats sent with HTML, avoid unescaped `<...>` placeholders.
- For new features that touch both providers, always update `TransactionLog` consistently.

## Extending the Bot
- To add a new provider:
  - Create a service module under `src/services/` for API access and caching if needed.
  - Add middleware for status checks under `src/middleware/` and export a raw status function.
  - Integrate into scenes: category → brand → product → detail → destination.
  - Ensure `TransactionLog` is populated uniformly with `provider` and category/brand fields.
- To add a new verification (e.g., other game nickname):
  - Add a service module and call it conditionally in the product confirmation step based on product name keywords.

---
This file is intended for agents. Humans are welcome to read it too. If the repository conventions evolve, please update this file to keep future changes coherent.

