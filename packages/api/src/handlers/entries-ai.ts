import OpenAI from "openai";

const openAi = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function createInitialQuestion(
  conversationHistory: string,
): Promise<{ question: string; proceedToNext: boolean }> {
  const prompt = `
  You are an AI assistant designed to start a journaling session. Your task is to ask initial, open-ended questions to understand the user's current state of mind and daily experiences. Follow these guidelines:
  
  1. Ask simple, direct questions about the user's day, thoughts, or feelings.
  2. Vary your questions to cover different aspects: emotions, activities, interactions, or reflections.
  3. Keep your questions short and clear.
  4. Format your response with proper line breaks for readability.
  
  Based on the following conversation history, provide a single question:
  
  ${conversationHistory}
  
  If you believe you have gathered enough context about the user's current state (usually after 2-3 exchanges), end your response with "PROCEED_TO_NEXT: true". Otherwise, end with "PROCEED_TO_NEXT: false".
  `;

  const response = await openAi.chat.completions.create({
    model: "gpt-4-1106-preview",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant specialized in starting journaling sessions.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 150,
    temperature: 0.7,
  });

  const content =
    response.choices[0]?.message?.content?.trim() ||
    "How are you feeling today?";
  const lines = content.split("\n");
  const question = lines
    .filter((line) => !line.startsWith("PROCEED_TO_NEXT:"))
    .join("\n")
    .trim();
  const proceedToNext = lines.some(
    (line) => line.trim() === "PROCEED_TO_NEXT: true",
  );

  return { question, proceedToNext };
}

export async function createInDepthResponse(
  conversationHistory: string,
): Promise<string> {
  const prompt = `
  You are an AI assistant designed to facilitate thoughtful journaling and provide supportive, therapy-inspired interactions. Follow these guidelines:
  
  1. Reflect briefly on the user's previous response (1-2 sentences).
  2. Provide a short, empathetic observation (1 sentence).
  3. Ask a follow-up question related to the user's focus area, only one question at a time to understand user better
  5. Balance emotional support with practical inquiry.
  6. Encourage reflection and self-discovery.
  7. Keep your entire response concise (4-5 sentences max)
  8. Format your response with proper line breaks for readability add \n at the end of each sentence. 
  
  Based on the following conversation history, provide a response following the above guidelines:
  
  ${conversationHistory}
  
  Ensure your response is relevant to the user's previous statements and encourages further exploration of their experiences, thoughts, and feelings.
  `;

  console.log(prompt, "prompt");

  const response = await openAi.chat.completions.create({
    model: "gpt-4o-mini-2024-07-18",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant specialized in facilitating in-depth journaling and providing therapeutic-like responses.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 200,
    temperature: 0.7,
  });

  const question =
    response.choices[0]?.message?.content?.trim() ||
    "How would you describe your feelings about today's events?";
  console.log(question);

  return question;
}
