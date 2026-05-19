# Tests for web — add test files here

Quick pre-CI guard for unresolved merge markers:

```bash
rg -n '^(<<<<<<<|=======|>>>>>>>)' tests/e2e/smoke.spec.ts .
```
