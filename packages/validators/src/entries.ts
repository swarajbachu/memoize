import { z } from "zod";

export const MessageSchema = z.object({
  content: z.string(),
  createdAt: z.string(),
  role: z.enum(["assistant", "user"]),
  type: z.string(),
});
export type MessageType = z.infer<typeof MessageSchema>;
