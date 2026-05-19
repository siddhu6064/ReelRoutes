# SAVIQ Mobile Architecture Standards (Parity Implementation Guide)

Purpose: define the least-disruptive standards for upcoming mobile parity work, based on current patterns in `frontend/app/`, `frontend/src/`, store/services, and existing components.

## 1) Route and file placement conventions (`frontend/app/`)

### Current repo pattern
- Expo Router with root layout and tab group:
  - `app/_layout.tsx` controls auth/deeplink gating.
  - `app/index.tsx` is login/entry.
  - `app/(tabs)/_layout.tsx` defines tab routes.
  - tab screens currently live as flat files in `app/(tabs)/`.

### Standard for parity work
- **Route-level screens** for web-major surfaces should be placed in `app/(tabs)/` (or a new route group if needed), one file per route.
- **Do not bury route-level parity features only inside modals/sub-tabs** when the web surface is a major top-level route.
- For new multi-step surfaces, use route segments (e.g., `app/(tabs)/goals/index.tsx`, `app/(tabs)/goals/[id].tsx`) only when needed; otherwise prefer single-screen route file to minimize churn.

## 2) Shared components placement (`frontend/src/components/`)

### Current repo pattern
- Reusable UI primitives and common widgets live under `src/components` (e.g., `NeumorphicUI.tsx`, `ExpenseCard.tsx`, automation/onboarding modals).

### Standard for parity work
- Put reusable presentation components in `src/components/`.
- Keep **screen orchestration** (fetching, route params, navigation events, modals open/close state) in route screen files under `app/`.
- If a component is used by only one screen and is tightly coupled to that screen’s local behavior, keep it local to that screen file until a second consumer exists.

## 3) State/store usage expectations

### Current repo pattern
- Global app/domain state is centralized in Zustand store (`src/store/appStore.ts`).
- Screen-level UI state is held locally with React state in each screen file.

### Standard for parity work
- Use `useAppStore` for shared entities and cross-screen state:
  - profiles, categories, payment methods, expenses, summary, CRUD actions.
- Keep ephemeral UI state local:
  - active tab, modal visibility, picker selections, temporary input state.
- Avoid introducing parallel global state containers for parity tasks unless existing store shape is clearly insufficient.

## 4) API/service usage expectations

### Current repo pattern
- API access is centralized in `src/services/api.ts` (axios instance + grouped service helpers).
- Auth context and store actions consume this layer.

### Standard for parity work
- Use existing `api` instance or exported grouped APIs from `src/services/api.ts`.
- Add new service helpers there when needed; do not call ad-hoc fetch/axios clients directly inside many screens.
- Keep endpoint contracts unchanged for this phase; parity work should compose existing backend behavior.

## 5) Screen vs widget vs primitive boundaries

Use this boundary consistently:

- **Screen (route file under `app/`)**
  - owns navigation, route params, data loading orchestration, and major modal open/close control.
- **Widget (shared feature component under `src/components/`)**
  - owns a coherent visual/function block (cards, grouped controls, reusable dialogs).
- **Primitive (UI building blocks in `NeumorphicUI.tsx` or similarly scoped files)**
  - small reusable elements (rows, toggles, buttons, dividers, chips).

Rule of thumb: if logic depends on router/store composition, keep it in screen; if logic is presentation-reusable, move to widget/primitive.

## 6) Modal / drawer / navigation conventions

### Current repo pattern
- Modals are primarily controlled in-screen via local state and React Native `Modal`.
- Tab navigation is primary app shell navigation.

### Standard for parity work
- Keep modal state in the owning screen unless multiple screens need shared control.
- Prefer dedicated route screens over large monolithic modal flows for major web parity surfaces.
- Use modal for focused tasks (picker, confirmation, small create/edit interaction), not for replacing entire top-level routes.

## 7) Naming conventions for new parity work

- **Route screens:** `PascalCase` default export function, file path follows route intent (e.g., `goals.tsx` or `goals/index.tsx`).
- **Reusable components:** `PascalCase.tsx` in `src/components/`.
- **Store actions/selectors:** verb-first action names consistent with existing store (`fetchX`, `createX`, `deleteX`, `updateX`).
- **Service helpers:** grouped `XAPI` objects in `src/services/api.ts` (consistent with `budgetsAPI`, `settingsAPI`, `exportAPI`).

## 8) Folder/file standards for parity implementation

- `app/`:
  - route-level screens and navigation layout only.
- `src/components/`:
  - shared widgets + reusable UI components.
- `src/store/`:
  - shared app state, entity CRUD orchestration.
- `src/services/`:
  - API clients, local storage helpers, notifications/helpers.
- `src/contexts/`:
  - cross-cutting context concerns (auth/theme).

## 9) Guardrails for future parity work

1. **Route-level parity first** for major web routes (avoid hiding parity in “More” or deep modal trees).
2. **Docs-first scope control:** do not add backend endpoints or unrelated refactors during parity tasks.
3. **Use existing store/service/contexts first** before introducing new infrastructure.
4. **When repo patterns are inconsistent, choose least disruptive alignment:**
   - keep current theme tokens/components patterns for parity features,
   - avoid sweeping design-system rewrites as part of route parity.
5. **Mark parity status conservatively:** if critical route behavior is missing, classify as partial, not complete.

## 10) Known current inconsistencies (called out explicitly)

- Settings-like behavior is currently concentrated in `/(tabs)/more`, while web has a dedicated settings route/IA.
- Budget/export capabilities exist but are embedded in existing screens/modals rather than first-class route screens.
- Theme usage is mixed across current mobile code (shared theme context exists, while many screens/components rely on static theme objects directly).

Proposed least-disruptive standard for Phase M1+: keep current styling primitives/tokens approach per screen while building route parity, and defer broad theming unification to a dedicated later task.
