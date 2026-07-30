/**
 * GET /api/health/deps — Dependency Health
 *
 * Returns detailed status of all dependencies without failing the request.
 * Do NOT make readiness depend on non-critical services.
 *
 * This is a proper Next.js App Router route file that reuses the
 * checkDependencies function from the parent health route.
 *
 * Architecture:
 *   - Database (critical): Full connectivity check with latency
 *   - Storage (critical): Bucket accessibility check
 *   - Telegram (critical): Token presence and API connectivity
 *   - Non-critical services (AI, search, analytics): NOT checked here
 */

import { checkDependencies } from "../route";

export const GET = checkDependencies;
