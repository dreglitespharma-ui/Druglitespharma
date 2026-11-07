import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { createInvoiceGeminiError, INVOICE_GEMINI_MODELS } from './src/utils/geminiInvoiceModels';
import {
  buildOpenRouterInvoiceRequest,
  DEFAULT_OPENROUTER_INVOICE_MODEL,
  extractOpenRouterInvoiceText,
} from './src/utils/openRouterInvoice';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const firebaseConfig = JSON.parse(
    readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8')
  ) as { apiKey: string; projectId: string; firestoreDatabaseId: string };

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Initialize Gemini API client on the server side
  const apiKey = process.env.GEMINI_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const openRouterInvoiceModel = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_INVOICE_MODEL;
  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  const aiRequestWindows = new Map<string, { count: number; expiresAt: number }>();
  const invoiceParserVersion = '2026-11-05.3';
  const authenticateStaff: express.RequestHandler = async (_req, res, next) => {
    const token = _req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      res.status(401).json({ error: 'Sign in with an authorized pharmacy staff account to use AI features.' });
      return;
    }

    try {
      const identityResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        }
      );
      if (!identityResponse.ok) {
        const identityError = await identityResponse.json().catch(() => null) as {
          error?: { message?: string };
        } | null;
        const identityErrorCode = identityError?.error?.message;
        console.error('[AI Auth] Firebase token lookup rejected:', {
          status: identityResponse.status,
          code: identityErrorCode || 'UNKNOWN',
        });

        if (identityErrorCode?.includes('API_KEY') || identityErrorCode?.includes('KEY_INVALID')) {
          res.status(503).json({
            error: 'Firebase rejected the configured API key. Check that the app and server use the same Firebase project configuration.',
          });
          return;
        }

        res.status(identityResponse.status >= 500 ? 503 : 401).json({
          error: identityResponse.status >= 500
            ? 'Firebase Authentication is temporarily unavailable.'
            : `Firebase rejected the sign-in token${identityErrorCode ? ` (${identityErrorCode})` : ''}. Sign out and sign in again to use AI features.`,
        });
        return;
      }

      const identity = await identityResponse.json() as { users?: { localId?: string; email?: string }[] };
      const firebaseUser = identity.users?.[0];
      const uid = firebaseUser?.localId;
      if (!uid || !firebaseUser.email) {
        res.status(401).json({ error: 'The Firebase sign-in could not be verified.' });
        return;
      }

      const documentsUrl =
        `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}` +
        `/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents`;
      const getStaffDocument = async (documentPath: string) => {
        const response = await fetch(`${documentsUrl}/${documentPath}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return null;
        return await response.json() as { fields?: Record<string, Record<string, unknown>> };
      };
      const account = await getStaffDocument(`staff_accounts/${encodeURIComponent(uid)}`);
      const accountFields = account?.fields;
      const enabled = accountFields?.enabled?.booleanValue === true;
      const staffId = accountFields?.staffId?.stringValue;
      const role = accountFields?.role?.stringValue;
      if (!enabled || typeof staffId !== 'string' || typeof role !== 'string') {
        res.status(403).json({ error: 'This Firebase account is not authorized for an active pharmacy staff profile.' });
        return;
      }

      const profile = await getStaffDocument(`staff/${encodeURIComponent(staffId)}`);
      const profileFields = profile?.fields;
      if (
        profileFields?.id?.stringValue !== staffId ||
        typeof profileFields?.email?.stringValue !== 'string' ||
        profileFields.email.stringValue.toLowerCase() !== firebaseUser.email.toLowerCase() ||
        profileFields?.status?.stringValue !== 'Active' ||
        profileFields?.role?.stringValue !== role
      ) {
        res.status(403).json({ error: 'This Firebase account is not linked to an active pharmacy staff profile.' });
        return;
      }

      res.locals.staffUid = uid;
      next();
    } catch (error) {
      console.error('[AI Auth] Firebase staff verification failed:', error);
      res.status(503).json({ error: 'Unable to verify the pharmacy staff account. Try again shortly.' });
    }
  };

  const limitAiRequests: express.RequestHandler = (_req, res, next) => {
    const key = String(res.locals.staffUid || 'unknown');
    const now = Date.now();
    const current = aiRequestWindows.get(key);
    if (!current || current.expiresAt <= now) {
      aiRequestWindows.set(key, { count: 1, expiresAt: now + 60_000 });
    } else if (current.count >= 10) {
      res.status(429).json({ error: 'AI request limit reached. Wait one minute and try again.' });
      return;
    } else {
      current.count++;
    }
    if (aiRequestWindows.size > 1000) {
      for (const [userId, window] of aiRequestWindows) {
        if (window.expiresAt <= now) aiRequestWindows.delete(userId);
      }
    }
    next();
  };

  // In-memory circuit breaker for models with exhausted quota (429 RESOURCE_EXHAUSTED)
  const quotaExhaustedModels = new Map<string, number>();

  function isModelExhausted(model: string): boolean {
    const expiresAt = quotaExhaustedModels.get(model);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      quotaExhaustedModels.delete(model);
      return false;
    }
    return true;
  }

  function markModelExhausted(model: string, retryDelayMs = 3600000): void {
    quotaExhaustedModels.set(model, Date.now() + retryDelayMs);
  }

  // Prefer the current multimodal Flash model; keep lightweight fallbacks for compatibility.
  async function callGemini(payload: any, timeoutMs = 35000): Promise<any> {
    if (!ai) throw new Error('Gemini API key not configured');
    
    const activeModels = INVOICE_GEMINI_MODELS.filter(m => !isModelExhausted(m));
    if (activeModels.length === 0) {
      throw new Error('AI_QUOTA_COOLDOWN: All invoice-reading models are temporarily rate-limited. Wait about an hour, then retry.');
    }
    const errors: string[] = [];

    for (const model of activeModels) {
      try {
        const requestPayload = {
          ...payload,
          model,
        };
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`MODEL_TIMEOUT: ${model}`)), timeoutMs);
        });
        let response: any;
        try {
          response = await Promise.race([
            ai.models.generateContent(requestPayload),
            timeoutPromise,
          ]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }

        if (response && response.text) {
          response.usedModel = model;
          return response;
        }
        errors.push(`EMPTY_MODEL_RESPONSE: ${model} returned no text.`);
      } catch (e: any) {
        const msg = e?.message || String(e);
        errors.push(msg);
        const isQuota429 = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded');
        const isPermanentModelError = msg.includes('404') || msg.includes('NOT_FOUND');
        
        if (isQuota429) {
          markModelExhausted(model, 60 * 60 * 1000); // 1-hour cooldown
          console.log(`[Gemini Engine] Candidate ${model} quota reached daily limit; smoothly switching to available fallback.`);
        } else {
          console.log(`[Gemini Engine] Candidate ${model} unavailable: ${msg.slice(0, 100)}`);
        }
        if (isPermanentModelError) markModelExhausted(model, 24 * 60 * 60 * 1000);
      }
    }
    throw createInvoiceGeminiError(errors);
  }

  async function callOpenRouterInvoice(
    images: Array<{ imageBase64: string; mimeType: string }>,
    prompt: string,
    timeoutMs = 90000
  ): Promise<{ text: string; usedModel: string }> {
    if (!openRouterApiKey) {
      throw new Error('OPENROUTER_NOT_CONFIGURED: Set OPENROUTER_API_KEY on the server to enable invoice fallback.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${openRouterApiKey}`,
        },
        body: JSON.stringify(buildOpenRouterInvoiceRequest(images, prompt, openRouterInvoiceModel)),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as {
        choices?: unknown;
        model?: string;
        error?: { message?: string; type?: string };
      } | null;

      if (!response.ok) {
        const providerMessage = body?.error?.message || `OpenRouter returned HTTP ${response.status}`;
        if (response.status === 401 || response.status === 403) {
          throw new Error('OPENROUTER_INVALID_KEY: OpenRouter rejected the API key. Verify OPENROUTER_API_KEY in the server environment.');
        }
        if (response.status === 402) {
          throw new Error('OPENROUTER_CREDITS: OpenRouter account has insufficient credits.');
        }
        if (response.status === 429) {
          throw new Error('OPENROUTER_QUOTA: OpenRouter rate or usage limit reached.');
        }
        if (response.status === 503 || response.status === 529) {
          throw new Error('OPENROUTER_BUSY: OpenRouter or its model provider is temporarily overloaded.');
        }
        console.error('[Invoice OCR] OpenRouter request failed:', {
          status: response.status,
          type: body?.error?.type || 'unknown',
          message: providerMessage.slice(0, 300),
        });
        throw new Error(`OPENROUTER_UNAVAILABLE: OpenRouter could not process this invoice (HTTP ${response.status}).`);
      }

      const text = extractOpenRouterInvoiceText(body);
      if (!text) throw new Error('OPENROUTER_EMPTY_RESPONSE: OpenRouter returned no invoice text.');
      return { text, usedModel: body?.model || openRouterInvoiceModel };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('OPENROUTER_TIMEOUT: OpenRouter invoice extraction timed out. Try fewer or smaller pages.');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      hasApiKey: !!apiKey,
      hasOpenRouterInvoiceFallback: !!openRouterApiKey,
      openRouterInvoiceModel: openRouterInvoiceModel,
      invoiceParserVersion,
      timestamp: new Date().toISOString(),
    });
  });

  // Helper functions for pharma data normalization
  function toYearMonth(year: string, month: string): string {
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    if (!Number.isInteger(yearNumber) || yearNumber < 1900 || yearNumber > 2199 || monthNumber < 1 || monthNumber > 12) {
      return '';
    }
    return `${yearNumber}-${String(monthNumber).padStart(2, '0')}`;
  }

  function normalizeExpiryDate(rawExp: any): string {
    if (!rawExp || typeof rawExp !== 'string') return '';
    const clean = rawExp.trim().toUpperCase();
    if (/^\d{4}[-/]\d{2}$/.test(clean)) return toYearMonth(clean.slice(0, 4), clean.slice(5));

    const m1 = clean.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (m1) {
      return toYearMonth(m1[2], m1[1]);
    }

    const m2 = clean.match(/^(\d{1,2})[\/\-](\d{2})$/);
    if (m2) {
      const m = m2[1].padStart(2, '0');
      let y = parseInt(m2[2], 10);
      const fullY = y < 100 ? (y < 70 ? 2000 + y : 1900 + y) : y;
      return toYearMonth(String(fullY), m);
    }

    const months: Record<string, string> = {
      JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
      JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    for (const [name, num] of Object.entries(months)) {
      if (clean.includes(name)) {
        const yearMatch = clean.match(/(\d{4}|\d{2})$/);
        if (yearMatch) {
          let y = parseInt(yearMatch[1], 10);
          if (y < 100) y = 2000 + y;
          return toYearMonth(String(y), num);
        }
      }
    }

    return '';
  }

  function parsePackSize(packStr: any, dosageForm?: string): { packSize: number; packUnit: string } {
    if (typeof packStr === 'number' && Number.isInteger(packStr) && packStr > 0) {
      return { packSize: Math.floor(packStr), packUnit: `Pack of ${Math.floor(packStr)}` };
    }
    if (typeof packStr === 'number') return { packSize: 0, packUnit: '' };
    const str = String(packStr || '').trim().toLowerCase();
    
    const m1 = str.match(/(\d+)\s*[x\*]\s*(\d+)/i);
    if (m1) {
      const size = parseInt(m1[2], 10);
      return size > 0 ? { packSize: size, packUnit: `Strip of ${size}` } : { packSize: 0, packUnit: '' };
    }

    const m2 = str.match(/(\d+)\s*(?:'s|s|tabs?|caps?|units?|tablets?)/i);
    if (m2) {
      const size = parseInt(m2[1], 10);
      return size > 0 ? { packSize: size, packUnit: `Strip of ${size}` } : { packSize: 0, packUnit: '' };
    }

    const m3 = str.match(/(\d+)\s*(?:ml|gm|mg|vial|amp)/i);
    if (m3) {
      return { packSize: 1, packUnit: `${m3[0].toUpperCase()}` };
    }

    return { packSize: 0, packUnit: '' };
  }

  function cleanHsnCode(rawHsn: any): string {
    if (!rawHsn) return '';
    const clean = String(rawHsn).replace(/\D/g, '').trim();
    if (clean.length >= 4 && clean.length <= 8) {
      return clean;
    }
    return '';
  }

  // Invoice parsing endpoint with Gemini primary and OpenRouter fallback
  app.post('/api/gemini/parse-invoice', authenticateStaff, limitAiRequests, async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg', existingCatalog = [] } = req.body;
      const submittedImages = Array.isArray(req.body.images)
        ? req.body.images
        : [{ imageBase64, mimeType }];

      if (
        submittedImages.length < 1 ||
        submittedImages.length > 10 ||
        submittedImages.some((image: any) =>
          typeof image?.imageBase64 !== 'string' || image.imageBase64.length === 0
        )
      ) {
        return res.status(400).json({ error: 'Upload between 1 and 10 invoice pages.' });
      }
      if (!Array.isArray(existingCatalog)) {
        return res.status(400).json({ error: 'existingCatalog must be an array.' });
      }
      if (submittedImages.some((image: any) =>
        !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(image.mimeType || 'image/jpeg')
      )) {
        return res.status(400).json({ error: 'Only JPEG, PNG, WebP, and PDF invoices are supported.' });
      }

      const imageParts = submittedImages.map((image: any) => ({
        inlineData: {
          mimeType: image.mimeType || 'image/jpeg',
          data: image.imageBase64.replace(/^data:[^;]+;base64,/, ''),
        },
      }));

      if (!ai && !openRouterApiKey) {
        return res.status(503).json({
          error: 'Invoice extraction is unavailable. Configure GEMINI_API_KEY or OPENROUTER_API_KEY on the server. No invoice data was generated.',
        });
      }

      const catalogSummary = existingCatalog.slice(0, 150).map((m: any) => ({
        id: m.id,
        brandName: m.brandName,
        genericName: m.genericName,
        strength: m.strength,
        dosageForm: m.dosageForm,
        category: m.category,
        packSize: m.packSize,
        hsnCode: m.hsnCode,
      }));

      const systemPrompt = `You are the Lead Pharmaceutical Vision OCR and Tax Invoice Extraction Engine for Dr. Maya AI Pharmacy System.
Your job is to read and extract ALL information with surgical precision from this uploaded pharmacy distributor/supplier tax invoice, delivery challan, or goods receipt note.
The user may provide several images of consecutive pages from the SAME invoice. Treat them as one document, extract every line across all pages, do not omit continuation pages, and do not duplicate any line.

The invoice can be in ANY pharmaceutical layout:
- Standard multi-column grid invoices
- Compact dot-matrix 80-column/132-column printed bills
- 2-lines-per-item bills (Line 1: Item Name, Packing, HSN, Batch, Exp. Line 2: Qty, Free, PTR, MRP, Tax)
- Skewed, curved, low-contrast, or smartphone camera captured photos

COLUMN HEADING SYNONYMS & FALLBACK RULES:
1. Product Name / Description: "Description", "Particulars", "Item Name", "Product", "Drug Name", "Medicine", "Item Description"
2. Pack Size / Packing: "Pack", "Pkg", "Packing", "Size", "Pck", "Packaging" (e.g. "10's", "1x15", "10x10", "15 TAB", "100 ML", "1 VIAL", "1 STRIP", "10T") -> Extract integer packSize (e.g. 10, 15, 100) and descriptive packUnit.
3. HSN / SAC Code: "HSN", "HSN/SAC", "Commodity", "Tariff", "Code" (Must be 4 to 8 digits, typically starting with 3004, e.g. 30049099, 30041010, 30042099, 30045020).
4. Batch Number: "Batch", "Batch No.", "B.No.", "Lot", "Lot No", "Batch/Lot".
5. Expiry Date: "Exp", "Exp. Date", "Expiry", "Exp Date", "Val", "Validity", "EXP.DT", "EXP", "E.D.". You MUST normalize into standard "YYYY-MM" format (e.g. "05/27" -> "2027-05", "MAY 28" -> "2028-05", "11/2026" -> "2026-11").
6. Quantity: "Qty", "Quantity", "Billed Qty", "Units", "Packs", "Nos" (Integer >= 1).
7. Free / Scheme Quantity: "Free", "Free Qty", "F.Qty", "Scheme", "Sch", "Bonus" (Integer, default 0).
8. Trade Price / PTR: "PTR", "Trade Price", "Trade Rate", "Price to Retailer", "PTS", "Rate/Pack", "Rate". Extract the printed per-pack trade price BEFORE invoice discount as tradePrice. Never put MRP or taxable line total in this field. If not legible, return null.
9. MRP: "MRP", "M.R.P.", "Max Retail Price". Extract the printed per-pack MRP as sellingMrp. Never use MRP as tradePrice or purchaseCost and never estimate it; use 0 only if absent and add a verification warning.
10. GST %: "GST%", "Tax%", "IGST%", "CGST%+SGST%" (Total tax percentage, usually 5, 12, or 18).

PRICE AND TAX CALCULATION RULES (IMPORTANT):
- Map the printed billed quantity, free quantity, PTR/trade rate, MRP, discount, taxable line amount, line GST amount, and net line amount to their own meanings. Read column headings first and do not shift values between adjacent columns. PTR/trade price and MRP are separate invoice columns; extract both independently.
- tradePrice is the printed per-pack PTR/trade price before invoice discount. sellingMrp is the printed per-pack MRP.
- purchaseCost is the effective per-pack purchase cost BEFORE GST and AFTER any invoice discount. It is not MRP and must not include GST.
- Copy each printed line's taxable value (before GST) into taxableAmount, and its total GST amount into gstAmount. These are line totals, not per-pack rates. If the invoice shows CGST and SGST separately, gstAmount is their sum.
- If a printed line taxable amount (before GST) and billed quantity are both legible, set purchaseCost to taxable amount divided by billed quantity. Keep sufficient precision so quantity × purchaseCost represents the printed taxableAmount.
- Otherwise calculate purchaseCost from the per-pack PTR/trade rate after the line discount. Do not apply a discount twice.
- quantity is the billed quantity only. Do not include freeQty in taxable value or invoice totals.
- Use printed line taxable amounts and line GST amounts to cross-check the extracted quantity, rate, discount, and tax. Do not invent values to force a match; when a value is unclear, extract the best legible value and mention that it needs human verification in the summary.
- Copy the invoice's printed taxable, total GST, and net payable header totals into totalTaxable, totalGst, and netAmount. Do not substitute calculated totals for printed totals. If a printed total is absent or unreadable, use null for that header value.
- Totals are also the sum of the per-item taxableAmount and gstAmount, with each line rounded to two decimal places. Never force row values to match a header total by changing a legible quantity or price.

Existing Pharmacy Catalog for Matching:
${JSON.stringify(catalogSummary, null, 2)}

Strict DosageForm Options:
["Tablet", "Capsule", "Syrup", "Injection", "Ointment", "Spray", "Drops", "Suspension", "Inhaler", "Cosmetics", "Ice Cream"]

Dosage form extraction:
- Read dosage form from the product name/description and package text, not only a dedicated invoice column.
- Use only the supported options listed above.
- If the invoice omits the form field but the name clearly says "spray" (for example "MOOV SPRAY (35GM)"), return "Spray".
- Never guess a dosage form when the product text does not support one.

Strict MedicineCategory Options:
["Analgesics & Antipyretics", "Antibiotics & Antimicrobials", "Anti-infective & Antifungal", "Gastrointestinal & Antacids", "Cardiovascular & Antihypertensive", "Antidiabetic", "Respiratory & Anti-allergic", "Vitamins & Supplements", "Dermatology & Topicals", "CNS & Neurological", "Cosmetics & Personal Care", "FMCG, Food & Dairy"]

OUTPUT SCHEMA (STRICT JSON):
{
  "supplier": {
    "firmName": "Distributor/Wholesaler Firm Name",
    "invoiceNo": "Invoice Number",
    "invoiceDate": "YYYY-MM-DD",
    "gstin": "Supplier GSTIN"
  },
  "items": [
    {
      "medicineName": "Brand name of medicine",
      "genericName": "Salt / scientific formulation",
      "dosageForm": "Tablet",
      "strength": "650 mg",
      "category": "Analgesics & Antipyretics",
      "batchNumber": "DL-9940",
      "mfgDate": "YYYY-MM",
      "expiryDate": "YYYY-MM",
      "quantity": 1,
      "freeQty": 1,
      "packSize": 15,
      "packUnit": "Strip of 15",
      "tradePrice": 232.76,
      "purchaseCost": 225.78,
      "sellingMrp": 305.50,
      "taxableAmount": 225.78,
      "gstAmount": 11.29,
      "gstRate": 5,
      "hsnCode": "30049099",
      "matchedMedicineId": "id from existing catalog or null",
      "matchType": "exact | partial | new",
      "matchReason": "Explanation of match or new product"
    }
  ],
  "totalTaxable": 225.78,
  "totalGst": 11.29,
  "netAmount": 237.07,
  "summary": "Brief 1-line summary of extracted document"
}

Extract every single line item visible on the invoice. Return ONLY the raw JSON object.`;

      let responseText: string;
      let selectedModel: string;
      let selectedProvider: 'gemini' | 'openrouter';
      if (ai) {
        try {
          const response = await callGemini({
            contents: [
              {
                role: 'user',
                parts: [
                  ...imageParts,
                  {
                    text: systemPrompt,
                  },
                ],
              },
            ],
            config: {
              responseMimeType: 'application/json',
            },
          }, 45000);
          responseText = response.text || '{}';
          selectedModel = response.usedModel || INVOICE_GEMINI_MODELS[0];
          selectedProvider = 'gemini';
        } catch (geminiError) {
          if (!openRouterApiKey) throw geminiError;
          const reason = geminiError instanceof Error ? geminiError.message : String(geminiError);
          console.warn(`[Invoice OCR] Gemini failed; trying configured OpenRouter fallback: ${reason.slice(0, 180)}`);
          const response = await callOpenRouterInvoice(submittedImages, systemPrompt);
          responseText = response.text;
          selectedModel = response.usedModel;
          selectedProvider = 'openrouter';
        }
      } else {
        const response = await callOpenRouterInvoice(submittedImages, systemPrompt);
        responseText = response.text;
        selectedModel = response.usedModel;
        selectedProvider = 'openrouter';
      }

      let parsedData: any = {};
      try {
        parsedData = JSON.parse(responseText);
      } catch (jsonErr) {
        console.warn(`[Invoice OCR] ${selectedProvider} JSON parsing attempt failed, extracting with regex...`);
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error(`Failed to parse structured response from ${selectedProvider} model`);
        }
      }

      // Post-Processing Normalization Pipeline
      const rawItems = Array.isArray(parsedData.items) ? parsedData.items : [];
      if (rawItems.length === 0) {
        return res.status(422).json({ error: 'No invoice items were detected. Check the image or enter the invoice details manually.' });
      }

      const dosageForms = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Spray', 'Drops', 'Suspension', 'Inhaler', 'Cosmetics', 'Ice Cream'];
      const categories = [
        'Analgesics & Antipyretics',
        'Antibiotics & Antimicrobials',
        'Anti-infective & Antifungal',
        'Gastrointestinal & Antacids',
        'Cardiovascular & Antihypertensive',
        'Antidiabetic',
        'Respiratory & Anti-allergic',
        'Vitamins & Supplements',
        'Dermatology & Topicals',
        'CNS & Neurological',
        'Cosmetics & Personal Care',
        'FMCG, Food & Dairy',
      ];
      const lineWarnings: string[] = [];
      const normalizedItems = rawItems.map((item: any, index: number) => {
        const medicineName = typeof item?.medicineName === 'string' ? item.medicineName.trim() : '';
        const extractedDosageForm = dosageForms.find(value =>
          value.toLowerCase() === String(item?.dosageForm ?? '').trim().toLowerCase()
        );
        const productDescription = [
          medicineName,
          typeof item?.genericName === 'string' ? item.genericName : '',
          typeof item?.strength === 'string' ? item.strength : '',
          typeof item?.packUnit === 'string' ? item.packUnit : '',
          typeof item?.packing === 'string' ? item.packing : '',
        ].join(' ');
        const dosageForm = extractedDosageForm || (
          /\b(?:spray|aerosol)\b/i.test(productDescription) ? 'Spray' : undefined
        );
        const category = categories.find(value =>
          value.toLowerCase() === String(item?.category ?? '').trim().toLowerCase()
        );
        const quantity = Number(item?.quantity);
        const freeQty = item?.freeQty === undefined || item?.freeQty === null || item?.freeQty === ''
          ? 0
          : Number(item.freeQty);
        const extractedTaxableAmount = Number(item?.taxableAmount);
        const hasExtractedTaxableAmount = item?.taxableAmount !== null &&
          item?.taxableAmount !== undefined &&
          item?.taxableAmount !== '';
        const rawPurchaseCost = item?.purchaseCost === null || item?.purchaseCost === undefined || item?.purchaseCost === ''
          ? Number.NaN
          : Number(item.purchaseCost);
        const extractedPurchaseCost = Number.isFinite(rawPurchaseCost)
          ? rawPurchaseCost
          : hasExtractedTaxableAmount && Number.isFinite(extractedTaxableAmount) && Number.isInteger(quantity) && quantity > 0
            ? extractedTaxableAmount / quantity
            : Number.NaN;
        const extractedTradePrice = Number(item?.tradePrice);
        const tradePrice = item?.tradePrice !== null &&
          item?.tradePrice !== undefined &&
          item?.tradePrice !== '' &&
          Number.isFinite(extractedTradePrice) &&
          extractedTradePrice >= 0
          ? Math.round(extractedTradePrice * 100) / 100
          : null;
        const sellingMrp = item?.sellingMrp === null || item?.sellingMrp === undefined || item?.sellingMrp === ''
          ? 0
          : Number(item.sellingMrp);
        const packing = item?.packSize ?? item?.packUnit ?? item?.packing;
        const parsedPacking = parsePackSize(packing, dosageForm);
        const expiryDate = normalizeExpiryDate(item?.expiryDate);
        const gstText = String(item?.gstRate ?? '').trim().replace('%', '');
        const gstRate = ['NIL', 'EXEMPT', 'NONE', 'ZERO'].includes(gstText.toUpperCase())
          ? 0
          : Number(gstText);
        const invalidFields: string[] = [];
        if (!medicineName) invalidFields.push('medicine name');
        if (!item || typeof item.batchNumber !== 'string' || !item.batchNumber.trim()) invalidFields.push('batch number');
        if (!dosageForm) invalidFields.push('dosage form');
        if (!category) invalidFields.push('medicine category');
        if (!Number.isInteger(quantity) || quantity < 1) invalidFields.push('billed quantity');
        if (!Number.isInteger(freeQty) || freeQty < 0) invalidFields.push('free quantity');
        if (!Number.isFinite(extractedPurchaseCost) || extractedPurchaseCost < 0) invalidFields.push('purchase/trade cost');
        if (!Number.isFinite(sellingMrp) || sellingMrp < 0) invalidFields.push('MRP');
        if (!Number.isInteger(parsedPacking.packSize) || parsedPacking.packSize < 1) invalidFields.push('pack size');
        if (!expiryDate) invalidFields.push('expiry date');
        if (![0, 5, 12, 18, 28].includes(gstRate)) invalidFields.push('GST rate');
        if (invalidFields.length > 0) {
          throw new Error(
            `Invoice extraction incomplete: line ${index + 1}${medicineName ? ` (${medicineName})` : ''} needs ${invalidFields.join(', ')}.`
          );
        }

        const taxableAmount = hasExtractedTaxableAmount &&
          Number.isFinite(extractedTaxableAmount) && extractedTaxableAmount >= 0
          ? Math.round(extractedTaxableAmount * 100) / 100
          : Math.round(quantity * extractedPurchaseCost * 100) / 100;
        if (!hasExtractedTaxableAmount) {
          lineWarnings.push(`The printed taxable amount for ${medicineName} was not read; verify the extracted purchase rate.`);
        }
        if (tradePrice === null) {
          lineWarnings.push(`The printed PTR/trade price for ${medicineName} was not read; verify it against the invoice.`);
        }
        if (sellingMrp === 0) {
          lineWarnings.push(`The printed MRP for ${medicineName} was not read; verify it against the invoice.`);
        }
        const purchaseCost = taxableAmount / quantity;
        const extractedGstAmount = Number(item?.gstAmount);
        const hasExtractedGstAmount = item?.gstAmount !== null &&
          item?.gstAmount !== undefined &&
          item?.gstAmount !== '';
        const gstAmount = hasExtractedGstAmount &&
          Number.isFinite(extractedGstAmount) && extractedGstAmount >= 0
          ? Math.round(extractedGstAmount * 100) / 100
          : Math.round(taxableAmount * gstRate) / 100;
        if (!hasExtractedGstAmount) {
          lineWarnings.push(`The printed GST amount for ${medicineName} was not read; verify the tax calculation.`);
        }
        const { packSize, packUnit } = parsedPacking;
        const unitMrp = Math.round((sellingMrp / packSize) * 100) / 100;
        const unitPurchaseCost = Math.round((purchaseCost / packSize) * 100) / 100;
        const totalBaseUnits = (quantity + freeQty) * packSize;
        const hsnCode = cleanHsnCode(item.hsnCode);
        const mfgDate = item.mfgDate ? normalizeExpiryDate(item.mfgDate) : '';

        return {
          medicineName,
          genericName: typeof item.genericName === 'string' ? item.genericName.trim() : '',
          dosageForm,
          strength: typeof item.strength === 'string' ? item.strength.trim() : '',
          category,
          batchNumber: item.batchNumber.trim().toUpperCase(),
          mfgDate,
          expiryDate,
          quantity,
          freeQty,
          packSize,
          packUnit,
          purchaseCost,
          tradePrice,
          sellingMrp,
          taxableAmount,
          gstAmount,
          unitMrp,
          unitPurchaseCost,
          totalBaseUnits,
          gstRate,
          hsnCode,
          rackLocation: typeof item.rackLocation === 'string' ? item.rackLocation : '',
          matchedMedicineId: item.matchedMedicineId || null,
          matchType: item.matchType || (item.matchedMedicineId ? 'exact' : 'new'),
          matchReason: typeof item.matchReason === 'string' ? item.matchReason : '',
          selected: true,
        };
      });

      // Recalculate invoice totals accurately
      const { taxableCents, gstCents } = normalizedItems.reduce(
        (totals: { taxableCents: number; gstCents: number }, item: any) => {
          const lineTaxableCents = Math.round(item.taxableAmount * 100);
          return {
            taxableCents: totals.taxableCents + lineTaxableCents,
            gstCents: totals.gstCents + Math.round(item.gstAmount * 100),
          };
        },
        { taxableCents: 0, gstCents: 0 }
      );
      const totalTaxable = taxableCents / 100;
      const totalGst = gstCents / 100;
      const netAmount = (taxableCents + gstCents) / 100;
      const validationWarnings: string[] = [...lineWarnings];
      const reportedTotals = [
        ['taxable', parsedData.totalTaxable === null || parsedData.totalTaxable === undefined || parsedData.totalTaxable === ''
          ? Number.NaN : Number(parsedData.totalTaxable), totalTaxable],
        ['GST', parsedData.totalGst === null || parsedData.totalGst === undefined || parsedData.totalGst === ''
          ? Number.NaN : Number(parsedData.totalGst), totalGst],
        ['net payable', parsedData.netAmount === null || parsedData.netAmount === undefined || parsedData.netAmount === ''
          ? Number.NaN : Number(parsedData.netAmount), netAmount],
      ] as const;
      for (const [label, reported, calculated] of reportedTotals) {
        if (!Number.isFinite(reported) || reported < 0) {
          validationWarnings.push(`The invoice ${label} total could not be read; verify it against the original.`);
        } else if (Math.abs(reported - calculated) > 0.02) {
          validationWarnings.push(
            `Printed ${label} total (₹${reported.toFixed(2)}) differs from the sum of extracted line items (₹${calculated.toFixed(2)}). Check the pages and correct the entries before saving.`
          );
        }
      }

      return res.status(200).json({
        success: true,
        mode: `${selectedProvider}_multimodal`,
        aiProvider: selectedProvider,
        aiEngine: selectedModel,
        supplier: {
          firmName: typeof parsedData.supplier?.firmName === 'string' ? parsedData.supplier.firmName : '',
          invoiceNo: typeof parsedData.supplier?.invoiceNo === 'string' ? parsedData.supplier.invoiceNo : '',
          invoiceDate: typeof parsedData.supplier?.invoiceDate === 'string' ? parsedData.supplier.invoiceDate : '',
          gstin: typeof parsedData.supplier?.gstin === 'string' ? parsedData.supplier.gstin : '',
        },
        items: normalizedItems,
        pageCount: submittedImages.length,
        totalTaxable,
        totalGst,
        netAmount,
        validationWarnings,
        summary: typeof parsedData.summary === 'string' ? parsedData.summary : '',
      });
    } catch (err: unknown) {
      console.error('[Invoice OCR] Extraction failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('Invoice extraction incomplete:')) {
        return res.status(422).json({ error: message });
      }
      if (message.startsWith('AI_QUOTA:') || message.startsWith('AI_QUOTA_COOLDOWN:')) {
        return res.status(503).json({
          error: 'Gemini invoice-reading quota is temporarily unavailable. Wait before retrying, or check the API quota in Google AI Studio.',
        });
      }
      if (message.startsWith('AI_TIMEOUT:')) {
        return res.status(504).json({ error: message.replace(/^AI_TIMEOUT:\s*/, '') });
      }
      if (message.startsWith('AI_PERMISSION:')) {
        return res.status(503).json({
          error: 'The configured Gemini API key cannot access an invoice-reading model. Check that key and its model access in Google AI Studio.',
        });
      }
      if (message.startsWith('AI_BUSY:')) {
        return res.status(503).json({
          error: openRouterApiKey
            ? `${message.replace(/^AI_BUSY:\s*/, '')} OpenRouter fallback is configured; check the server logs if it also failed.`
            : 'Gemini is temporarily at capacity, and OpenRouter fallback is not enabled. Add OPENROUTER_API_KEY to the project .env file, then restart the app.',
        });
      }
      if (message.startsWith('AI_UNAVAILABLE:')) {
        console.error('[Invoice OCR] All configured Gemini models failed:', message.slice('AI_UNAVAILABLE:'.length).trim());
        return res.status(503).json({
          error: openRouterApiKey
            ? 'The configured invoice AI providers could not process this invoice right now. Check their API status and quota, then retry.'
            : 'Gemini could not process this invoice right now. Check the server connection and API quota, then retry with a clear JPG/PNG image or a smaller PDF.',
        });
      }
      if (message.startsWith('OPENROUTER_QUOTA:')) {
        return res.status(503).json({
          error: 'OpenRouter has reached a request or usage limit. Check your OpenRouter account limits and credits.',
        });
      }
      if (message.startsWith('OPENROUTER_CREDITS:')) {
        return res.status(503).json({
          error: 'OpenRouter account has insufficient credits. Add credits in OpenRouter, then retry.',
        });
      }
      if (message.startsWith('OPENROUTER_BUSY:')) {
        return res.status(503).json({
          error: 'OpenRouter or its selected model provider is temporarily at capacity. Try again shortly.',
        });
      }
      if (message.startsWith('OPENROUTER_INVALID_KEY:')) {
        return res.status(503).json({
          error: 'OpenRouter rejected the API key. Verify the complete OPENROUTER_API_KEY value in .env, then restart the app.',
        });
      }
      if (message.startsWith('OPENROUTER_TIMEOUT:')) {
        return res.status(504).json({
          error: message.replace(/^OPENROUTER_TIMEOUT:\s*/, ''),
        });
      }
      if (
        message.startsWith('OPENROUTER_UNAVAILABLE:') ||
        message.startsWith('OPENROUTER_EMPTY_RESPONSE:')
      ) {
        return res.status(503).json({
          error: `OpenRouter could not process this invoice using ${openRouterInvoiceModel}. Verify the model ID and its image/PDF support in OpenRouter.`,
        });
      }
      if (message.includes('Failed to parse structured response') || message.includes('JSON')) {
        return res.status(422).json({
          error: 'The AI could not read this invoice as structured data. Try a sharper, upright image with all invoice columns visible.',
        });
      }
      return res.status(503).json({
        error: message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
          ? 'Invoice extraction is temporarily unavailable because the AI service quota has been reached. No invoice data was generated.'
          : 'Invoice extraction could not be completed. Confirm the AI server is running, then retry with a clearer image or fewer pages. No invoice data was generated.',
      });
    }
  });

  // AI Assistant Chat & Actions endpoint
  app.post('/api/gemini/chat', authenticateStaff, limitAiRequests, async (req, res) => {
    try {
      const { message, history = [], context = {}, attachedImage } = req.body;

      if (!message && !attachedImage) {
        return res.status(400).json({ error: 'Message or image required' });
      }

      if (!ai) {
        return res.status(503).json({
          error: 'The AI assistant is unavailable until the server is configured with a Gemini API key.',
        });
      }

      const pharmacyContext = `
Current Pharmacy Live Context:
- Store Name: ${context.storeName || 'DRUGS LITES PHARMA'}
- Total Registered Products: ${context.totalMedicines || 0}
- Detailed Inventory Snapshot: ${JSON.stringify(context.inventorySnapshot || context.allMedicines || []).slice(0, 4000)}
- Low Stock Items (<20 units): ${JSON.stringify(context.lowStockMedicines || [])}
- Expiring Batches (<90 days): ${JSON.stringify(context.expiringBatches || [])}
- Today's Sales: ${context.todaySalesCount || 0} bills, Total Revenue: ₹${context.todayRevenue || 0}
`;

      const systemInstruction = `You are "Dr. Maya", an AI inventory and pharmacy-records assistant for "DRUGS LITES PHARMA".

CRITICAL INSTRUCTIONS:
1. Do not diagnose, recommend medicines or doses, assess drug interactions, or give clinical advice. Refer clinical questions to a licensed pharmacist or doctor.
2. Use only facts present in the supplied context. The inventory snapshot may be partial; say when information is missing and do not claim a live database check.
3. Give a brief explanation in "thinking"; do not reveal hidden chain-of-thought.
4. If specific medicines in the pharmacy inventory are relevant or requested, extract them into "matchedInventoryItems":
   [{ id, brandName, genericName, dosageForm, strength, totalStock, batches: [{ batchNumber, stock, expiryDate, rackLocation, mrp }] }]
5. Only suggest an inventory action when explicitly requested, and use values grounded in the supplied context:
   - "ADJUST_STOCK": { medicineName, medicineId, batchNumber, newStock, deltaStock, reason }
   - "UPDATE_PRICE": { medicineName, medicineId, batchNumber, newMrp, newPurchasePrice }
   - "UPDATE_EXPIRY": { medicineName, medicineId, batchNumber, newExpiryDate }
   - "NAVIGATE_TAB": { tab: "pos" | "catalog" | "batches" | "inward" | "reports" | "crm" | "expenses" }
6. Return strictly a JSON object with:
   - "thinking": Brief explanation based only on supplied records.
   - "reply": Operational response. Do not provide clinical advice.
   - "matchedInventoryItems": Array of matched inventory medicines.
   - "suggestedActions": Array of action cards.
   - "quickReplies": Array of 3-4 follow-up suggestion chips.`;

      const contents: any[] = [];

      // Include previous dialogue turns if provided
      if (Array.isArray(history) && history.length > 0) {
        history.slice(-6).forEach(h => {
          contents.push({
            role: h.role === 'assistant' || h.role === 'model' ? 'model' : 'user',
            parts: [{ text: h.text }],
          });
        });
      }

      const currentParts: any[] = [];
      if (attachedImage) {
        if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(attachedImage.mimeType)) {
          return res.status(400).json({ error: 'Only JPEG, PNG, WebP, and PDF attachments are supported.' });
        }
        const cleanBase64 = attachedImage.base64.replace(/^data:[^;]+;base64,/, '');
        currentParts.push({
          inlineData: {
            mimeType: attachedImage.mimeType || 'image/jpeg',
            data: cleanBase64,
          },
        });
      }

      currentParts.push({
        text: `${pharmacyContext}\n\nUser Message: ${message || 'Please examine this image and check inventory.'}`,
      });

      contents.push({
        role: 'user',
        parts: currentParts,
      });

      const response = await callGemini({
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      }, 12000);

      const responseText = response.text || '{}';
      let parsedResult;
      try {
        parsedResult = JSON.parse(responseText);
      } catch {
        parsedResult = {
          thinking: 'The assistant response could not be parsed as structured data.',
          reply: responseText,
          matchedInventoryItems: [],
          suggestedActions: [],
          quickReplies: ['Check low stock', 'Upload invoice', 'View inventory'],
        };
      }

      return res.status(200).json(parsedResult);
    } catch (err: unknown) {
      console.error('[Dr. Maya AI] Assistant request failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      return res.status(503).json({
        error: message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
          ? 'The AI assistant is temporarily unavailable because its service quota has been reached.'
          : 'The AI assistant could not complete this request. Verify the service configuration and try again.',
      });
    }
  });

  // Mount Vite or static server
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  // Fallback Express error handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Express error handler:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'Internal server error' });
    }
  });

  const host = process.env.HOST || '0.0.0.0';
  app.listen(port, host, () => {
    console.log(`DRUGS LITES PHARMA Server running on http://${host}:${port}`);
  });
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught server exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled server rejection:', reason);
});

startServer().catch((err) => {
  console.error('Server startup error:', err);
});
