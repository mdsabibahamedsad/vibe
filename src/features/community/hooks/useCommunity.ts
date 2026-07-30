"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { Community, CommunityWithMembership } from "../types";

interface UseCommunityReturn {
  communities: CommunityWithMembership[];
  myCommunities: CommunityWithMembership[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  join: (communityId: string) => Promise<void>;
  leave: (communityId: string) => Promise<void>;
}

interface UseCommunityDetailReturn {
  community: CommunityWithMembership | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  join: () => Promise<void>;
  leave: () => Promise<void>;
}

export function useCommunities(): UseCommunityReturn {
  const [communities, setCommunities] = useState<CommunityWithMembership[]>([]);
  const [myCommunities, setMyCommunities] = useState<CommunityWithMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [allRes, myRes] = await Promise.all([
        fetch("/api/community"),
        fetch("/api/community/mine"),
      ]);

      if (!allRes.ok) throw new Error("Failed to load communities");
      const allData = await allRes.json();
      setCommunities(allData.communities || []);

      if (myRes.ok) {
        const myData = await myRes.json();
        setMyCommunities(myData.communities || []);
      }
    } catch (err) {
      logger.error("Failed to fetch communities", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load communities");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    return () => { mountedRef.current = false; };
  }, [fetchAll]);

  const join = useCallback(async (communityId: string) => {
    const res = await fetch(`/api/community/${communityId}/join`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to join community");
    }
    await fetchAll();
  }, [fetchAll]);

  const leave = useCallback(async (communityId: string) => {
    const res = await fetch(`/api/community/${communityId}/leave`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to leave community");
    }
    await fetchAll();
  }, [fetchAll]);

  return {
    communities,
    myCommunities,
    loading,
    error,
    refresh: fetchAll,
    join,
    leave,
  };
}

export function useCommunity(id: string): UseCommunityDetailReturn {
  const [community, setCommunity] = useState<CommunityWithMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchCommunity = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/community/${id}`);
      if (!res.ok) throw new Error("Failed to load community");
      const data = await res.json();
      if (mountedRef.current) setCommunity(data.community || null);
    } catch (err) {
      logger.error("Failed to fetch community", {
        error: err instanceof Error ? err.message : "Unknown",
      });
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load community");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mountedRef.current = true;
    fetchCommunity();
    return () => { mountedRef.current = false; };
  }, [fetchCommunity]);

  const join = useCallback(async () => {
    const res = await fetch(`/api/community/${id}/join`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to join community");
    }
    await fetchCommunity();
  }, [id, fetchCommunity]);

  const leave = useCallback(async () => {
    const res = await fetch(`/api/community/${id}/leave`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to leave community");
    }
    await fetchCommunity();
  }, [id, fetchCommunity]);

  return {
    community,
    loading,
    error,
    refresh: fetchCommunity,
    join,
    leave,
  };
}
