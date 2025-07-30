// --- Changelog ---
// 1. Added a powerful 'retry' function to automatically handle temporary API errors.
// 2. Updated the getGeminiAnalysis function with a new, user-friendly prompt.

// This function will automatically retry a failed operation
const retry = async (fn, retries = 3, delay = 1000, finalErr = 'Failed after multiple attempts') => {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) {
      throw new Error(finalErr);
    }
    // Wait for a moment before trying again (exponential backoff)
    await new Promise(res => setTimeout(res, delay));
    return retry(fn, retries - 1, delay * 2, finalErr);
  }
};

// This is the new, user-friendly analysis function
async function getGeminiAnalysis(text) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("SERVER CONFIG ERROR: GEMINI_API_KEY is not set.");
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    
    // --- New & Improved Prompt ---
    const prompt = `
    You are an expert, empathetic social media analyst and coach. Your goal is to analyze a user's text and provide a friendly, insightful, and actionable analysis. Do not be robotic or overly academic.

    **Step 1: Analyze the Text.**
    Based on the provided text, classify the user into one of these archetypes:
    - The Digital Observer: Mostly shares links or consumes content without much personal commentary.
    - The Community Weaver: Focuses on replies, congratulating others, and connecting people.
    - The Focused Advocate: Posts with strong opinions about specific topics to persuade or inform.
    - The Content Creator: Produces original content (stories, ideas, visuals) to build a personal brand or share expertise.

    **Step 2: Handle Edge Cases.**
    If the text is just a URL (like "tanivashraf.com"), your entire analysis should be a user-friendly instruction. Your response should be a JSON object like this: 
    { "error": "For a proper analysis, please paste the actual text content from your posts, not just a link." }

    **Step 3: Structure the Output.**
    For a valid analysis, you MUST return ONLY a valid JSON object. Do not include any other text or markdown. The JSON object must follow this exact structure:
    {
      "current_style": "A one-sentence, friendly summary of the user's archetype.",
      "what_this_looks_like": "Provide 1-2 concrete, relatable examples of posts this person might make.",
      "predicted_narrative": "In a story-like tone, describe the user's 6-month trajectory and what new archetype they are moving towards.",
      "why_this_shift_happens": "In an empathetic tone, explain the typical motivations or feelings behind this kind of change (e.g., 'This shift often comes from a growing confidence...').",
      "actionable_tip": "Provide one small, encouraging, and actionable piece of advice for the user related to their trajectory."
    }
    ---
    USER TEXT TO ANALYZE:
    ${text}
    ---
    `;

    const response = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok) {
        // This makes the retry function work for temporary server errors
        if (response.status === 503 || response.status === 429) {
            throw new Error(`Temporary Server Error: ${response.status}`);
        }
        const errorBody = await response.text(); throw new Error(`Gemini API Error (Status: ${response.status}): ${errorBody}`);
    }
    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
    if (!jsonMatch) { throw new Error("Could not parse JSON from Gemini response."); }
    return JSON.parse(jsonMatch[1] || jsonMatch[2]);
}

// The main handler, now wrapped in the retry logic
export default async function handler(req, res) {
    try {
        const result = await retry(async () => {
            const { url, name } = req.query;
            //const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;
            // TEMPORARY DIAGNOSTIC TEST: HARDCODING THE KEY
            const SCRAPINGBEE_API_KEY = "XV92IJPZFL4VPR79QLD7UUULT9V13UKOF9HQWCBVHD8QC1AB62LQD62R4KR735BC64S2ZAXJNOY70TLV";

            if (!url || !name) throw new Error('URL and name parameters are required.');
            if (!SCRAPINGBEE_API_KEY) throw new Error("SERVER CONFIG ERROR: SCRAPINGBEE_API_KEY is not set.");

            const params = new URLSearchParams({ api_key: SCRAPINGBEE_API_KEY, url: url, extract_rules: '{"text":"body"}' });
            const scrapeResponse = await fetch(`https://app.scrapingbee.com/api/v1/?${params.toString()}`);
            
            if (!scrapeResponse.ok) {
                // This makes the retry function work for temporary server errors
                if (scrapeResponse.status === 503 || scrapeResponse.status === 429) {
                    throw new Error(`Temporary Scraping Error: ${scrapeResponse.status}`);
                }
                const errorText = await scrapeResponse.text();
                throw new Error(`Scraping service failed (Status: ${scrapeResponse.status}). Response: ${errorText}`);
            }

            const scrapedData = await scrapeResponse.json();
            const analysis = await getGeminiAnalysis(scrapedData.text.substring(0, 15000));
            return { name, analysis };
        });
        res.status(200).json(result);
    } catch (error) {
        const { name } = req.query;
        console.error(`[FATAL] Processing ${name} failed after retries:`, error);
        res.status(500).json({ name, error: "An internal server error occurred after multiple attempts.", debug_info: { message: error.message }});
    }
}

