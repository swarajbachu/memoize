import { useClerk } from "@clerk/clerk-expo";
import { router } from "expo-router";
import React from "react";
import { SafeAreaView, View } from "react-native";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";

const Home = () => {
  const { signOut, user } = useClerk();

  console.log(user);

  return (
    <SafeAreaView className="flex-1 ">
      <View>
        <Text>Welcome, {user?.id}</Text>
      </View>
      <Button
        onPress={() => {
          console.log("Signing out");
          signOut({
            redirectUrl: "/(auth)/sign-up",
          }).then(() => {
            router.push("/(auth)/sign-up");
          });
        }}
      >
        <Text>Sign Out</Text>
      </Button>
    </SafeAreaView>
  );
};

export default Home;
