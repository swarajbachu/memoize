import type { MessageType } from "@memoize/validators/entries";
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
  you need to ask questions
  Follow these guidelines:
  1. Reflect briefly on the user's previous response (1-2 sentences).
  2. Provide a short, empathetic observation (1 sentence).
  3. Ask a follow-up question related to the user's focus area, only one question at a time to understand user better
  4. questions should make user thing better and understand what they are doing 
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

export async function generateReflection({
  journalEntry,
}: {
  journalEntry: MessageType[];
}): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Format the journal entries for the prompt
  const formattedEntries = journalEntry
    .map((entry) =>
      entry.role === "assistant"
        ? `Q: ${entry.content}`
        : `A: ${entry.content}`,
    )
    .join("\n\n");

  try {
    const reflectionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini-2024-07-18",
      messages: [
        {
          role: "system",
          content: `Generate a detailed first-person reflection that captures the complete journal entry. Write as if you are the person who wrote the journal, using natural, everyday language.

          Guidelines:
          - Write in first person ("I am", "I want", "I think")
          - Use simple, clear language like how people naturally talk
          - Create at least 2 paragraphs to cover different aspects
          - Include bullet points when listing steps, features, or plans
          - Stay grounded in what was actually written in the journal
          - Keep the tone authentic and straightforward
          - Avoid overly emotional or poetic language
          
          Example good reflection:
          "I've been deep into planning my new app development project. I really want to improve on existing apps by making everything faster and more efficient, especially the voice features. My main focus is on reducing latency and improving the voice quality, and I'm thinking of using OpenAI's real-time API to make it work better.

          The biggest challenges I'm facing are:
          - Learning React Native since I'm completely new to it
          - Setting up web sockets for proper connections
          - Getting the app ready for the app store

          I've decided to start with building a basic version first, focusing on the core journaling features. My plan is to make it simple but efficient – something where users can quickly make their entries. I especially like the idea of adding a communication feature that lets people journal while multitasking."
          
          Keep the reflection natural and honest, focusing on actual thoughts and plans expressed in the journal.`,
        },
        {
          role: "user",
          content: formattedEntries,
        },
      ],
      temperature: 0.7, // Add some creativity while maintaining coherence
      max_tokens: 200, // Limit length to ensure conciseness
    });

    const reflection = reflectionResponse?.choices[0]?.message.content || "";

    if (!reflection) {
      throw new Error("No reflection generated");
    }

    return reflection.trim();
  } catch (error) {
    console.error("Error generating reflection:", error);
    throw new Error("Failed to generate reflection");
  }
}
