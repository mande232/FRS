# Ethio Plate Pro / Buna Link Project Summary

## Overview

This project is a **restaurant and hospitality operations demo application** built for Ethiopian food-and-beverage businesses. In the UI and metadata, the product is presented as **Buna Link**, an F&B suite for restaurants, cafés, bars, and hotel dining operations.

It demonstrates a modern web-based back-office and service workflow that includes:

- Point of Sale (POS)
- Kitchen Display System (KDS)
- Table management
- Orders and reservations
- Menu and recipe management
- Inventory and suppliers
- Payments and reporting
- Room service, catering, and events
- Customer loyalty and staff-oriented workflows

The current implementation is primarily a **front-end demo/prototype** powered by local mock data and in-memory state rather than a live backend API.

## Tech Stack

- **React 19**
- **TypeScript**
- **Vite**
- **TanStack Router** for file-based routing
- **TanStack Query** for app context/query client setup
- **TanStack Start** runtime integration
- **Tailwind CSS v4** for styling
- **Radix UI** component primitives
- **Lucide React** for icons
- **React Hook Form + Zod** available for forms/validation

## Project Structure

Key top-level source files:

- `src/router.tsx` – creates the TanStack router and query client
- `src/routes/__root.tsx` – app root, global providers, metadata, error boundaries
- `src/routes/app.tsx` – authenticated app shell with sidebar, header, theme, and language toggle
- `src/lib/demo-data.ts` – mock business data for all modules
- `src/lib/store.tsx` – shared in-memory application state and actions

Main route groups include:

- `src/routes/index.tsx`
- `src/routes/login.tsx`
- `src/routes/app.index.tsx`
- `src/routes/app.pos.tsx`
- `src/routes/app.kds.tsx`
- `src/routes/app.tables.tsx`
- `src/routes/app.orders.tsx`
- `src/routes/app.reservations.tsx`
- `src/routes/app.menu.tsx`
- `src/routes/app.inventory.tsx`
- `src/routes/app.suppliers.tsx`
- `src/routes/app.customers.tsx`
- `src/routes/app.staff.tsx`
- `src/routes/app.payments.tsx`
- `src/routes/app.reports.tsx`
- `src/routes/app.events.tsx`
- `src/routes/app.catering.tsx`
- `src/routes/app.room.tsx`
- `src/routes/app.digital-menu.tsx`
- `src/routes/app.bar.tsx`
- `src/routes/app.recipes.tsx`
- `src/routes/app.settings.tsx`

## Architecture Summary

### 1. Routing

The app uses **TanStack Router** with file-based route definitions. `src/router.tsx` creates a router instance and injects a `QueryClient` into route context.

### 2. Root App Setup

`src/routes/__root.tsx` provides:

- global HTML shell
- metadata and fonts
- `QueryClientProvider`
- authentication context
- not-found and error boundary components
- client-side session restoration via `sessionStorage`

### 3. Authentication

Authentication is lightweight and client-side. The root route stores the current user in session storage (`bl_user`). The `/app` shell checks authentication and redirects unauthenticated users to `/login`.

### 4. Shared State Store

`src/lib/store.tsx` is the core state container for the demo. It uses React context and `useState` to manage shared business data including:

- menu items, categories, and stations
- orders and order status transitions
- tables and areas
- stock/inventory
- customers and loyalty points
- payment ledger entries
- reservations

This store also contains business actions such as:

- advancing and serving orders
- updating tables
- adjusting stock
- crediting customer loyalty points
- adding payments
- confirming reservations

## Business Domain Covered

The project models a broad Ethiopian hospitality operation with localized examples such as:

- Ethiopian menu items like **Doro Wat, Kitfo, Tibs, Shiro, Tej, Macchiato**
- ETB pricing
- local payment methods like **Telebirr** and **CBE Birr**
- bilingual content support for **English and Amharic**
- restaurant plus hotel workflows such as room service and banquets

## Major Screens and Features

### Dashboard (`/app`)

The dashboard shows an executive overview of operations, including:

- daily sales metrics
- VAT overview
- open tickets
- hourly sales chart
- top-selling items
- active orders
- branch performance

### POS (`/app/pos`)

The POS route is one of the most complete screens in the project. It supports:

- filtering menu items by category
- searching English and Amharic menu names
- building a cart/ticket
- assigning the sale to a table
- sending a kitchen order ticket
- taking payment via multiple methods
- generating receipt data
- releasing tables after settlement
- deducting stock
- crediting loyalty points to matched customers

### KDS (`/app/kds`)

The Kitchen Display System shows active tickets grouped by station:

- Hot
- Grill
- Cold
- Bar

It lets staff:

- mark individual items done
- view ticket aging
- bump orders forward through workflow
- recall items when needed

### App Shell (`/app` layout)

The main shell includes:

- role-filtered navigation
- grouped sidebar sections
- mobile sidebar behavior
- dark/light theme toggle
- English/Amharic language toggle
- authenticated user info and logout

## Data Model Highlights

The mock dataset in `src/lib/demo-data.ts` includes:

- `MENU`
- `TABLES`
- `ORDERS`
- `STOCK`
- `SUPPLIERS`
- `RESERVATIONS`
- `CUSTOMERS`
- `STAFF`
- `SALES_BY_HOUR`
- `TOP_ITEMS`
- `BRANCHES`
- `EVENTS`
- `RECIPES`
- `BAR_ITEMS`
- `BAR_LOG`
- `ROOM_ORDERS`
- `CATERING_JOBS`
- `PAYMENTS_LEDGER`

This makes the application suitable as a demo for multiple operational departments without requiring a backend.

## UI/UX Characteristics

The UI is designed as a polished operations dashboard with:

- card-based layouts
- strong icon usage
- responsive desktop/mobile navigation
- hospitality-focused status chips and indicators
- Ethiopian date/currency formatting helpers
- dark mode support

## Current Implementation Characteristics

This project currently behaves like a **high-fidelity product demo** rather than a production-ready full-stack platform.

### Strengths

- Strong product scope coverage
- Clear modular route structure
- Shared store for cross-screen interactions
- Localized Ethiopian hospitality use case
- Attractive dashboard-style user experience

### Limitations

- No persistent backend or database integration
- State is mostly in memory for the session
- Limited real authentication/security model
- No evidence of API wiring for business operations
- Some routes may be more demonstrative than fully transactional

## Best One-Line Summary

**Buna Link is a React + TypeScript hospitality operations demo for Ethiopian restaurants and hotels, featuring POS, KDS, inventory, reservations, payments, and management dashboards built on TanStack Router with mock data and shared in-memory state.**