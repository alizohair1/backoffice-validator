import { NextRequest, NextResponse } from "next/server";
import { parseAiPairs } from "@/lib/parseAiPairs";

// Keeps the Groq API key server-side only — it must never reach the
// browser. This route is the only place that reads GROQ_API_KEY.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const MAX_ITEMS_PER_SIDE = 150; // guardrail against oversized prompts / accidental abuse

interface DynamicsInput {
  itemNumber: string;
  productName: string;
}
interface S4UInput {
  sourceRow: number;
  description: string;
  vendor: string;
}

function buildPrompt(dynamicsItems: DynamicsInput[], s4uItems: S4UInput[]): string {
  // Deliberately NOT sending quantities. This step should only ever judge
  // whether two names refer to the same product — if quantity were part
  // of the signal, a genuine quantity mismatch could bias the model
  // toward rejecting (or worse, coincidentally accepting) a pairing, which
  // would defeat the whole point of the reconciliation.
  const dynList = dynamicsItems
    .map((d) => `- [D:${d.itemNumber}] ${d.productName}`)
    .join("\n");
  const s4uList = s4uItems
    .map((s) => `- [S:${s.sourceRow}] ${s.description}${s.vendor ? ` (vendor: ${s.vendor})` : ""}`)
    .join("\n");

  return `You are matching product names between two inventory systems for a restaurant chain. The same product is often spelled differently between systems: reordered words, missing units, abbreviations, or a dropped size/qualifier.

List A (Dynamics warehouse transfer system):
${dynList}

List B (S4U back-office purchase system):
${s4uList}

Find pairs from List A and List B that refer to the SAME physical product. Judge only by product identity (name, brand, flavor, size) — ignore that quantities aren't shown, they're irrelevant to this task. Only propose a pair if you're reasonably confident it's the same product — many items in List B are NOT transfer items at all (fresh produce, sauces, packaging bought locally) and genuinely have no match in List A, and some items in List A may have no match in List B. Do not force a pairing.

Respond with ONLY a JSON object, no other text, in this exact shape:
{"pairs": [{"d": "<item number from List A>", "s": <source row number from List B, as an integer>, "confidence": <integer 0-100>, "reason": "<under 12 words>"}]}

If there are no confident pairs, respond with {"pairs": []}.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "AI matching isn't configured on this deployment yet — GROQ_API_KEY is missing. Add it in Vercel → Project Settings → Environment Variables.",
      },
      { status: 500 }
    );
  }

  let body: { dynamicsItems?: DynamicsInput[]; s4uItems?: S4UInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request body." }, { status: 400 });
  }

  const dynamicsItems = body.dynamicsItems ?? [];
  const s4uItems = body.s4uItems ?? [];

  if (dynamicsItems.length === 0 || s4uItems.length === 0) {
    return NextResponse.json({
      suggestions: [],
      info: "Nothing to compare — one side has no unmatched items left.",
    });
  }
  if (dynamicsItems.length > MAX_ITEMS_PER_SIDE || s4uItems.length > MAX_ITEMS_PER_SIDE) {
    return NextResponse.json(
      { error: `Too many unmatched items for one AI pass (max ${MAX_ITEMS_PER_SIDE} per side).` },
      { status: 400 }
    );
  }

  const validDynNumbers = new Set(dynamicsItems.map((d) => d.itemNumber));
  const validS4URows = new Set(s4uItems.map((s) => s.sourceRow));

  let groqRes: Response;
  try {
    groqRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: buildPrompt(dynamicsItems, s4uItems) }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach Groq — check your connection and try again." }, { status: 502 });
  }

  if (!groqRes.ok) {
    if (groqRes.status === 401) {
      return NextResponse.json({ error: "Groq rejected the API key — check GROQ_API_KEY is correct." }, { status: 500 });
    }
    if (groqRes.status === 429) {
      return NextResponse.json({ error: "Groq's free-tier rate limit was hit — wait a minute and try again." }, { status: 429 });
    }
    const text = await groqRes.text().catch(() => "");
    return NextResponse.json({ error: `Groq API error (${groqRes.status}): ${text.slice(0, 200)}` }, { status: 502 });
  }

  const data = await groqRes.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "Groq returned an empty response." }, { status: 502 });
  }

  let parsed: { pairs?: { d: string; s: number; confidence: number; reason: string }[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return NextResponse.json({ error: "Couldn't parse the AI's response as JSON." }, { status: 502 });
  }

  const suggestions = parseAiPairs(parsed.pairs, validDynNumbers, validS4URows);
  return NextResponse.json({
    suggestions,
    info: suggestions.length === 0 ? "AI didn't find any confident matches among the rest." : undefined,
  });
}
