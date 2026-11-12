import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { AiActionState } from "@cofounderai/core/actions/ai-action-state";
import { AiActionForm } from "../ai/ai-action-form";
import { CopyTextButton } from "../ui/copy-text-button";
import { safeHttpUrl } from "../../lib/data-sources/suggestions";
import { CHANNEL_DRAFT_LABEL, CHANNEL_DRAFT_VARIANTS, type ChannelPost } from "../../lib/channels/drafts";

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * DISC-CONS-P0-02.2: the drafts on a channel prospect. One action writes a draft of the
 * chosen kind. The two emails land with the page's other draft messages; a community
 * post is listed here, labelled AI-generated, with Copy and "Mark as posted".
 * WonderArk never posts it: the person does, and pastes the link back.
 */
export function ChannelDrafts({
  writeAction,
  posts,
  markPostedAction,
}: {
  writeAction: (prevState: AiActionState, formData: FormData) => Promise<AiActionState>;
  posts: ChannelPost[];
  markPostedAction: (contentId: string) => (formData: FormData) => void | Promise<void>;
}) {
  return (
    <section id="channel-drafts" className="flex scroll-mt-4 flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium">Drafts for this channel</h2>
        <p className="text-sm text-muted-foreground">WonderArk never posts or sends these. Copy a draft and use it yourself.</p>
      </div>
      <AiActionForm action={writeAction} buttonLabel="Write draft" pendingText="Writing..." formClassName="flex flex-wrap items-center gap-2">
        <NativeSelect name="variant" defaultValue="pitch" className="w-auto" aria-label="Draft">
          {CHANNEL_DRAFT_VARIANTS.map((variant) => (
            <option key={variant} value={variant}>
              {CHANNEL_DRAFT_LABEL[variant]}
            </option>
          ))}
        </NativeSelect>
      </AiActionForm>

      {posts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {posts.map((post) => {
            const link = safeHttpUrl(post.external_url);
            return (
              <li key={post.id} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{post.title}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {post.origin === "user" ? "Edited by a person" : "AI-generated"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{post.body}</p>
                {post.status === "published" ? (
                  <p className="text-muted-foreground">
                    Posted by you{post.published_at ? ` on ${DAY.format(new Date(post.published_at))}` : ""}
                    {link ? (
                      <>
                        {": "}
                        <a href={link} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          {link}
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <CopyTextButton text={post.body ?? ""} />
                    <details className="min-w-0 flex-1">
                      <summary className="cursor-pointer text-sm font-medium">Mark as posted</summary>
                      <form action={markPostedAction(post.id)} className="mt-2 flex flex-wrap items-center gap-2">
                        <Input name="link" type="url" required placeholder="Link to your post" className="max-w-sm" aria-label="Link to your post" />
                        <SubmitButton size="sm" variant="outline" pendingText="Saving...">
                          Save
                        </SubmitButton>
                      </form>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
