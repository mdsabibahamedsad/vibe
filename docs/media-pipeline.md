# Media Pipeline

## Overview

The Media Pipeline provides a unified, centralized system for handling all media in Vibe. It abstracts away storage providers, processing, and access control behind a clean service layer.

### Architecture

```
Application (Features)
    ↓
Media Service (src/lib/media/media.service.ts)
    ↓
Storage Provider Interface (src/lib/media/providers/storage-provider.interface.ts)
    ├── Supabase Storage Provider
    └── Telegram Media Provider (future/optional)
```

All feature code (profile, feed, stories, chat) should use the media service rather than directly accessing storage APIs.

---

## 1. Media Schema

### `media` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `owner_id` | UUID → users | Owner of the media |
| `media_type` | enum | `image` or `video` |
| `storage_provider` | enum | `telegram`, `supabase`, `external_cdn` |
| `provider_file_id` | text | Provider-specific file ID (e.g., Telegram file_id) |
| `storage_path` | text | Path within the storage provider |
| `mime_type` | text | MIME type |
| `file_size` | bigint | File size in bytes |
| `width` | int | Image/video width |
| `height` | int | Image/video height |
| `duration_seconds` | real | Video duration (null for images) |
| `thumbnail_media_id` | UUID → media | Reference to thumbnail derivative |
| `processing_status` | enum | `pending` → `processing` → `ready` / `failed` |
| `visibility` | enum | `public`, `private`, `restricted` |
| `moderation_status` | text | `pending`, `approved`, `rejected`, `review` |
| `version` | int | Monotonically increasing for cache busting |
| `created_at` | timestamptz | Creation timestamp |
| `updated_at` | timestamptz | Last update |
| `deleted_at` | timestamptz | Soft-delete timestamp |
| `failed_at` | timestamptz | When processing failed |
| `error_code` | text | Machine-readable error code |

### `media_derivatives` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `media_id` | UUID → media | Parent media |
| `derivative_type` | text | `thumbnail`, `small`, `medium`, `large`, `poster`, `mobile`, `standard` |
| `storage_key` | text | Path in storage |
| `mime_type` | text | Derivative MIME type |
| `size_bytes` | bigint | Derivative file size |
| `width` | int | Derivative width |
| `height` | int | Derivative height |
| `created_at` | timestamptz | Creation timestamp |

Uniqueness constraint: `(media_id, derivative_type)` — prevents duplicate derivatives.

### `media_usage` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `media_id` | UUID → media | The media |
| `owner_id` | UUID → users | Owner at time of attachment |
| `entity_type` | text | `profile`, `post`, `story`, `message` |
| `entity_id` | UUID | Entity ID |
| `purpose` | text | Role of the media in this entity |
| `created_at` | timestamptz | When attached |

### `media_processing_jobs` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `media_id` | UUID → media | Media to process |
| `job_type` | text | `image_optimize`, `image_thumbnail`, `video_transcode`, `video_thumbnail`, `cleanup` |
| `status` | text | `pending`, `processing`, `completed`, `failed` |
| `attempts` | int | Attempt count |
| `max_attempts` | int | Maximum retries |
| `error_code` | text | Machine-readable error |
| `scheduled_at` | timestamptz | When to process |
| `started_at` | timestamptz | When processing started |
| `completed_at` | timestamptz | When processing completed |
| `created_at` | timestamptz | Creation timestamp |

---

## 2. Upload Flow

```
Client                      Server
  │                           │
  │  POST /api/media/upload   │
  │  multipart/form-data      │
  │──────────────────────────►│
  │                           │── Validate MIME, size, purpose
  │                           │── Rate limit check
  │                           │── Generate storage key
  │                           │── Upload to storage provider
  │                           │── Create media record
  │                           │── Create media_usage (if entity given)
  │                           │── Create processing job (for images)
  │  { media, processing }    │
  │◄──────────────────────────│
  │                           │
  │  GET /api/media/{id}/status│
  │──────────────────────────►│
  │  { ready: true/false }    │
  │◄──────────────────────────│
```

### Supported Purposes

| Purpose | Allowed Types | Max Size |
|---------|---------------|----------|
| `profile` | image | 10 MB |
| `avatar` | image | 10 MB |
| `post` | image, video | 10 MB (image) / 50 MB (video) |
| `story` | image, video | 10 MB (image) / 50 MB (video) |
| `message` | image, video | 10 MB (image) / 50 MB (video) |
| `thumbnail` | image | 10 MB |

---

## 3. Image Processing

All images go through automated processing to generate derivatives:

| Derivative | Size | Fit | Usage |
|------------|------|-----|-------|
| `thumbnail` | 150×150 | cover | Avatars, notification previews |
| `small` | 320×320 | inside | Feed cards, small previews |
| `medium` | 640×640 | inside | Standard mobile viewing |
| `large` | 1280×1280 | inside | Full-screen viewer |

Processing:
- JPEG quality: 82
- WebP quality: 80
- EXIF orientation corrected
- EXIF GPS data removed
- Safe against decompression bombs (max 4096×4096)

---

## 4. Video Processing

V1 supports short-form video (max 60 seconds, 50 MB).

Processing:
- Poster/thumbnail generated automatically
- Transcoding placeholder for future FFmpeg integration
- Mobile-optimized derivative supported

---

## 5. Storage Providers

### Supabase Storage

- Public bucket: `media` (for avatars, feed images, story media)
- Private bucket: `private-media` (for chat attachments)
- Processing bucket: `processing` (temporary artifacts)

### Telegram Media Adapter (Future)

The `TelegramMediaProvider` implements the same interface for Telegram-hosted media.
Telegram file IDs must not be treated as permanent CDN URLs.
All authorization still passes through the media service.

