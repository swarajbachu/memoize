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

export const emotions = [
  {
    label: "Happy",
    value: "happy",
    emoji: "😊",
    className:
      "bg-green-400/10 text-green-700 hover:bg-green-400/30 dark:bg-green-400/20 dark:text-green-300",
  },
  {
    label: "Sad",
    value: "sad",
    emoji: "😢",
    className:
      "bg-blue-400/10 text-blue-700 hover:bg-blue-400/30 dark:bg-blue-400/20 dark:text-blue-300",
  },
  {
    label: "Angry",
    value: "angry",
    emoji: "😠",
    className:
      "bg-red-400/10 text-red-700 hover:bg-red-400/30 dark:bg-red-400/20 dark:text-red-300",
  },
  {
    label: "Surprised",
    value: "surprised",
    emoji: "😮",
    className:
      "bg-yellow-400/10 text-yellow-700 hover:bg-yellow-400/30 dark:bg-yellow-400/20 dark:text-yellow-300",
  },
  {
    label: "Fearful",
    value: "fearful",
    emoji: "😱",
    className:
      "bg-purple-400/10 text-purple-700 hover:bg-purple-400/30 dark:bg-purple-400/20 dark:text-purple-300",
  },
  {
    label: "Disgusted",
    value: "disgusted",
    emoji: "🤢",
    className:
      "bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/30 dark:bg-emerald-400/20 dark:text-emerald-300",
  },
  {
    label: "Excited",
    value: "excited",
    emoji: "🤩",
    className:
      "bg-pink-400/10 text-pink-700 hover:bg-pink-400/30 dark:bg-pink-400/20 dark:text-pink-300",
  },
  {
    label: "Anxious",
    value: "anxious",
    emoji: "😰",
    className:
      "bg-violet-400/10 text-violet-700 hover:bg-violet-400/30 dark:bg-violet-400/20 dark:text-violet-300",
  },
  {
    label: "Content",
    value: "content",
    emoji: "😌",
    className:
      "bg-teal-400/10 text-teal-700 hover:bg-teal-400/30 dark:bg-teal-400/20 dark:text-teal-300",
  },
  {
    label: "Confused",
    value: "confused",
    emoji: "😕",
    className:
      "bg-amber-400/10 text-amber-700 hover:bg-amber-400/30 dark:bg-amber-400/20 dark:text-amber-300",
  },
  {
    label: "Bored",
    value: "bored",
    emoji: "😐",
    className:
      "bg-gray-400/10 text-gray-700 hover:bg-gray-400/30 dark:bg-gray-400/20 dark:text-gray-300",
  },
  {
    label: "Hopeful",
    value: "hopeful",
    emoji: "🤞",
    className:
      "bg-sky-400/10 text-sky-700 hover:bg-sky-400/30 dark:bg-sky-400/20 dark:text-sky-300",
  },
  {
    label: "Lonely",
    value: "lonely",
    emoji: "🥺",
    className:
      "bg-indigo-400/10 text-indigo-700 hover:bg-indigo-400/30 dark:bg-indigo-400/20 dark:text-indigo-300",
  },
  {
    label: "Frustrated",
    value: "frustrated",
    emoji: "😤",
    className:
      "bg-rose-400/10 text-rose-700 hover:bg-rose-400/30 dark:bg-rose-400/20 dark:text-rose-300",
  },
  {
    label: "Grateful",
    value: "grateful",
    emoji: "🙏",
    className:
      "bg-cyan-400/10 text-cyan-700 hover:bg-cyan-400/30 dark:bg-cyan-400/20 dark:text-cyan-300",
  },
  {
    label: "Guilty",
    value: "guilty",
    emoji: "😔",
    className:
      "bg-slate-400/10 text-slate-700 hover:bg-slate-400/30 dark:bg-slate-400/20 dark:text-slate-300",
  },
  {
    label: "Proud",
    value: "proud",
    emoji: "🥳",
    className:
      "bg-fuchsia-400/10 text-fuchsia-700 hover:bg-fuchsia-400/30 dark:bg-fuchsia-400/20 dark:text-fuchsia-300",
  },
  {
    label: "Jealous",
    value: "jealous",
    emoji: "😒",
    className:
      "bg-lime-400/10 text-lime-700 hover:bg-lime-400/30 dark:bg-lime-400/20 dark:text-lime-300",
  },
  {
    label: "Relieved",
    value: "relieved",
    emoji: "😌",
    className:
      "bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/30 dark:bg-emerald-400/20 dark:text-emerald-300",
  },
  {
    label: "Nervous",
    value: "nervous",
    emoji: "😬",
    className:
      "bg-violet-400/10 text-violet-700 hover:bg-violet-400/30 dark:bg-violet-400/20 dark:text-violet-300",
  },
  {
    label: "Inspired",
    value: "inspired",
    emoji: "💡",
    className:
      "bg-amber-400/10 text-amber-700 hover:bg-amber-400/30 dark:bg-amber-400/20 dark:text-amber-300",
  },
  {
    label: "Ashamed",
    value: "ashamed",
    emoji: "😳",
    className:
      "bg-rose-400/10 text-rose-700 hover:bg-rose-400/30 dark:bg-rose-400/20 dark:text-rose-300",
  },
  {
    label: "Envious",
    value: "envious",
    emoji: "😟",
    className:
      "bg-green-400/10 text-green-700 hover:bg-green-400/30 dark:bg-green-400/20 dark:text-green-300",
  },
  {
    label: "Motivated",
    value: "motivated",
    emoji: "🔥",
    className:
      "bg-orange-400/10 text-orange-700 hover:bg-orange-400/30 dark:bg-orange-400/20 dark:text-orange-300",
  },
  {
    label: "Overwhelmed",
    value: "overwhelmed",
    emoji: "😵",
    className:
      "bg-purple-400/10 text-purple-700 hover:bg-purple-400/30 dark:bg-purple-400/20 dark:text-purple-300",
  },
  {
    label: "Sympathetic",
    value: "sympathetic",
    emoji: "🤗",
    className:
      "bg-pink-400/10 text-pink-700 hover:bg-pink-400/30 dark:bg-pink-400/20 dark:text-pink-300",
  },
  {
    label: "Tired",
    value: "tired",
    emoji: "😴",
    className:
      "bg-blue-400/10 text-blue-700 hover:bg-blue-400/30 dark:bg-blue-400/20 dark:text-blue-300",
  },
  {
    label: "Curious",
    value: "curious",
    emoji: "🧐",
    className:
      "bg-yellow-400/10 text-yellow-700 hover:bg-yellow-400/30 dark:bg-yellow-400/20 dark:text-yellow-300",
  },
  {
    label: "Hopeful",
    value: "hopeful",
    emoji: "🌟",
    className:
      "bg-cyan-400/10 text-cyan-700 hover:bg-cyan-400/30 dark:bg-cyan-400/20 dark:text-cyan-300",
  },
  {
    label: "Embarrassed",
    value: "embarrassed",
    emoji: "😳",
    className:
      "bg-red-400/10 text-red-700 hover:bg-red-400/30 dark:bg-red-400/20 dark:text-red-300",
  },
  {
    label: "Determined",
    value: "determined",
    emoji: "💪",
    className:
      "bg-indigo-400/10 text-indigo-700 hover:bg-indigo-400/30 dark:bg-indigo-400/20 dark:text-indigo-300",
  },
];
