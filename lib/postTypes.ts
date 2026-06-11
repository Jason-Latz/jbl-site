export type PostContentFormat = "markdown" | "html";

export type PostSaveSource = "manual" | "autosave" | "publish" | "restore";

export type PostPublishState = "draft" | "scheduled" | "published";

export type Post = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  content_format: PostContentFormat;
  published: boolean;
  published_at: string | null;
  scheduled_for: string | null;
  tags: string[];
  social_title: string | null;
  social_description: string | null;
  social_image_url: string | null;
  preview_token: string | null;
  preview_token_created_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type PostRevision = {
  id: string;
  post_id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  content_format: PostContentFormat;
  published: boolean;
  published_at: string | null;
  scheduled_for: string | null;
  tags: string[];
  social_title: string | null;
  social_description: string | null;
  social_image_url: string | null;
  save_source: PostSaveSource;
  created_at: string;
};

export type PostWritePayload = {
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  content_format: PostContentFormat;
  published: boolean;
  scheduled_for: string | null;
  tags: string[];
  social_title: string | null;
  social_description: string | null;
  social_image_url: string | null;
};

export function derivePostPublishState(
  post: Pick<Post, "published" | "scheduled_for">
): PostPublishState {
  if (!post.published) {
    return "draft";
  }

  if (post.scheduled_for) {
    const scheduledTime = new Date(post.scheduled_for).getTime();
    if (!Number.isNaN(scheduledTime) && scheduledTime > Date.now()) {
      return "scheduled";
    }
  }

  return "published";
}
