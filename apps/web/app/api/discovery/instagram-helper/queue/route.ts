import { NextResponse } from "next/server";
import { listHelperQueue } from "@cofounderai/module-discovery/lib/instagram-helper/helper";
import { refuseHelperRequest } from "../request";

/** DISC-IG-P0-01.2: the Instagram messages waiting for the signed-in person to send. */
export async function GET(request: Request) {
  const refusal = await refuseHelperRequest(request);
  if (refusal) return refusal;
  return NextResponse.json(await listHelperQueue(), { headers: { "Cache-Control": "no-store" } });
}
