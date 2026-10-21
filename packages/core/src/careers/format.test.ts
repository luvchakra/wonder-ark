import { describe, expect, it } from "vitest";
import { parseApplicationInput } from "./application-input";
import { consentText, descriptionParagraphs, jobTypeLabel, salaryLabel } from "./format";

/** PLATFORM-P1-13.1 -- the apply form's server-side validation and the page wording. */

const VALID = {
  name: "  Asha Rao ",
  email: " asha@example.com ",
  phone: "",
  location: "",
  linkedinUrl: "",
  resumeUrl: "https://drive.google.com/file/d/abc",
  coverNote: "",
  consent: true,
};

describe("parseApplicationInput", () => {
  it("trims and drops empty optional fields", () => {
    const result = parseApplicationInput(VALID);
    expect(result).toEqual({
      ok: true,
      data: {
        name: "Asha Rao",
        email: "asha@example.com",
        phone: undefined,
        location: undefined,
        linkedinUrl: undefined,
        resumeUrl: "https://drive.google.com/file/d/abc",
        coverNote: undefined,
        consent: true,
      },
    });
  });

  it("requires name, email, résumé link and consent", () => {
    const result = parseApplicationInput({ ...VALID, name: " ", email: "nope", resumeUrl: "", consent: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors).sort()).toEqual(["consent", "email", "name", "resumeUrl"]);
  });

  it.each(["http://example.com/cv.pdf", "javascript:alert(1)", "ftp://example.com/cv", "https://user:pw@example.com/cv", "example.com/cv"])(
    "accepts only https links (rejects %s)",
    (link) => {
      const resume = parseApplicationInput({ ...VALID, resumeUrl: link });
      const linkedin = parseApplicationInput({ ...VALID, linkedinUrl: link });
      expect(resume.ok).toBe(false);
      expect(linkedin.ok).toBe(false);
    },
  );

  it("limits the cover note to 4000 characters", () => {
    expect(parseApplicationInput({ ...VALID, coverNote: "a".repeat(4000) }).ok).toBe(true);
    const tooLong = parseApplicationInput({ ...VALID, coverNote: "a".repeat(4001) });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.fieldErrors.coverNote).toMatch(/4000/);
  });
});

describe("consentText", () => {
  it("names the retention period WonderJobs gives", () => {
    expect(consentText("WonderArk", 12)).toBe(
      "I agree that WonderArk stores my application to consider me for this and similar roles, and deletes it 12 months after its last update.",
    );
  });

  it("leaves the period out rather than inventing one", () => {
    expect(consentText("WonderArk", null)).toBe("I agree that WonderArk stores my application to consider me for this and similar roles.");
  });
});

describe("job wording", () => {
  it("shows a salary only when the job gives one", () => {
    expect(salaryLabel({ salaryMin: null, salaryMax: null, currency: "INR" })).toBeNull();
    expect(salaryLabel({ salaryMin: 600000, salaryMax: 900000, currency: "INR" })).toBe("₹6,00,000 – ₹9,00,000");
    expect(salaryLabel({ salaryMin: null, salaryMax: 90000, currency: "USD" })).toBe("Up to $90,000");
  });

  it("labels known job types and tidies unknown ones", () => {
    expect(jobTypeLabel("full_time")).toBe("Full-time");
    expect(jobTypeLabel("seasonal_role")).toBe("Seasonal role");
    expect(jobTypeLabel(null)).toBeNull();
  });

  it("splits a description into paragraphs as plain text", () => {
    expect(descriptionParagraphs("One\r\nline two\n\n\n<b>Two</b>\n\n")).toEqual(["One\nline two", "<b>Two</b>"]);
  });
});
