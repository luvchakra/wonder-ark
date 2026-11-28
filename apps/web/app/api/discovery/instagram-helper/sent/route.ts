import { NextResponse } from "next/server";
import { z } from "zod";
import { markHelperMessageSent } from "@cofounderai/module-discovery/lib/instagram-helper/helper";
import { readJsonObject, refuseHelperRequest } from "../request";

const Body = z.object({ messageId: z.string().uuid() }).strict();

/** DISC-IG-P0-01.2: the person sent this Instagram message themselves. Safe to repeat. */
export async function POST(request: Request) {
  const refusal = await refuseHelperRequest(request);
  if (refusal) return refusal;
  const body = Body.safeParse(await readJsonObject(request));
  if (!body.success) return NextResponse.json({ error: "Send the message's id." }, { status: 400 });
  const outcome = await markHelperMessageSent(body.data.messageId);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.code });
  return NextResponse.json({ status: outcome.status });
}
