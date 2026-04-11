# Coding Conventions

**Analysis Date:** 2026-04-11

## Naming Patterns

**Files:**
- TypeScript/React: PascalCase for components (`Button.tsx`, `AuthModal.tsx`), camelCase for utilities (`helpers.ts`, `validators.ts`, `errors.ts`)
- Python: snake_case for all modules (`auth_routes.py`, `email_sender.py`, `accessibility_detector.py`)
- Test files: `*.test.ts` for frontend, `test_*.py` for backend
- Private/internal utilities: Prefix with underscore in Python (`_make_user()`, `_make_db_session()` in test helpers)

**Functions:**
- TypeScript: camelCase (`validatePassword()`, `calculateConversionLoss()`, `getDimensionAccess()`)
- Python: snake_case (`get_current_user_optional()`, `validate_password()`, `calculate_dollar_loss_per_thousand()`)
- React components: Always PascalCase (`AuthModal`, `Button`, `BottomSheet`)

**Variables:**
- TypeScript: camelCase for all variables and constants
- Python: snake_case for all variables; ALL_CAPS for module-level constants
- Example constants:
  - Frontend: `STARTER_DIMENSIONS`, `ACTIVE_DIMENSIONS`, `DIMENSION_IMPACT_WEIGHTS` (`@/lib/analysis/constants`)
  - Backend: `CATEGORY_KEYS`, `IMPACT_WEIGHTS`, `DIMENSION_SCOPE` (`api/app/services/scoring.py`)

**Types:**
- TypeScript: 
  - Interfaces: PascalCase (`ButtonProps`, `AuthModalProps`, `CategoryScores`, `DimensionAccess`)
  - Type aliases: PascalCase (`ButtonVariant`, `ButtonSize`, `PlanTier`)
  - Union types spelled out inline when simple, exported separately when reused
- Python: Pydantic `BaseModel` subclasses use PascalCase (`SignupRequest`, `UserProfileResponse`)

**Exports:**
- Barrel files use index notation: `@/components/ui/index.ts` re-exports all UI components
- Types exported with `export type { TypeName }` in TypeScript
- Explicit named imports preferred over default imports in both languages

## Code Style

**Formatting:**
- No explicit ESLint/Prettier config found in repo
- **TypeScript:** Observed 2-space indentation, 80–100 char soft line limit
- **Python:** Standard PEP 8 (4-space indentation), ~100 char line limit in most routers
- Template literals for multi-line strings and HTML content

**Linting:**
- No `.eslintrc` or `.prettierrc` files in repo
- TypeScript strict mode enabled (`tsconfig.json` has `"strict": true`)
- Type safety prioritized: explicit type annotations throughout
- No `any` type usage observed

**Comments:**
- JSDoc/TSDoc style for public functions: `/** comment */` in TypeScript
- Python: Module-level docstrings using `"""` for public APIs
- Inline comments minimal; prefer self-documenting code with clear names
- Decorative ASCII separators used in large files:
  - TypeScript: `/* ── Section Name ── */` (example in `AuthModal.tsx:14-18`)
  - Python: `# -- Section Name --` (example in `auth_routes.py:33-35`)

**Docstrings (Python):**
- Public functions include brief docstrings explaining parameters and return values
- Example from `api/app/auth.py:25-34`: Explains behavior, parameters, and return value
- Test docstrings explain what condition is being verified

## Import Organization

**TypeScript Order:**
1. React/Next.js imports: `import { useState } from "react"`, `import { useRouter } from "next/navigation"`
2. Third-party packages: `import { signIn } from "next-auth/react"`
3. Relative imports from `@/` alias: `import Button from "@/components/ui/Button"`
4. Type imports separate: `import type { ButtonProps } from "@/components/ui/Button"`

**Python Order:**
1. Standard library: `import logging`, `import uuid`, `from datetime import ...`
2. Third-party: `from fastapi import ...`, `from sqlalchemy import ...`
3. Relative app imports: `from app.config import settings`, `from app.models import User`

**Path Aliases:**
- TypeScript: `@/*` maps to `./src/*` (`tsconfig.json` line 25-28, `vitest.config.ts` line 6-8)
- Always use `@/` for imports from `src/` (never `../` or `../../`)

