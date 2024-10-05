import type { User } from "@clerk/nextjs/server";
import type { WebhookRequiredHeaders } from "svix";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { db, eq, schema } from "@memoize/db";

import { env } from "~/env";
import { api } from "~/trpc/server";

export const runtime = "edge";
const webhookSecret = env.WEBHOOK_SECRET;

type UnwantedKeys =
  | "emailAddresses"
  | "firstName"
  | "lastName"
  | "primaryEmailAddressId"
  | "primaryPhoneNumberId"
  | "phoneNumbers"
  | "profileImageUrl";

interface UserInterface extends Omit<User, UnwantedKeys> {
  email_addresses: {
    email_address: string;
    id: string;
  }[];
  primary_email_address_id: string;
  first_name: string;
  last_name: string;
  primary_phone_number_id: string;
  phone_numbers: {
    phone_number: string;
    id: string;
  }[];
  profile_image_url: string;
}

type EventType = "user.created" | "user.updated" | "user.deleted";

interface Event {
  data: UserInterface;
  object: "event";
  type: EventType;
}

async function handler(request: Request) {
  console.log("Received webhook request");

  // Parse the JSON payload
  const payload = await request.json();

  // Extract necessary headers for verification
  const headersAll = request.headers;
  console.log(headersAll, "headersAll");
  const heads: WebhookRequiredHeaders = {
    "svix-id": headersAll.get("svix-id") || "",
    "svix-timestamp": headersAll.get("svix-timestamp") || "",
    "svix-signature": headersAll.get("svix-signature") || "",
  };

  console.log(heads, "heads");

  // Initialize the Svix Webhook with the secret
  const wh = new Webhook(webhookSecret);
  let evt: Event | null = null;

  console.log("Payload:", payload);
  console.log("Headers:", heads);

  try {
    // Verify the webhook signature
    evt = wh.verify(JSON.stringify(payload), heads) as Event;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return NextResponse.json(
      {
        message: "Error occurred while verifying webhook.",
      },
      { status: 400 },
    );
  }

  const eventType: EventType = evt.type;
  const { id } = evt.data;

  try {
    switch (eventType) {
      case "user.created": {
        const { email_addresses, primary_email_address_id } = evt.data;
        const emailObject = email_addresses?.find(
          (email) => email.id === primary_email_address_id,
        );

        if (!emailObject) {
          return NextResponse.json(
            {
              message: "Primary email not found.",
            },
            { status: 400 },
          );
        }

        const details = {
          primaryEmail:
            emailObject.email_address ||
            evt.data.primaryEmailAddress?.emailAddress ||
            "",
          firstName: evt.data.first_name,
          lastName: evt.data.last_name,
          phoneNumber: evt.data.phone_numbers,
          profileImageUrl: evt.data.profile_image_url,
        };

        await api.auth.addUserToDatabase({
          clerkUserId: id,
          email: details.primaryEmail,
          image: details.profileImageUrl,
          name: `${details.firstName} ${details.lastName}`,
          backendSecret: env.BACKEND_SECRET,
        });

        break;
      }

      case "user.updated": {
        const { email_addresses, primary_email_address_id } = evt.data;
        const emailObject = email_addresses?.find(
          (email) => email.id === primary_email_address_id,
        );

        const userDetails = {
          primaryEmail:
            emailObject?.email_address ||
            evt.data.primaryEmailAddress?.emailAddress ||
            "",
          firstName: evt.data.first_name,
          lastName: evt.data.last_name,
          phoneNumber: evt.data.phone_numbers,
          profileImageUrl: evt.data.profile_image_url,
        };

        await db
          .update(schema.User)
          .set({
            name: `${userDetails.firstName} ${userDetails.lastName}`,
            email: userDetails.primaryEmail,
            image: userDetails.profileImageUrl,
            updatedAt: new Date(),
          })
          .where(eq(schema.User.clerkUserId, id));

        break;
      }

      case "user.deleted": {
        await db.delete(schema.User).where(eq(schema.User.clerkUserId, id));
        break;
      }

      default:
        console.warn(`Unhandled event type: ${eventType}`);
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
