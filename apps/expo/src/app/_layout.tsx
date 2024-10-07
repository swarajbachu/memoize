import "@bacons/text-decoder/install";

import { ClerkLoaded, ClerkProvider } from "@clerk/clerk-expo";
import { SignedIn, SignedOut, useUser } from "@clerk/clerk-expo";
import { Link, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { TRPCProvider } from "~/utils/api";
import { tokenCache } from "~/utils/session-store";

import "../styles.css";
import { Text } from "react-native";

// This is the main layout of the app
// It wraps your pages with the providers they need
export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

  if (!publishableKey) {
    throw new Error(
      "Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env",
    );
  }

  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={publishableKey}>
      <ClerkLoaded>
        <TRPCProvider>
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: "#474DEB",
              },
              contentStyle: {
                backgroundColor: colorScheme === "dark" ? "#09090B" : "#F8FAFC",
              },
            }}
          />
          <StatusBar />
        </TRPCProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