## Error Handling

**TypeScript Frontend:**
- Explicit HTTP status code mapping in utility function (`getUserFriendlyError()` in `@/lib/errors.ts`)
- Maps codes (401, 403, 404, 429, 5xx) to user-friendly messages
- Gracefully handles offline state: checks `navigator.onLine` before reporting errors
- Form validation before submit to catch issues early
- Promise `.catch()` with fallback parsing: `res.json().catch(() => null)`
- Try-catch wraps auth operations, returns `setError()` for user display

**Python Backend:**
- HTTPException raised for client/validation errors (status 400, 401, 403, 404, 409, 429)
- Example: `raise HTTPException(status_code=400, detail=error)` in `auth_routes.py:96`
- Generic `except Exception:` with `logger.exception()` for unexpected errors
- Never lets exceptions propagate without logging
- Example from `store.py:116-117`:
  ```python
  except Exception:
      logger.exception("Failed to fetch store data")
  ```
- Database operations wrapped in try-finally for guaranteed cleanup:
  ```python
  try:
      yield db
  finally:
      db.close()
  ```

**Logging Patterns:**
- All modules start with `logger = logging.getLogger(__name__)`
- Used in three contexts:
  1. `logger.warning()` for recoverable issues
  2. `logger.exception()` in except blocks to include stack trace
  3. `logger.info()` for audit events (e.g., user auto-creation in `auth.py:87`)

**Error Recovery:**
- Services return `None` or `[]` for expected failures
- Multiple exception blocks for different recovery paths (see `analyze_competitors.py`)
- Rate limiting returns 429 with user-friendly message

## Module Design

**Exports:**
- Public APIs always explicitly exported, no implicit default exports
- Example pattern in `@/lib/analysis/conversion-model.ts`:
  ```typescript
  export const STARTER_DIMENSIONS: ReadonlySet<string> = new Set([...]);
  export function getDimensionAccess(...): DimensionAccess { ... }
  export interface CategoryBenchmark { ... }
  ```
- Barrel files (`index.ts`) collect and re-export related types and functions

**Directory Structure as Convention:**
- Services (`api/app/services/`) contain detector logic: `checkout_detector.py`, `pricing_rubric.py`
- Routers (`api/app/routers/`) are HTTP endpoints with validation
- Frontend components co-located with tests: `src/lib/analysis/__tests__/` contains test files
- Shared types in `types.ts` files: `@/lib/analysis/types.ts`, no duplication

**Reusable Components:**
- UI components accept `forwardRef` + composition:
  ```typescript
  const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => ...)
  ```
- Radix UI `Slot` component for `asChild` pattern (see `Button.tsx:15-16, 76`)

## Function Design

**Size:**
- Utility functions kept to 40-80 lines; larger functions break into helpers
- Test setup helpers extract repetitive mocking: `_make_user()`, `_make_db_session()` in `test_auth.py`

**Parameters:**
- React: Props interfaces always defined, destructured in component signature
- Python: Pydantic models for HTTP request validation (e.g., `SignupRequest`)
- Avoid `**kwargs`; prefer explicit parameters

**Return Values:**
- Functions return union types when multiple outcomes possible:
  - `Optional[User]` for optional results
  - `DimensionAccess = "unlocked" | "locked"` for enums
  - Result objects bundle related data: `FreeResult`, `LeakCard` interfaces
- Never return `null` from calculations; use `0` or empty object instead

## TypeScript Type Safety

**Never use `any`:**
- All function parameters typed
- All return types explicit (not inferred)
- Use `unknown` for genuinely unknown types, then narrow with `typeof` checks
- Record types always keyed: `Record<string, number>`, `Record<ButtonVariant, string>`

**Readonly patterns:**
- Constants marked `readonly`: `readonly string[]`, `ReadonlySet<string>` (e.g., `STARTER_DIMENSIONS`)
- Prevents accidental mutation in large modules

**Type exports:**
- Separate `export type { TypeName }` from value exports
- Enables tree-shaking and clarity on what's a type vs. value

---

*Convention analysis: 2026-04-11*
