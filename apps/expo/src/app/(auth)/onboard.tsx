import { Link } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Onboard = () => {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <SafeAreaView
      className="flex h-full items-center justify-between"
      style={{
        backgroundColor: "#F8FAFC",
      }}
    >
      <Text className="text-primary">Home</Text>
      <Link href="/(auth)/sign-up">
        <Text className="text-primary">Sign In</Text>
      </Link>
    </SafeAreaView>
  );
};

export default Onboard;
