// --- FINAL CORRECTED VERSION ---

import { kv } from '@vercel/kv';

// This function will automatically retry a failed operation
const retry = async (fn, retries = 3, delay = 1000, finalErr = 'Failed after multiple attempts') => {
  try { return await fn(); } catch (err) {
    // Stop retrying if the error is a fatal configuration error
    if (err.message.includes("SERVER CONFIG ERROR")) {
        throw err;
    }
    if (retries <= 0) { throw new Error(finalErr); }
    await new Promise(res => setTimeout(res, delay));
    return retry(fn, retries - 1, delay * 2, finalErr);
  }
};

async function getGeminiAnalysis(text) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("SERVER CONFIG ERROR: GEMINI_API_KEY is not set.");
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const prompt = `You are an expert, empathetic social media analyst... [Your full prompt from our previous discussion goes here] ...`;

    const response = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok) { if (response.status === 503 || response.status === 429) { throw new Error(`Temporary Server Error: ${response.status}`); } const errorBody = await response.text(); throw new Error(`Gemini API Error (Status: ${response.status}): ${errorBody}`); }
    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
    if (!jsonMatch) { throw new Error("Could not parse JSON from Gemini response."); }
    return JSON.parse(jsonMatch[1] || jsonMatch[2]);
}

// The main handler, now with caching!
export default async function handler(req, res) {
    const { url, name } = req.query;
    const cacheKey = `analysis:${name.replace(/\s+/g, '-').toLowerCase()}`;

    try {
        let cachedResult = await kv.get(cacheKey);
        if (cachedResult) {
            console.log(`CACHE HIT for ${name}`);
            return res.status(200).json({ name, analysis: cachedResult });
        }

        console.log(`CACHE MISS for ${name}. Performing fresh analysis.`);
        const freshResult = await retry(async () => {
            //const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
          // TEMPORARY DIAGNOSTIC TEST: HARDCODING THE KEY
            const SCRAPINGBEE_API_KEY = "XV92IJPZFL4VPR79QLD7UUULT9V13UKOF9HQWCBVHD8QC1AB62LQD62R4KR735BC64S2ZAXJNOY70TLV";

            if (!url || !name) throw new Error('URL and name parameters are required.');
            if (!SCRAPINGBEE_API_KEY) throw new Error("SERVER CONFIG ERROR: SCRAPINGBEE_API_KEY is not set.");
            const params = new URLSearchParams({ api_key: SCRAPINGBEE_API_KEY, url: url, extract_rules: '{"text":"body"}' });
            const scrapeResponse = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`);
            if (!scrapeResponse.ok) { if (scrapeResponse.status === 503 || scrapeResponse.status === 429) { throw new Error(`Temporary Scraping Error: ${scrapeResponse.status}`); } const errorText = await scrapeResponse.text(); throw new Error(`Scraping service failed (Status: ${scrapeResponse.status}). Response: ${errorText}`); }
            const scrapedData = await scrapeResponse.json();
            const analysis = await getGeminiAnalysis(scrapedData.text.substring(0, 15000));
            return analysis;
        });

        if (freshResult.error) {
             return res.status(400).json({ name, error: freshResult.error });
        }
        
        await kv.setex(cacheKey, 86400, freshResult);
        res.status(200).json({ name, analysis: freshResult });

    } catch (error) {
        console.error(`[FATAL] Processing ${name} failed after retries:`, error);
        res.status(500).json({ name, error: "An internal server error occurred after multiple attempts.", debug_info: { message: error.message }});
    }
}







