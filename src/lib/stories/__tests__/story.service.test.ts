/**
 * Story service tests.
 *
 * These tests verify the story service business logic using a mocked
 * Supabase admin client — no real database required.
 *
 * Covered:
 *   - Story creation (media ownership, processing status, active limits)
 *   - Story deletion (owner-only, soft-delete)
 *   - Story views (visibility check, dedupe)
 *   - Viewer list authorization (owner-only)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { trackEvent } from "@/lib/analytics";
import {
  createStory,
  deleteStory,
  recordStoryView,
  getStoryViewers,
} from "@/lib/stories/story.service";

const adminClientMock = vi.mocked(createAdminClient);

type QueryResult = {
  data?: unknown;
  error?: { code?: string; message: string } | null;
  count?: number | null;
};

const tableResults = new Map<string, QueryResult>();
const singleResults = new Map<string, QueryResult>();
let rpcResult: { data: unknown; error: unknown };
let rpcImpl:
  | ((fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)
  | null;

function makeChain(table: string) {
  const result = tableResults.get(table) ?? { data: [], error: null };
  const single = singleResults.get(table) ?? { data: null, error: null };
  // Thenable chain: every builder method returns the chain itself.
  const chain: any = Promise.resolve(result);
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.neq = () => chain;
  chain.is = () => chain;
  chain.gt = () => chain;
  chain.gte = () => chain;
  chain.lt = () => chain;
  chain.lte = () => chain;
  chain.in = () => chain;
  chain.or = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.single = () => Promise.resolve(single);
  chain.insert = () => chain;
  chain.upsert = () => chain;
  chain.update = () => chain;
  chain.delete = () => chain;
  return chain;
}

function resetMocks() {
  vi.clearAllMocks();
  tableResults.clear();
  singleResults.clear();
  rpcResult = { data: null, error: null };
  rpcImpl = null;

  const client = {
    from: vi.fn((table: string) => makeChain(table)),
    rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      if (rpcImpl) return rpcImpl(fn, args);
      return rpcResult;
    }),
  };
  adminClientMock.mockReturnValue(client as never);
}

beforeEach(() => {
  resetMocks();
});

const USER_ID = "user-123";
const MEDIA_ID = "media-456";
const STORY_ID = "story-789";

const mediaRecord = {
  id: MEDIA_ID,
  owner_id: USER_ID,
  media_type: "image",
  processing_status: "ready",
  mime_type: "image/jpeg",
  file_size: 1024,
  duration_seconds: null,
  width: 1080,
  height: 1920,
  storage_provider: "telegram",
  provider_file_id: "file-1",
  storage_path: null,
};

const storyRecord = {
  id: STORY_ID,
  author_id: USER_ID,
  media_id: MEDIA_ID,
  caption: "Hello!",
  visibility: "public",
  processing_status: "ready",
  status: "active",
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  media: mediaRecord,
};

describe("createStory", () => {
  it("should reject when media does not exist", async () => {
    singleResults.set("media", { data: null, error: null });
    await expect(createStory(USER_ID, { mediaId: MEDIA_ID, visibility: "public" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400,
      message: "Media not found",
    });
  });

  it("should reject when media belongs to another user", async () => {
    singleResults.set("media", {
      data: { ...mediaRecord, owner_id: "someone-else" },
    });
    await expect(
      createStory(USER_ID, { mediaId: MEDIA_ID, visibility: "public" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 403 });
  });

  it("should reject when media is still processing", async () => {
    singleResults.set("media", {
      data: { ...mediaRecord, processing_status: "processing" },
    });
    await expect(
      createStory(USER_ID, { mediaId: MEDIA_ID, visibility: "public" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Media is still processing. Please wait.",
    });
  });

  it("should reject when the user has too many active stories", async () => {
    singleResults.set("media", { data: mediaRecord });
    tableResults.set("stories", { count: 20, data: [] }); // MAX_ACTIVE_STORIES_PER_USER
    await expect(
      createStory(USER_ID, { mediaId: MEDIA_ID, visibility: "public" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "You have too many active stories. Please delete some first.",
    });
  });

  it("should create a story and return the enriched item", async () => {
    singleResults.set("media", { data: mediaRecord });
    tableResults.set("stories", { count: 0, data: [] });
    singleResults.set("stories", { data: storyRecord });
    singleResults.set("users", {
      data: { id: USER_ID, display_name: "Tester", avatar_media_id: null },
    });
    singleResults.set("profiles", {
      data: { date_of_birth: "1998-01-01", city: "Lisbon", is_verified: false },
    });
    tableResults.set("follows", { data: [] });
    tableResults.set("story_views", { count: 0 });
    singleResults.set("story_reactions", { data: null });

    const result = await createStory(USER_ID, {
      mediaId: MEDIA_ID,
      caption: "Hello!",
      visibility: "public",
    });

    expect(result.id).toBe(STORY_ID);
    expect(result.authorId).toBe(USER_ID);
    expect(result.caption).toBe("Hello!");
    expect(result.media.mediaType).toBe("image");
    expect(trackEvent).toHaveBeenCalledWith(
      USER_ID,
      "story_created",
      "story",
      STORY_ID,
      expect.objectContaining({ media_type: "image", visibility: "public" }),
    );
  });
});

describe("deleteStory", () => {
  it("should throw not-found when the story does not exist", async () => {
    singleResults.set("stories", { data: null });
    await expect(deleteStory(STORY_ID, USER_ID)).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });

  it("should forbid deleting another user's story", async () => {
    singleResults.set("stories", {
      data: { author_id: "other-user" },
    });
    await expect(deleteStory(STORY_ID, USER_ID)).rejects.toMatchObject({
      code: "AUTHORIZATION_ERROR",
      statusCode: 403,
    });
  });

  it("should soft-delete the owner's story", async () => {
    singleResults.set("stories", { data: { author_id: USER_ID } });
    tableResults.set("stories", { data: null, error: null });

    await deleteStory(STORY_ID, USER_ID);

    expect(trackEvent).toHaveBeenCalledWith(USER_ID, "story_deleted", "story", STORY_ID);
  });
});

describe("recordStoryView", () => {
  it("should return false when the viewer cannot see the story", async () => {
    rpcResult = { data: false, error: null };
    const ok = await recordStoryView(STORY_ID, "viewer-1");
    expect(ok).toBe(false);
  });

  it("should record a view when allowed", async () => {
    rpcImpl = async () => ({ data: true, error: null });
    tableResults.set("story_views", { data: null, error: null });

    const ok = await recordStoryView(STORY_ID, "viewer-1");
    expect(ok).toBe(true);
    expect(trackEvent).toHaveBeenCalledWith("viewer-1", "story_viewed", "story", STORY_ID);
  });

  it("should treat duplicate views as success (idempotent)", async () => {
    rpcImpl = async () => ({ data: true, error: null });
    tableResults.set("story_views", {
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });

    const ok = await recordStoryView(STORY_ID, "viewer-1");
    expect(ok).toBe(true);
  });
});

describe("getStoryViewers", () => {
  it("should forbid non-owners from viewing the viewer list", async () => {
    singleResults.set("stories", { data: { author_id: "owner-1" } });
    await expect(getStoryViewers(STORY_ID, "intruder-1")).rejects.toMatchObject({
      code: "AUTHORIZATION_ERROR",
      statusCode: 403,
      message: "Only the story owner can view the viewer list",
    });
  });

  it("should return the viewer list for the story owner", async () => {
    singleResults.set("stories", { data: { author_id: USER_ID } });
    tableResults.set("story_views", {
      count: 1,
      data: [
        {
          story_id: STORY_ID,
          viewer_id: "viewer-1",
          viewed_at: "2024-01-01T00:00:00Z",
          viewer: { id: "viewer-1", display_name: "Viewer", avatar_media_id: null },
        },
      ],
    });

    const result = await getStoryViewers(STORY_ID, USER_ID);
    expect(result.totalCount).toBe(1);
    expect(result.viewers).toHaveLength(1);
    expect(result.viewers[0].viewer?.displayName).toBe("Viewer");
    expect(result.hasMore).toBe(false);
  });
});
