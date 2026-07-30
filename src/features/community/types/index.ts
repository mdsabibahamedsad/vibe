export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  avatarMediaId: string | null;
  visibility: "public" | "private";
  isActive: boolean;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CommunityMember {
  communityId: string;
  userId: string;
  role: "user" | "moderator" | "admin" | "super_admin";
  joinedAt: string;
}

export interface CommunityWithMembership extends Community {
  isMember: boolean;
  memberRole: CommunityMember["role"] | null;
}

export interface CreateCommunityInput {
  name: string;
  slug: string;
  description?: string;
  visibility?: "public" | "private";
}

export interface UpdateCommunityInput {
  name?: string;
  description?: string;
  avatarMediaId?: string;
  visibility?: "public" | "private";
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  caption: string | null;
  postType: string;
  visibility: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  isLiked: boolean;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  reportedPostId: string | null;
  reportedMessageId: string | null;
  reason: string;
  details: string | null;
  status: "pending" | "reviewing" | "resolved" | "dismissed";
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CreateReportInput {
  reportedUserId?: string;
  reportedPostId?: string;
  reportedMessageId?: string;
  reason: string;
  details?: string;
}
