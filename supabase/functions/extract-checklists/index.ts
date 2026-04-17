// Edge function: extract-checklists
// Accepts a base64-encoded file (.docx, .xlsx, .csv, .pdf) and uses Lovable AI
// (Gemini multimodal) to extract one or more checklist drafts.
//
// Returns: { checklists: [{ title, category, subcategory, items: [{title, notes}] }] }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// --- Lightweight text extractors (no external libs needed for csv/xlsx-as-csv) ---

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function extractDocxText(bytes: Uint8Array): Promise<string> {
  // Use mammoth via esm.sh
  const mammoth = await import("https://esm.sh/mammoth@1.8.0?bundle");
  // mammoth needs a Buffer-like; we can pass arrayBuffer
  const result = await mammoth.extractRawText({
    arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
  return result.value || "";
}

async function extractXlsxText(bytes: Uint8Array): Promise<string> {
  // Use xlsx (SheetJS) via esm.sh
  const XLSX = await import("https://esm.sh/xlsx@0.18.5?bundle");
  const wb = XLSX.read(bytes, { type: "array" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`### SHEET: ${sheetName}\n${csv}`);
  }
  return parts.join("\n\n");
}

function extractCsvText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

// --- AI extraction ---

const SYSTEM_PROMPT = `You are extracting structured checklist data from old documents (Word, Excel, CSV, PDF).

The user runs a luxury estate management platform. They want to convert legacy documents into reusable checklists.

A "checklist" is a named list of tasks/items to tick off (e.g. "Master Bedroom Cleaning", "Pre-Departure Yacht Packing", "Weekly Pool Maintenance").

Rules:
- Identify ONE OR MORE distinct checklists in the document. Each Excel sheet, Word heading, or PDF section that contains a list of items = one checklist.
- For each checklist, extract a clean title, the most appropriate category (cleaning OR activity), and the list of individual items.
- "cleaning" = housekeeping, maintenance, audits, inspections, opening/closing routines.
- "activity" = packing lists, event prep, kids activities, trips.
- For activity lists, also infer a subcategory key (snake_case): skiing, yacht, business_trip, dinner_party, staff_function, bbq, football, baseball, basketball, dance, or a sensible new key.
- Items should be concise action statements ("Wipe down counters", "Pack ski goggles") — strip numbering/bullets.
- Skip headers, footers, empty rows, page numbers, and instructional text that aren't checklist items.
- If a row has notes/details after the main item, put those in "notes".
- Return AT LEAST 1 checklist, NEVER zero. If unclear, do your best to group related items.`;

async function extractWithAI(opts: {
  textContent?: string;
  fileBase64?: string;
  mimeType?: string;
  fileName: string;
}): Promise<any> {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  // Build user message — text-mode for docx/xlsx/csv, vision-mode for PDF
  const userContent: any[] = [];
  if (opts.fileBase64 && opts.mimeType) {
    // Multimodal — pass file inline (Gemini supports PDFs as image_url data URI)
    userContent.push({
      type: "text",
      text: `Source file: ${opts.fileName}\n\nExtract all checklists from this document.`,
    });
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${opts.mimeType};base64,${opts.fileBase64}`,
      },
    });
  } else {
    userContent.push({
      type: "text",
      text:
        `Source file: ${opts.fileName}\n\nExtracted text content:\n\n${opts.textContent}\n\n---\nExtract all checklists.`,
    });
  }

  const body = {
    model: "google/gemini-2.5-pro",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "submit_checklists",
          description: "Submit the extracted checklists.",
          parameters: {
            type: "object",
            properties: {
              checklists: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    category: { type: "string", enum: ["cleaning", "activity"] },
                    subcategory: { type: "string" },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          notes: { type: "string" },
                        },
                        required: ["title"],
                      },
                    },
                  },
                  required: ["title", "category", "items"],
                },
              },
            },
            required: ["checklists"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "submit_checklists" } },
  };

  const aiResp = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    console.error("AI gateway error:", aiResp.status, errText);
    if (aiResp.status === 429) throw new Error("Rate limited by AI gateway. Try again shortly.");
    if (aiResp.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
    throw new Error(`AI gateway error: ${aiResp.status}`);
  }

  const json = await aiResp.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    console.error("No tool call in response:", JSON.stringify(json).slice(0, 500));
    throw new Error("AI did not return structured checklists.");
  }

  const parsed = JSON.parse(toolCall.function.arguments);
  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileName, fileBase64, mimeType } = await req.json();

    if (!fileName || !fileBase64) {
      return new Response(
        JSON.stringify({ error: "fileName and fileBase64 required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const lower = fileName.toLowerCase();
    const bytes = decodeBase64(fileBase64);
    let result: any;

    if (lower.endsWith(".pdf")) {
      // Send PDF directly to Gemini for vision OCR
      result = await extractWithAI({
        fileBase64,
        mimeType: mimeType || "application/pdf",
        fileName,
      });
    } else if (lower.endsWith(".docx")) {
      const text = await extractDocxText(bytes);
      if (!text.trim()) throw new Error("Could not extract text from .docx file.");
      result = await extractWithAI({ textContent: text, fileName });
    } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      const text = await extractXlsxText(bytes);
      if (!text.trim()) throw new Error("Could not extract data from spreadsheet.");
      result = await extractWithAI({ textContent: text, fileName });
    } else if (lower.endsWith(".csv")) {
      const text = extractCsvText(bytes);
      result = await extractWithAI({ textContent: text, fileName });
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported file type. Use .docx, .xlsx, .csv, or .pdf" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate shape
    if (!result?.checklists || !Array.isArray(result.checklists) || result.checklists.length === 0) {
      throw new Error("No checklists could be identified in this file.");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extract-checklists error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
