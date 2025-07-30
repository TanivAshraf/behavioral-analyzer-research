// This is a Node.js serverless function
// It will run on Vercel's servers, not in the user's browser.

export default async function handler(req, res) {
  // Ensure this is a POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { text } = req.body;

  // The Gemini API Key is stored securely as an Environment Variable on Vercel
  const API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`;

  // This is our new, enhanced prompt for the AI. This is the core of your research methodology.
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

  try {
    const geminiResponse = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!geminiResponse.ok) {
        const errorBody = await geminiResponse.text();
        throw new Error(`Gemini API Error: ${geminiResponse.statusText} - ${errorBody}`);
    }
    
    const data = await geminiResponse.json();
    const responseText = data.candidates[0].content.parts[0].text;
    
    // Attempt to parse the JSON directly from Gemini's response
    const analysisResult = JSON.parse(responseText.trim());

    // Send the structured JSON back to the frontend
    res.status(200).json(analysisResult);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred during analysis.", details: error.message });
  }
}
