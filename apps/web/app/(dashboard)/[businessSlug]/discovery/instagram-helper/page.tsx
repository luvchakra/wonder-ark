import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { InstallSteps } from "@cofounderai/module-discovery/components/instagram-helper/install-steps";
import { HELPER_VERSION } from "@cofounderai/module-discovery/lib/instagram-helper/package.generated";

/**
 * DISC-IG-P0-01.3: where the Instagram helper is installed from. One page: what it does in
 * two lines, then the download and the three steps, with a live "Installed" check. It sits
 * under Discovery's own address, so the page guard has already checked the licence and the
 * person's role.
 */
export default async function InstagramHelperPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  if (!(await resolveBusinessIdBySlug(businessSlug))) notFound();
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Instagram helper</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A Chrome extension for your computer. On instagram.com it opens each prospect&apos;s chat and fills in the message WonderArk drafted. You
          read it and press Send yourself; it never sends for you.
        </p>
      </div>
      <InstallSteps downloadHref="/api/discovery/instagram-helper/download" version={HELPER_VERSION} />
      <p className="text-xs text-muted-foreground">
        Chrome on a phone can&apos;t run extensions: there, use Copy and open Instagram on the message&apos;s card.
      </p>
    </main>
  );
}
