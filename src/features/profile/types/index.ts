export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type TrustLevel = 'new' | 'trusted' | 'highly_trusted' | 'restricted';
export type RelationshipGoal = 'friendship' | 'dating' | 'long_term' | 'marriage' | 'not_specified';
export type LifestyleOption = 'yes' | 'no' | 'sometimes' | 'prefer_not_to_say';

export interface ProfileCompletionScore {
  userId: string;
  completionScore: number;
  hasAvatar: boolean;
  hasCover: boolean;
  hasBio: boolean;
  hasAge: boolean;
  hasGender: boolean;
  hasInterests: boolean;
  hasLanguages: boolean;
  hasOccupation: boolean;
  hasEducation: boolean;
  hasPhotos3Plus: boolean;
  hasRelationshipGoal: boolean;
  lastCalculatedAt: string;
}

export interface VerificationRequest {
  id: string;
  userId: string;
  status: VerificationStatus;
  selfieUrl?: string;
  documentUrl?: string;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReputationScore {
  userId: string;
  overallScore: number;
  matchSuccessScore: number;
  reportPenalty: number;
  spamDetectionScore: number;
  completionBonus: number;
  engagementScore: number;
  accountAgeDays: number;
  lastUpdatedAt: string;
}

export interface UserTrustLevel {
  userId: string;
  trustLevel: TrustLevel;
  reason?: string;
  assignedBy?: string;
  assignedAt: string;
  expiresAt?: string;
  updatedAt: string;
}

export interface UserLifestyle {
  userId: string;
  smoking: LifestyleOption;
  drinking: LifestyleOption;
  exercise: LifestyleOption;
  pets: LifestyleOption;
  religion?: string;
  wantsChildren: LifestyleOption;
  hasChildren: LifestyleOption;
  createdAt: string;
  updatedAt: string;
}

export interface UserRelationshipGoals {
  userId: string;
  primaryGoal: RelationshipGoal;
  secondaryGoals: RelationshipGoal[];
  createdAt: string;
  updatedAt: string;
}

export interface PrivacySettings {
  userId: string;
  showAge: boolean;
  showDistance: boolean;
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  showRelationshipGoal: boolean;
  showLifestyle: boolean;
  discoveryEnabled: boolean;
  incognitoMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Username {
  userId: string;
  username: string;
  updatedAt: string;
}

export interface FakeAccountFlag {
  id: string;
  userId: string;
  flagType: 'rapid_creation' | 'reused_media' | 'mass_liking' | 'auto_messaging' | 'frequent_reports';
  confidence: number;
  details: Record<string, any>;
  isActive: boolean;
  reviewed: boolean;
  createdAt: string;
}

export interface DuplicateAccountFlag {
  id: string;
  userId: string;
  flaggedUserId: string;
  reason: string;
  confidence: number;
  reviewed: boolean;
  createdAt: string;
}

export interface EnrichedProfile {
  userId: string;
  fullName: string;
  avatarUrl?: string;
  username?: string;
  dateOfBirth?: string;
  gender?: string;
  age?: number;
  bio?: string;
  occupation?: string;
  education?: string;
  heightCm?: number;
  languages: string[];
  interests: string[];
  photos: string[];
  completionScore: number;
  isVerified: boolean;
  verificationStatus: VerificationStatus;
  lifestyle?: UserLifestyle;
  relationshipGoal?: RelationshipGoal;
  isOnline?: boolean;
  lastSeen?: string;
  distanceKm?: number;
  isPremium: boolean;
}
