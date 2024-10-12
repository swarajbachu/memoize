import { z } from "zod";

export const journalsEnum = z.enum([
  "morning_intention",
  "evening_reflection",
  "bullet_journal",
  "gratitude_journal",
  "evening_happiness_journal",
  "relationship_journal",
  "mindfulness_journal",
  "goal_setting_journal",
]);

export const journals: JournalingPrompts[] = [
  {
    value: "morning_intention",
    label: "Morning Intention Journal",
    description:
      "Kickstart your day by setting clear intentions and focusing on what matters most.",
    image: "https://example.com/images/morning_intention.png",
    prompts: [
      "What is your main focus for today?",
      "What are three things you want to accomplish today?",
      "What would make today great?",
    ],
    ending_note:
      "Please continue the conversation by encouraging me to explore my intentions for the day more deeply.",
  },
  {
    value: "evening_reflection",
    label: "Evening Reflection Journal",
    description:
      "Wind down your day by reflecting on your experiences and feelings.",
    image: "https://example.com/images/evening_reflection.png",
    prompts: [
      "What went well today?",
      "What challenges did you encounter?",
      "What did you learn from today's experiences?",
    ],
    ending_note: "Please help me delve deeper into my reflections about today.",
  },
  {
    value: "bullet_journal",
    label: "Bullet Journal",
    description: "Organize your thoughts, tasks, and goals efficiently.",
    image: "https://example.com/images/bullet_journal.png",
    prompts: [
      "List your top priorities for today.",
      "Are there any tasks you need to carry over from yesterday?",
      "Note any quick ideas or thoughts you want to remember.",
    ],
    ending_note:
      "Assist me in expanding on my plans and how I can achieve them.",
  },
  {
    value: "gratitude_journal",
    label: "Gratitude Journal",
    description: "Cultivate positivity by acknowledging the good in your life.",
    image: "https://example.com/images/gratitude_journal.png",
    prompts: [
      "List three things you are grateful for today.",
      "Who made a positive impact on you recently?",
      "What is something small that brought you joy today?",
    ],
    ending_note:
      "Encourage me to reflect further on the things I'm grateful for.",
  },
  {
    value: "evening_happiness_journal",
    label: "Evening Happiness Journal",
    description: "End your day by focusing on moments of happiness and joy.",
    image: "https://example.com/images/evening_happiness_journal.png",
    prompts: [
      "What made you smile today?",
      "Recall a happy moment from today.",
      "How did you contribute to someone else's happiness?",
    ],
    ending_note:
      "Please help me explore the joyful moments of my day more deeply.",
  },
  {
    value: "relationship_journal",
    label: "Relationship Journal",
    description: "Reflect on your relationships and interactions with others.",
    image: "https://example.com/images/relationship_journal.png",
    prompts: [
      "Who did you spend time with today?",
      "How did your interactions make you feel?",
      "Is there anything you'd like to improve in your relationships?",
    ],
    ending_note:
      "Assist me in reflecting more deeply on my relationships and interactions.",
  },
  {
    value: "mindfulness_journal",
    label: "Mindfulness Journal",
    description: "Enhance your awareness of the present moment.",
    image: "https://example.com/images/mindfulness_journal.png",
    prompts: [
      "What are you feeling right now?",
      "Describe your surroundings in detail.",
      "How can you bring more mindfulness into your day?",
    ],
    ending_note:
      "Encourage me to deepen my mindfulness practice and self-awareness.",
  },
  {
    value: "goal_setting_journal",
    label: "Goal Setting Journal",
    description:
      "Define and plan how to achieve your personal and professional goals.",
    image: "https://example.com/images/goal_setting_journal.png",
    prompts: [
      "What is a goal you'd like to achieve?",
      "Why is this goal important to you?",
      "What steps can you take to move towards this goal?",
    ],
    ending_note: "Help me elaborate on my goals and how I can achieve them.",
  },
];

export const JournalingPromptsSchema = z.object({
  value: journalsEnum,
  label: z.string(),
  description: z.string(),
  image: z.string(),
  ending_note: z.string(),
  prompts: z.array(z.string()),
});

export type JournalingPrompts = z.infer<typeof JournalingPromptsSchema>;
