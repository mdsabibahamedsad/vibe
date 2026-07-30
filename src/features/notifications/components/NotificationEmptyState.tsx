"use client";

import { EmptyState } from "@/components/ui";

interface NotificationEmptyStateProps {
  category?: string;
}

/**
 * NotificationEmptyState — Shows when the user has no notifications.
 *
 * Customizes the message based on the active category filter.
 */
export function NotificationEmptyState({ category = "all" }: NotificationEmptyStateProps) {
  const getContent = () => {
    switch (category) {
      case "messages":
        return {
          title: "No message notifications",
          description: "Message notifications from your matches will appear here.",
        };
      case "dating":
        return {
          title: "No dating notifications",
          description: "New match notifications will appear here.",
        };
      case "social":
        return {
          title: "No social notifications",
          description: "Likes, comments, and new followers will appear here.",
        };
      case "system":
        return {
          title: "No system notifications",
          description: "Account updates and notices will appear here.",
        };
      default:
        return {
          title: "You're all caught up 🎉",
          description: "New activity will appear here.",
        };
    }
  };

  const content = getContent();

  return (
    <EmptyState
      icon={
        <span className="text-3xl" role="img" aria-hidden="true">
          {category === "all" ? "🎉" : "🔔"}
        </span>
      }
      title={content.title}
      description={content.description}
    />
  );
}
