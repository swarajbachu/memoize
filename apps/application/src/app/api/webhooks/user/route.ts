import type { WebhookEvent } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { db, eq, schema } from "@memoize/db";

import { headers } from "next/headers";
import { env } from "~/env";
import { api } from "~/trpc/server";

export const runtime = "edge";
const webhookSecret = env.WEBHOOK_SECRET;

async function validateRequest(request: Request) {
  const payloadString = await request.text();
  const headerPayload = headers();

  const svixHeaders = {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    "svix-id": headerPayload.get("svix-id")!,
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    "svix-timestamp": headerPayload.get("svix-timestamp")!,
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    "svix-signature": headerPayload.get("svix-signature")!,
  };
  const wh = new Webhook(webhookSecret);
  return wh.verify(payloadString, svixHeaders) as WebhookEvent;
}

async function handler(request: Request) {
  console.log("Received webhook request", env.WEBHOOK_SECRET);

  const payload = await validateRequest(request);

  const id = payload.data.id;

  if (!id) {
    return NextResponse.json(
      {
        message: "User ID not found.",
      },
      { status: 400 },
    );
  }

  try {
    switch (payload.type) {
      case "user.created": {
        const { email_addresses, primary_email_address_id } = payload.data;
        const emailObject = email_addresses?.find(
          (email) => email.id === primary_email_address_id,
        );
        console.log(emailObject, "emailObject");

        if (!emailObject) {
          return NextResponse.json(
            {
              message: "Primary email not found.",
            },
            { status: 400 },
          );
        }
        const details = {
          primaryEmail: emailObject.email_address,
          firstName: payload.data.first_name,
          lastName: payload.data.last_name,
          phoneNumber: payload.data.phone_numbers,
          profileImageUrl: payload.data.image_url,
        };

        console.log(details, "details");

        await api.auth
          .addUserToDatabase({
            clerkUserId: payload.data.id,
            email: details.primaryEmail,
            image: details.profileImageUrl,
            name: `${details.firstName} ${details.lastName}`,
            backendSecret: env.BACKEND_SECRET,
          })
          .then((res) => {
            console.log(res, "res");
          });

        break;
      }

      case "user.updated": {
        const { email_addresses, primary_email_address_id } = payload.data;
        const emailObject = email_addresses?.find(
          (email) => email.id === primary_email_address_id,
        );

        const userDetails = {
          primaryEmail: emailObject?.email_address || "",
          firstName: payload.data.first_name,
          lastName: payload.data.last_name,
          phoneNumber: payload.data.phone_numbers,
          profileImageUrl: payload.data.image_url,
        };

        await db
          .update(schema.User)
          .set({
            name: `${userDetails.firstName} ${userDetails.lastName}`,
            email: userDetails.primaryEmail,
            image: userDetails.profileImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(schema.User.clerkUserId, payload.data.id));

        break;
      }

      case "user.deleted": {
        await db.delete(schema.User).where(eq(schema.User.clerkUserId, id));
        break;
      }

      default:
        console.warn(`Unhandled event type: ${payload.type}`);
    }

    return NextResponse.json({
      message: "Webhook processed successfully.",
    });
  } catch (error) {
    console.error("Error processing webhook event:", (error as Error).message);
    return NextResponse.json(
      {
        message: "Internal Server Error.",
      },
      { status: 500 },
    );
  }
}

export const POST = handler;
export const PUT = handler;
