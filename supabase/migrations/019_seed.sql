-- Vibe Database — Development Seed Data
-- Sample interests and categories for development/testing.
-- This is NOT for production data — use only in development environments.

-- ============================================================================
-- SEED: Interests
-- ============================================================================
insert into public.interests (name, slug, category, is_active) values
  -- Sports & Fitness
  ('Fitness', 'fitness', 'Sports & Fitness', true),
  ('Running', 'running', 'Sports & Fitness', true),
  ('Yoga', 'yoga', 'Sports & Fitness', true),
  ('Cycling', 'cycling', 'Sports & Fitness', true),
  ('Swimming', 'swimming', 'Sports & Fitness', true),
  ('Football', 'football', 'Sports & Fitness', true),
  ('Basketball', 'basketball', 'Sports & Fitness', true),
  ('Tennis', 'tennis', 'Sports & Fitness', true),
  ('Hiking', 'hiking', 'Sports & Fitness', true),
  ('Climbing', 'climbing', 'Sports & Fitness', true),

  -- Arts & Culture
  ('Photography', 'photography', 'Arts & Culture', true),
  ('Painting', 'painting', 'Arts & Culture', true),
  ('Drawing', 'drawing', 'Arts & Culture', true),
  ('Music', 'music', 'Arts & Culture', true),
  ('Dancing', 'dancing', 'Arts & Culture', true),
  ('Theater', 'theater', 'Arts & Culture', true),
  ('Museums', 'museums', 'Arts & Culture', true),
  ('Reading', 'reading', 'Arts & Culture', true),
  ('Writing', 'writing', 'Arts & Culture', true),
  ('Movies', 'movies', 'Arts & Culture', true),

  -- Food & Drink
  ('Cooking', 'cooking', 'Food & Drink', true),
  ('Baking', 'baking', 'Food & Drink', true),
  ('Coffee', 'coffee', 'Food & Drink', true),
  ('Wine', 'wine', 'Food & Drink', true),
  ('Vegan', 'vegan', 'Food & Drink', true),
  ('Foodie', 'foodie', 'Food & Drink', true),

  -- Travel & Adventure
  ('Travel', 'travel', 'Travel & Adventure', true),
  ('Backpacking', 'backpacking', 'Travel & Adventure', true),
  ('Camping', 'camping', 'Travel & Adventure', true),
  ('Road Trips', 'road-trips', 'Travel & Adventure', true),
  ('Beach', 'beach', 'Travel & Adventure', true),

  -- Technology
  ('Gaming', 'gaming', 'Technology', true),
  ('Programming', 'programming', 'Technology', true),
  ('AI', 'ai', 'Technology', true),
  ('Startups', 'startups', 'Technology', true),
  ('Design', 'design', 'Technology', true),

  -- Lifestyle
  ('Fashion', 'fashion', 'Lifestyle', true),
  ('Pets', 'pets', 'Lifestyle', true),
  ('Gardening', 'gardening', 'Lifestyle', true),
  ('Meditation', 'meditation', 'Lifestyle', true),
  ('Volunteering', 'volunteering', 'Lifestyle', true),
  ('Sustainability', 'sustainability', 'Lifestyle', true),

  -- Entertainment
  ('Karaoke', 'karaoke', 'Entertainment', true),
  ('Board Games', 'board-games', 'Entertainment', true),
  ('Video Games', 'video-games', 'Entertainment', true),
  ('Anime', 'anime', 'Entertainment', true),
  ('Comedy', 'comedy', 'Entertainment', true),

  -- Education
  ('Languages', 'languages', 'Education', true),
  ('History', 'history', 'Education', true),
  ('Science', 'science', 'Education', true),
  ('Philosophy', 'philosophy', 'Education', true)
on conflict (slug) do nothing;

-- ============================================================================
-- SEED: System config defaults
-- ============================================================================
insert into public.system_config (key, value, description) values
  ('app.name', '"Vibe"', 'Application display name'),
  ('app.version', '"0.1.0"', 'Current application version'),
  ('dating.discovery_radius_km', '100', 'Default discovery radius in kilometers'),
  ('dating.min_age', '18', 'Minimum age for dating discovery'),
  ('dating.max_age', '60', 'Maximum age for dating discovery'),
  ('stories.expiration_hours', '24', 'Hours before stories expire'),
  ('premium.monthly_price_stars', '500', 'Monthly premium price in Telegram Stars'),
  ('premium.yearly_price_stars', '5000', 'Yearly premium price in Telegram Stars')
on conflict (key) do nothing;

-- ============================================================================
-- NOTE: Seed data for development only
-- ============================================================================
-- The seed data above is for development/testing purposes only.
-- In production, interests may be curated differently.
-- Never include real user data in seed files.
-- Never include secrets, tokens, or keys in seed files.
