export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { goal, model, style, techniques } = req.body;

  if (!goal || goal.trim().length < 5) {
    return res.status(400).json({ error: 'Please describe your goal in more detail.' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured.' });
  }

  // Build the meta-prompt
  const modelNames = {
    claude: 'Claude (Anthropic)',
    chatgpt: 'ChatGPT (OpenAI)',
    gemini: 'Gemini (Google)',
    llama: 'Llama (Meta)',
    any: 'any LLM'
  };

  const styleGuides = {
    structured: 'detailed and structured with clear sections, role assignment, constraints, and output format',
    concise: 'short and punchy — under 100 words, no fluff, just the essential instruction',
    conversational: 'natural and conversational, like talking to a smart colleague',
    technical: 'precise and technical, with specific parameters, edge cases, and developer-friendly formatting'
  };

  const techniqueList = (techniques || []).join(', ') || 'role assignment, clear instructions, output format';

  const systemPrompt = `You are an expert prompt engineer who creates world-class prompts that get extraordinary outputs from AI models.

Your job: take a user's goal and craft a perfect, optimised prompt for ${modelNames[model] || 'any LLM'}.

Style: ${styleGuides[style] || styleGuides.structured}

Required techniques to apply: ${techniqueList}

Rules:
- Start with a clear role/persona assignment
- Be specific about the task, context, and desired output
- Include constraints that prevent common failures
- Specify output format clearly
- Use [PLACEHOLDER] syntax for any variable parts the user needs to fill in
- Make it immediately usable — copy and paste ready

Return ONLY the prompt itself. No explanation, no preamble, no "Here is your prompt:". Just the raw prompt text, ready to use.`;

  const userMessage = `Create an optimised, highly tailored, and hyper-creative prompt for this specific goal: "${goal.trim()}". 
WARNING: Do not use a generic template or repeat previous formats. Explicitly adapt to the unique details of my request.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://promptcraft.vercel.app',
        'X-Title': 'PromptCraft'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        max_tokens: 1500,
        temperature: 0.85,
        presence_penalty: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      })
    });

    if (!response.ok) {
      let err;
      try { err = await response.json(); } catch { err = await response.text(); }
      console.error('OpenRouter API error:', err);
      return res.status(500).json({ error: JSON.stringify(err) });
    }

    const data = await response.json();
    const generatedPrompt = data.choices?.[0]?.message?.content || '';

    if (!generatedPrompt) {
      return res.status(500).json({ error: 'Empty response from AI. Please try again.' });
    }

    // Calculate a quality score based on prompt characteristics
    let score = 70;
    if (generatedPrompt.length > 200) score += 5;
    if (generatedPrompt.toLowerCase().includes('you are')) score += 5;
    if (generatedPrompt.includes('[')) score += 5;
    if (generatedPrompt.toLowerCase().includes('format') || generatedPrompt.toLowerCase().includes('structure')) score += 5;
    if (generatedPrompt.toLowerCase().includes('do not') || generatedPrompt.toLowerCase().includes('avoid') || generatedPrompt.toLowerCase().includes('never')) score += 5;
    if (generatedPrompt.split('\n').length > 4) score += 5;
    score = Math.min(score, 98);

    return res.status(200).json({
      prompt: generatedPrompt,
      score,
      model: model || 'claude',
      techniques: techniques || []
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: `Server error: ${error.message}` });
  }
}
