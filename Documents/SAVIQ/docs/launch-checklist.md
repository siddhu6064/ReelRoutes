# Launch Checklist

SAVIQ — a modern cross-platform expense tracker with AI-powered insights.

- [ ] Production env vars configured (backend + web)
- [ ] Database reachable from backend runtime
- [ ] CORS origins configured for deployed web host
- [ ] Register/login verified in staging
- [ ] Auth login/logout/session expiry verified
- [ ] Transaction create verified
- [ ] Transaction edit verified
- [ ] Transaction delete verified
- [ ] Analytics dashboard verified
- [ ] Budgets create/progress verified
- [ ] Export CSV/JSON verified
- [ ] Error boundary fallback verified (forced runtime error)
- [ ] `/health` and `/ready` endpoints verified
- [ ] E2E smoke suite green in CI
- [ ] Frontend build artifacts generated
- [ ] Post-deploy log review completed (errors/latency/5xx)