---

## 6. CDN & Caching

### Public Media

```
Cache-Control: public, max-age=31536000, immutable
ETag: "v{version}"
```

Public media uses content-addressable storage keys (version-based) enabling aggressive caching.

### Private Media

```
Cache-Control: private, max-age=300
```

Private media uses signed URLs with 1-hour expiry.

---

## 7. Access Control

Media access is controlled by the `getMediaUrl()` service:

| Media Visibility | Access Rule |
|-----------------|-------------|
| `public` | Anyone can view |
| `private` | Owner only, or match participant (chat) |
| `restricted` | Owner or moderator only |

Block checks are enforced at the media access layer. If User A blocks User B, media attached to blocked entities becomes inaccessible.

---

## 8. Media Lifecycle

```
uploading ──► uploaded ──► processing ──► ready
                                        │
                                        └──► failed
                                        
ready ──► deleted (soft)

orphaned (no usage for 24h) ──► cleanup
failed (retention 7d) ──► cleanup
deleted (retention 30d) ──► cleanup
```

- Orphaned media: no media_usage reference for 24+ hours
- Failed media: retained for 7 days
- Deleted media: soft-deleted, retained for 30 days

---

## 9. Processing Jobs

Jobs are created on upload and processed by the orchestrator:

```typescript
processPendingJobs(maxJobs = 10)
```

Retry with backoff: 1s → 5s → 30s (max 3 attempts)

For V1, image processing marks as ready without actual Sharp processing.
Full derivative generation requires server-side Sharp/FFmpeg installation.

---

## 10. Security

### Upload Security
- Server-generated storage paths
- MIME type validation (magic bytes/extension)
- File size enforcement
- Rate limited (10 uploads/minute)
- Purpose validation

### Access Security
- Ownership checks
- Block relationship checks
- Private media authorization
- Signed URL expiry (1 hour)

### RLS Policies
- Users can read their own media
- Users can read public media
- Users can read private media only if authorized (via DB function)
- Only owners can delete their media
- Processing jobs are moderator-only

---

## 11. Rate Limits

| Operation | Limit |
|-----------|-------|
| Upload | 10/minute/user |
| Processing | 20/minute (system) |

---

## 12. Analytics Events

| Event | Description |
|-------|-------------|
| `media_upload_completed` | Upload finished successfully |
| `media_upload_failed` | Upload failed |
| `media_processing_completed` | Processing finished |
| `media_processing_failed` | Processing failed |
| `media_deleted` | Media marked as deleted |

---

## 13. Component Library

### OptimizedImage
```tsx
<OptimizedImage
  mediaId="uuid"
  alt="Description"
  derivative="medium"
  className="w-full rounded-lg"
/>
```

### OptimizedVideo
```tsx
<OptimizedVideo
  mediaId="uuid"
  posterMediaId="uuid"  // thumbnail/poster
  className="rounded-lg"
/>
```

### MediaViewer (Full-screen)
```tsx
<MediaViewer
  mediaId="uuid"
  mediaType="image"
  onClose={() => setOpen(false)}
/>
```

### MediaUploader
```tsx
<MediaUploader
  purpose="post"
  onUploadComplete={(r) => setMediaId(r.id)}
  maxFileSize={10 * 1024 * 1024}
  accept="image/jpeg,image/png,image/webp"
/>
```

### Avatar (Updated)
```tsx
<Avatar
  mediaId="uuid"          // or src (backward compatible)
  alt="User name"
  size="md"
/>
```

---

## 14. Migration from Existing System

The media pipeline is designed to be incrementally adoptable:
1. New uploads use the unified `uploadMedia()` service
2. Existing media records remain valid
3. Feature code can migrate to `getMediaUrl()` at their own pace
4. Storage keys follow the new format going forward

---

## 15. Manual Setup Required

### Supabase Storage Buckets

The migration creates database tables, but the following Supabase Storage buckets must be created manually:

1. **`media`** — Public bucket for avatars, feed images, story media
   - Set public access policy: `SELECT, INSERT, UPDATE, DELETE` for authenticated users

2. **`private-media`** — Private bucket for chat attachments
   - Set access policy: Only owners and match participants can read

3. **`processing`** — Private bucket for temporary processing artifacts
   - Set access policy: Server-side only (service role)

### Creating Buckets (SQL)

Run the following in Supabase SQL Editor (if CLI migration doesn't create them):

```sql
-- Public bucket
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Private buckets
insert into storage.buckets (id, name, public)
values ('private-media', 'private-media', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('processing', 'processing', false)
on conflict (id) do nothing;
```

### Bucket Policies (Recommended)

```sql
-- Public bucket: authenticated users can upload/read
create policy "Users can upload their own media"
  on storage.objects for insert
  with check (
    bucket_id = 'media'
    and storage.foldername(name)[2] = auth.uid()::text
  );

create policy "Users can read public media"
  on storage.objects for select
  using (bucket_id = 'media');
```

### Sharp (Optional)

For image derivative generation (thumbnails, WebP), install Sharp:

```bash
npm install sharp
```

Without Sharp, images are served as uploaded (originals are not downsized).

---

## 16. Future Architecture

### Post-MVP Improvements
1. **FFmpeg integration** — Video transcoding and thumbnail generation
2. **Sharp integration** — Server-side image derivative generation
3. **Redis caching** — Derivative URL resolution cache
4. **Background queue** — Use dedicated job queue for processing
5. **CDN integration** — CloudFront/Fastly for global delivery
6. **AVIF support** — Next-gen image format
7. **Content moderation** — NSFW detection integration
8. **Telegram provider** — Full Telegram file storage adapter
9. **Cost analytics** — Bandwidth tracking per user/feature
