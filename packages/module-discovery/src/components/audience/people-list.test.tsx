/** DISC-CONS-P0-05.2: the People list -- status, tags, source and referrals, one link
 * per person and nothing else to press; labelled fields on phones. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PeopleList } from "./people-list";
import type { AudienceLeadWithReferrals } from "../../lib/audience/types";

const lead: AudienceLeadWithReferrals = {
  id: "l1", workspace_id: "w1", email: "asha@example.com", name: "Asha", answers: {}, consent_text: "ok", consent_at: "2026-11-12",
  source: "waitlist", referrer_lead_id: null, utm: {}, status: "contacted", party_id: null, tags: ["parent"], referral_code: "0123456789abcdef",
  confirmation_sent_at: null, survey: null, created_at: "2026-11-12T00:00:00Z", referrals: 3,
};

describe("PeopleList", () => {
  it("shows each person's status, tags, source and referrals, with one link each", () => {
    const html = renderToStaticMarkup(<PeopleList leads={[lead]} basePath="/b/people" />);
    for (const text of ["Asha", "asha@example.com", "Contacted", "parent", "Sign-up page", ">3<", "Referrals: "]) expect(html).toContain(text);
    expect(html.match(/<(a|button|input|select)\b/g)).toEqual(["<a"]);
    expect(html).toContain('href="/b/people/l1"');
  });

  it("explains the empty list", () => {
    expect(renderToStaticMarkup(<PeopleList leads={[]} basePath="/b" />)).toContain("No one has signed up yet");
  });
});
