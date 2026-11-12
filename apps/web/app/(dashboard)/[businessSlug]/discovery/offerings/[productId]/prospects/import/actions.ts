"use server";

import { businessPath } from "@/lib/business-path";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseProspectsCsv } from "@cofounderai/module-discovery/lib/prospects/csv";
import { parseImportFile } from "@cofounderai/module-discovery/lib/prospects/parse-import-file";
import { restructureImportedProspects } from "@cofounderai/module-discovery/lib/ai/restructure-import";
import {
  createProspectsBulk,
  extractDomain,
  type ProspectInput,
} from "@cofounderai/module-discovery/lib/prospects/mutations";
import { findDuplicateProspect } from "@cofounderai/module-discovery/lib/prospects/duplicates";
import { readImportFile } from "@cofounderai/module-discovery/lib/shared/read-import-file";
import { parsePeopleCsv } from "@cofounderai/module-discovery/lib/audience/people-csv";
import { importPeople } from "@cofounderai/module-discovery/lib/audience/leads";

export async function importProspectsAction(
  businessId: string,
  productId: string,
  workspaceId: string,
  formData: FormData,
) {
  const file = formData.get("file");
  const csv = String(formData.get("csv") ?? "");

  let rows: ProspectInput[];
  let parseErrors: string[];
  let aiRestructured = false;

  if (file instanceof File && file.size > 0) {
    const parsed = await parseImportFile(file);
    rows = parsed.rows;
    parseErrors = parsed.errors;
    if (rows.length === 0 && parsed.rawTextForAi) {
      rows = await restructureImportedProspects(workspaceId, parsed.rawTextForAi);
      aiRestructured = true;
    }
  } else {
    const parsed = parseProspectsCsv(csv);
    rows = parsed.rows;
    parseErrors = parsed.errors;
    if (rows.length === 0 && csv.trim()) {
      // Pasted text that doesn't match the expected headers -- same AI fallback the
      // file-upload path gets, so the template isn't a hard requirement either way.
      rows = await restructureImportedProspects(workspaceId, csv);
      aiRestructured = true;
    }
  }

  if (rows.length === 0) {
    throw new Error(parseErrors[0] ?? "No valid rows to import.");
  }

  // Dedup against both the existing pipeline and the rest of this same file (two rows
  // can share a domain/name) -- docs/prospects-pipeline-redesign-requirements.md R9.
  const seenDomains = new Set<string>();
  const seenNames = new Set<string>();
  const toInsert: typeof rows = [];
  let duplicates = 0;

  for (const row of rows) {
    const domain = row.website ? extractDomain(row.website) : null;
    const name = row.companyName.trim().toLowerCase();
    const inBatch = (domain !== null && seenDomains.has(domain)) || seenNames.has(name);
    const existing = inBatch
      ? null
      : await findDuplicateProspect(workspaceId, {
          companyName: row.companyName,
          website: row.website,
        });

    if (inBatch || existing) {
      duplicates += 1;
      continue;
    }
    if (domain) seenDomains.add(domain);
    seenNames.add(name);
    toInsert.push(row);
  }

  const inserted = toInsert.length > 0 ? await createProspectsBulk(workspaceId, toInsert) : 0;

  const prospectsPath = `${await businessPath(businessId)}/discovery/offerings/${productId}/prospects`;
  revalidatePath(prospectsPath);
  redirect(
    `${prospectsPath}?imported=${inserted}&skipped=${parseErrors.length}&duplicates=${duplicates}${aiRestructured ? "&aiRestructured=1" : ""}`,
  );
}

/**
 * DISC-CONS-P0-03.6: imports a people list for an offering sold to consumers. Refused
 * unless the importer ticked "These people agreed to hear from me"; that sentence is
 * stored as each person's consent. CSV or Excel with an `email` column; a PDF, or a file
 * without that column, is refused rather than sent to AI (it is personal data). Nobody
 * is emailed.
 */
export async function importPeopleAction(businessId: string, productId: string, workspaceId: string, formData: FormData) {
  const file = formData.get("file");
  let text = String(formData.get("csv") ?? "");
  if (file instanceof File && file.size > 0) {
    const read = await readImportFile(file);
    if (!read.structured) throw new Error("Upload a CSV or Excel file with an email column.");
    text = read.text;
  }
  const parsed = parsePeopleCsv(text);
  if (parsed.rows.length === 0) throw new Error(parsed.errors[0] ?? "No people to import.");
  const outcome = await importPeople(workspaceId, parsed.rows, formData.get("consent") === "yes");

  const prospectsPath = `${await businessPath(businessId)}/discovery/offerings/${productId}/prospects`;
  revalidatePath(prospectsPath);
  redirect(
    `${prospectsPath}?list=people&peopleImported=${outcome.added}&duplicates=${outcome.duplicates}&skipped=${outcome.invalid + parsed.errors.length}`,
  );
}
