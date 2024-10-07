import { Link, router } from "expo-router";
import { useRef, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Home = () => {
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

export default Home;
