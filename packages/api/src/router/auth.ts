import type { TRPCRouterRecord } from "@trpc/server";
import { eq, users } from "@memoize/db";
import { z } from "zod";

import { publicProcedure } from "../trpc";

export const authRouter = {
  addUserToDatabase: publicProcedure
    .input(
      users.userInsertSchema.extend({
        backendSecret: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.backendSecret !== process.env.BACKEND_SECRET) {
        throw new Error("Not Authorized");
      }
      const user = await ctx.db.query.User.findFirst({
        where: eq(users.User.clerkUserId, input.clerkUserId),
      });
      if (!user) {
        await ctx.db.insert(users.User).values({
          clerkUserId: input.clerkUserId,
          email: input.email,
          image: input.image,
          name: input.name,
        });
      }
      return user;
    }),
} satisfies TRPCRouterRecord;
