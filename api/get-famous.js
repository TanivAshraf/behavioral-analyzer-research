// --- File: api/get-famous.js ---

// A reusable function for the Gemini analysis logic
async function getGeminiAnalysis(text) {
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        throw new Error("SERVER CONFIG ERROR: GEMINI_API_KEY environment variable is not set.");
    }
    
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;
    
    // IMPORTANT: Your full prompt goes here
    const prompt = `
    You are a computational social scientist. Your task is to analyze a user's social media text based on the "Online Engagement Matrix" and established behavioral archetypes.

    **1. The Online Engagement Matrix:**
    - X-Axis (Participation Style): From -1 (Passive Consumer) to +1 (Active Creator).
    - Y-Axis (Communication Focus): From -1 (Self-Focused Broadcast) to +1 (Community-Focused).

    **2. Research-Backed Archetypes (based on Brandtzæg, 2012, and modern types):**
    - The Passive: Primarily consumes content (x: ~-0.8, y: ~0.0).
    - The Socializer: Uses platform for interpersonal connection (x: ~-0.2, y: ~+0.7).
    - The Debater/Advocate: Expresses strong opinions to persuade (x: ~+0.6, y: ~+0.3).
    - The Creator/Influencer: Produces original content for a personal brand (x: ~+0.9, y: ~-0.7).

    **3. Your Task:**
    Analyze the user's text and perform the following steps:
    a. Determine the user's "current_archetype" from the list above.
    b. Based on the text's content (e.g., emotional valence, topic diversity, use of questions), provide a "prediction_reasoning" for a potential 6-month shift.
    c. Formulate a "predicted_narrative" that explains this shift as a trajectory. For example, a shift from Socializer towards Creator.
    
    **4. Output Format:**
    You MUST return your analysis ONLY in a valid JSON object format. Do not include any other text or markdown formatting. The JSON object must look exactly like this:
    {
      "current_archetype": "The Archetype Name",
      "prediction_reasoning": "A brief, one-sentence explanation for the predicted change.",
      "predicted_narrative": "A rich, 2-3 sentence paragraph explaining the user's behavioral trajectory in the context of the Engagement Matrix."
    }

    ---
    USER TEXT TO ANALYZE:
    ${text}
    ---
  `;

    const response = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API Error (Status: ${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON from Gemini response.");
    }
    return JSON.parse(jsonMatch[1] || jsonMatch[2]);
}

// The main handler for this serverless function
export default async function handler(req, res) {
    const { url, name } = req.query;
    const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;

    try {
        if (!url || !name) {
            return res.status(400).json({ error: 'URL and name parameters are required.' });
        }
        if (!BROWSERLESS_API_KEY) {
            throw new Error("SERVER CONFIG ERROR: BROWSERLESS_API_KEY environment variable is not set.");
        }
        
        // Step 1: Scrape the text content from the URL using Browserless
        const scrapeResponse = await fetch(`https://chrome.browserless.io/content?token=${BROWSERLESS_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Changelog: Added 'stealth: true' to help evade bot detection.
            body: JSON.stringify({ 
                url: url, 
                waitFor: 2000,
                stealth: true 
            })
        });
        
        if (!scrapeResponse.ok) {
            throw new Error(`Scraping service failed (Status: ${scrapeResponse.status}). Unable to fetch content from the URL.`);
        }
        
        const scrapedText = await scrapeResponse.text();
        
        // Step 2: Analyze the scraped text
        const analysis = await getGeminiAnalysis(scrapedText.substring(0, 15000));

        res.status(200).json({ name, analysis });

    } catch (error) {
        console.error(`[FATAL] Processing ${name} failed:`, error);
        res.status(500).json({ 
            name, 
            error: "An internal server error occurred.",
            debug_info: {
                message: error.message,
                name: error.name,
                stack: process.env.NODE_ENV === 'development' ? error.stack : 'Stack trace hidden in production'
            }
        });
    }
}
