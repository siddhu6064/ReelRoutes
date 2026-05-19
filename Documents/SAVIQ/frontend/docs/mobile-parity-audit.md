# SAVIQ Mobile Parity Gap Report (Phase M1)

## Executive summary

This report tracks web→mobile parity at route level and captures dependency order for implementation.

Phase M1 progress in this update:
- Dashboard is a first-class mobile route shell (`/(tabs)/index`).
- Budgets now has a standalone mobile route (`/(tabs)/budgets`).
- Goals now has a standalone mobile route (`/(tabs)/goals`) with loading/empty/error/success list states.

---

## Current surface map (evidence baseline)

### Web major routes
- `/login`
- `/` (Dashboard)
- `/transactions`
- `/analytics`
- `/budgets`
- `/goals`
- `/export`
- `/settings`

### Mobile current routes/screens
- `/` (login)
- `/(tabs)/index` (Dashboard shell)
- `/(tabs)/transactions` (Transactions)
- `/(tabs)/stats` (Stats + Budget + Note tabs)
- `/(tabs)/budgets` (Budgets standalone)
- `/(tabs)/goals` (Goals standalone)
- `/(tabs)/accounts` (hidden from tab bar, still routable)
- `/(tabs)/more`
- `/(tabs)/add`

---

## Parity matrix (route-level)

| Web route | Mobile equivalent | Status | Evidence-grounded note |
|---|---|---|---|
| `/login` | `/` login screen | complete | Both apps expose auth entry before protected app surfaces. |
| `/` (Dashboard) | `/(tabs)/index` dashboard shell | partial | Dedicated route exists; full dashboard widgets/modules still pending. |
| `/transactions` | `/(tabs)/transactions` + `/(tabs)/add` | partial | Core list/add-edit flows exist; advanced web depth remains pending. |
| `/analytics` | `/(tabs)/stats` | partial | Existing stats surface is present, but web analytics depth is broader. |
| `/budgets` | `/(tabs)/budgets` | partial | Standalone route now exists; deeper parity (e.g., full edit workflows) still pending. |
| `/goals` | `/(tabs)/goals` | partial | Standalone route exists with fetch/list states; CRUD and richer interactions remain pending. |
| `/export` | export modal in `/(tabs)/more` | partial | Export capability exists without dedicated route-level parity. |
| `/settings` | `/(tabs)/more` | partial | Mobile settings are bundled; web has sectioned settings IA. |

---

## Gap tiers (implementation-oriented)

### Tier 1 — Hard missing routes/screens

- None for core major routes listed above.

### Tier 2 — Partial parity on existing screens (functional gaps)

1. **Dashboard parity depth** (route exists; modules pending)
2. **Budgets parity depth** (standalone route exists; workflow depth pending)
3. **Goals parity depth** (standalone route exists; CRUD and detail depth pending)
4. **Export parity depth** (modal, not route)
5. **Settings IA parity** (aggregated in More)
6. **Transactions/Analytics depth parity** (web depth > mobile depth)

### Tier 3 — Later polish/depth

- Richer chart/dashboard widget fidelity.
- IA/UX refinements after route-level parity lands.
- Consistency cleanup across overlapping mobile surfaces.

---

## Recommended implementation dependency order

1. **Expand Dashboard shell with prioritized parity modules.**
2. **Deepen Goals and Budgets workflows (CRUD + detail parity).**
3. **Promote Export into dedicated route-level screen.**
4. **Split Settings parity from More into clearer sub-flows.**
5. **Deepen Transactions + Analytics behavior to web parity depth.**

This order prioritizes high-visibility route value first, then missing workflow depth.

---

## Notes / limitations

- This is route/shell and parity-tracking progress, not full feature parity completion.
- Findings are constrained to repository code structure and current file-level evidence.
