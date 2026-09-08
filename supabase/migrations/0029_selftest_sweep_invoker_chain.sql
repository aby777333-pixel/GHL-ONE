-- ============================================================================
-- 0029 — The role sweep STILL could not run after 0028.
-- SET ROLE is forbidden anywhere inside a security-definer *context*, and
-- platform_self_test() — the wrapper that calls the sweep — was itself SECURITY
-- DEFINER, so the restriction applied to the nested call too. Both must be
-- SECURITY INVOKER. The gate (selftest_allowed) stays DEFINER, and the five
-- catalogue-only checks stay DEFINER so a non-superuser caller can still use them.
-- After this the sweep really runs: 8 roles x 185 tables, no errors.
-- ============================================================================
alter function platform_self_test() security invoker;
