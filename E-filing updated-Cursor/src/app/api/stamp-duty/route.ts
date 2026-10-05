import { NextResponse } from "next/server";
import { calculateStampDuty, type StampDutyRequest } from "@/lib/stamp-duty/engine";

function asText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return "";
}

/**
 * FLOW BOUNDARY — data enters.
 * The browser POSTs JSON when the user clicks Calculate.
 * This route only reads that JSON and hands a StampDutyRequest to the engine.
 * Next step: calculateStampDuty. Then this route sends the engine's object back.
 * Failure points: the body is not JSON, the body is not an object, or the engine rejects a field.
 * Nothing here reads an environment variable. A missing Gemini key does not affect this route.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "The request was not valid JSON.", field: "propertyValue" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { ok: false, error: "Send a JSON object with the form fields.", field: "propertyValue" },
      { status: 400 },
    );
  }

  const record = body as Record<string, unknown>;
  const requestForEngine: StampDutyRequest = {
    state: asText(record.state),
    propertyValue: asText(record.propertyValue),
    gender: asText(record.gender),
    propertyType: asText(record.propertyType),
    transactionType: asText(record.transactionType),
  };

  const result = calculateStampDuty(requestForEngine);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
