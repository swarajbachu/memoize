import { protectedProcedure, publicProcedure } from "@/trpc";
import { users } from "@memoize/db";
import { db } from "@memoize/db";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "@memoize/validators/auth";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { Scrypt, generateId } from "lucia";
import { TimeSpan, createDate, isWithinExpirationDate } from "oslo";
import { alphabet, generateRandomString } from "oslo/crypto";
import { z } from "zod";
import { lucia } from "../lib/auth";

export const authRouter = {
  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    const { email, password } = input;

    const existingUser = await db.query.User.findFirst({
      where: (table, { eq }) => eq(table.email, email),
    });

    if (!existingUser || !existingUser?.hashedPassword) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Incorrect email or password",
      });
    }

    const validPassword = await new Scrypt().verify(
      existingUser.hashedPassword,
      password
    );
    if (!validPassword) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Incorrect email or password",
      });
    }

    const session = await lucia.createSession(existingUser.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    ctx.resHeaders.set("Set-Cookie", sessionCookie.serialize());

    return { success: true, sessionCookie };
  }),

  signup: publicProcedure
    .input(signupSchema)
    .mutation(async ({ input, ctx }) => {
      const { email, password } = input;

      const existingUser = await db.query.User.findFirst({
        where: (table, { eq }) => eq(table.email, email),
        columns: { email: true },
      });

      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cannot create account with that email",
        });
      }

      const userId = generateId(21);
      const hashedPassword = await new Scrypt().hash(password);
      await db.insert(users.User).values({
        id: userId,
        email,
        hashedPassword,
      });

      const verificationCode = await generateEmailVerificationCode(
        userId,
        email
      );
      // await sendMail(email, EmailVerificationTemplate, {
      //   code: verificationCode,
      // });

      const session = await lucia.createSession(userId, {});
      const sessionCookie = lucia.createSessionCookie(session.id);
      // ctx.res.setHeader("Set-Cookie", sessionCookie.serialize());

      return { success: true, sessionCookie };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await lucia.invalidateSession(ctx.session.id);
    const sessionCookie = lucia.createBlankSessionCookie();
    ctx.resHeaders.set("Set-Cookie", sessionCookie.serialize());
    return { success: true, sessionCookie };
  }),

  resendVerificationEmail: protectedProcedure.mutation(async ({ ctx }) => {
    const lastSent = await db.query.emailVerificationCodes.findFirst({
      where: (table, { eq }) => eq(table.userId, ctx.user.id),
      columns: { expiresAt: true },
    });

    if (lastSent && isWithinExpirationDate(lastSent.expiresAt)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Please wait ${timeFromNow(
          lastSent.expiresAt
        )} before resending`,
      });
    }

    const verificationCode = await generateEmailVerificationCode(
      ctx.user.id,
      ctx.user.email
    );
    // await sendMail(ctx.user.email, EmailTemplate.EmailVerification, {
    //   code: verificationCode,
    // });

    return { success: true };
  }),

  verifyEmail: protectedProcedure
    .input(z.object({ code: z.string().length(8) }))
    .mutation(async ({ input, ctx }) => {
      const dbCode = await db.transaction(async (tx) => {
        const item = await tx.query.emailVerificationCodes.findFirst({
          where: (table, { eq }) => eq(table.userId, ctx.user.id),
        });
        if (item) {
          await tx
            .delete(users.emailVerificationCodes)
            .where(eq(users.emailVerificationCodes.id, item.id));
        }
        return item;
      });

      if (!dbCode || dbCode.code !== input.code) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid verification code",
        });
      }

      if (!isWithinExpirationDate(dbCode.expiresAt)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Verification code expired",
        });
      }

      if (dbCode.email !== ctx.user.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email does not match",
        });
      }

      await lucia.invalidateUserSessions(ctx.user.id);
      await db
        .update(users.User)
        .set({ emailVerified: true })
        .where(eq(users.User.id, ctx.user.id));
      const session = await lucia.createSession(ctx.user.id, {});
      const sessionCookie = lucia.createSessionCookie(session.id);
      ctx.resHeaders.set("Set-Cookie", sessionCookie.serialize());

      return { success: true, sessionCookie };
    }),

  sendPasswordResetLink: publicProcedure
    .input(forgotPasswordSchema)
    .mutation(async ({ input }) => {
      const user = await db.query.User.findFirst({
        where: (table, { eq }) => eq(table.email, input.email),
      });

      if (!user || !user.emailVerified) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Provided email is invalid.",
        });
      }

      const verificationToken = await generatePasswordResetToken(user.id);
      const verificationLink = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password/${verificationToken}`;

      // await sendMail(user.email, EmailTemplate.PasswordReset, {
      //   link: verificationLink,
      // });

      return { success: true };
    }),

  resetPassword: publicProcedure
    .input(resetPasswordSchema)
    .mutation(async ({ input }) => {
      const { token, password } = input;

      const dbToken = await db.transaction(async (tx) => {
        const item = await tx.query.passwordResetTokens.findFirst({
          where: (table, { eq }) => eq(table.id, token),
        });
        if (item) {
          await tx
            .delete(users.passwordResetTokens)
            .where(eq(users.passwordResetTokens.id, item.id));
        }
        return item;
      });

      if (!dbToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid password reset link",
        });
      }

      if (!isWithinExpirationDate(dbToken.expiresAt)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Password reset link expired.",
        });
      }

      await lucia.invalidateUserSessions(dbToken.userId);
      const hashedPassword = await new Scrypt().hash(password);
      await db
        .update(users.User)
        .set({ hashedPassword })
        .where(eq(users.User.id, dbToken.userId));
      const session = await lucia.createSession(dbToken.userId, {});
      const sessionCookie = lucia.createSessionCookie(session.id);

      return { success: true, sessionCookie };
    }),
} satisfies TRPCRouterRecord;

// Helper functions
const timeFromNow = (time: Date) => {
  const now = new Date();
  const diff = time.getTime() - now.getTime();
  const minutes = Math.floor(diff / 1000 / 60);
  const seconds = Math.floor(diff / 1000) % 60;
  return `${minutes}m ${seconds}s`;
};

async function generateEmailVerificationCode(
  userId: string,
  email: string
): Promise<string> {
  await db
    .delete(users.emailVerificationCodes)
    .where(eq(users.emailVerificationCodes.userId, userId));
  const code = generateRandomString(8, alphabet("0-9")); // 8 digit code
  await db.insert(users.emailVerificationCodes).values({
    userId,
    email,
    code,
    expiresAt: createDate(new TimeSpan(10, "m")), // 10 minutes
  });
  return code;
}

async function generatePasswordResetToken(userId: string): Promise<string> {
  await db
    .delete(users.passwordResetTokens)
    .where(eq(users.passwordResetTokens.userId, userId));
  const tokenId = generateId(40);
  await db.insert(users.passwordResetTokens).values({
    id: tokenId,
    userId,
    expiresAt: createDate(new TimeSpan(2, "h")),
  });
  return tokenId;
}
