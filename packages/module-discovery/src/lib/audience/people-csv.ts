import { parseCsvLine } from "../shared/parse-csv-line";

/**
 * DISC-CONS-P0-03.6: a people list from the existing import (CSV, or Excel read as CSV).
 * Required column: email. Optional: name, tags. Deterministic: a list of people is never
 * sent to AI to restructure; a file without an email column is refused with the reason.
 */
export type PeopleCsvResult = { rows: { email: string; name: string | undefined; tags: string | undefined }[]; errors: string[] };

export function parsePeopleCsv(text: string): PeopleCsvResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { rows: [], errors: ["No content to import."] };
  const header = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const emailIndex = header.indexOf("email");
  if (emailIndex === -1) return { rows: [], errors: ["Missing required column: email"] };
  const nameIndex = header.indexOf("name");
  const tagsIndex = header.indexOf("tags");
  const rows: PeopleCsvResult["rows"] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    const email = fields[emailIndex]?.trim();
    if (!email) {
      errors.push(`Row ${i + 1}: missing email, skipped.`);
      continue;
    }
    rows.push({
      email,
      name: nameIndex === -1 ? undefined : fields[nameIndex]?.trim() || undefined,
      tags: tagsIndex === -1 ? undefined : fields[tagsIndex]?.trim() || undefined,
    });
  }
  return { rows, errors };
}
