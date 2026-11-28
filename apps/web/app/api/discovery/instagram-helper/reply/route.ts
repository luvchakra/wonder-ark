import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_REPLY_LENGTH, saveHelperReply } from "@cofounderai/module-discovery/lib/instagram-helper/helper";
import { readJsonObject, refuseHelperRequest } from "../request";

const Body = z.object({ prospectId: z.string().uuid(), text: z.string().min(1).max(MAX_REPLY_LENGTH) }).strict();

/** DISC-IG-P0-01.2: a prospect's Instagram reply, saved by the person who received it. */
export async function POST(request: Request) {
  const refusal = await refuseHelperRequest(request);
  if (refusal) return refusal;
  const body = Body.safeParse(await readJsonObject(request));
  if (!body.success) return NextResponse.json({ error: "Send the prospect's id and the reply text." }, { status: 400 });
  const outcome = await saveHelperReply(body.data.prospectId, body.data.text);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.code });
  return NextResponse.json({ status: outcome.status });
}
