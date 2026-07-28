"use client";

import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PostComposer } from "@/features/feed/components/PostComposer";

export default function CreatePage() {
  const router = useRouter();
  const { user, authenticated, loading } = useCurrentUser();

  if (loading) return null;
  if (!authenticated || !user) {
    router.push("/");
    return null;
  }

  return (
    <PostComposer
      userId={user.id}
      onPostCreated={() => {
        router.push("/feed");
      }}
      onClose={() => {
        router.back();
      }}
    />
  );
}
