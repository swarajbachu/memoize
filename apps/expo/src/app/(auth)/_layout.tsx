import { Stack } from "expo-router";
import { useColorScheme } from "nativewind";

const Layout = () => {
  const { colorScheme } = useColorScheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: {
          backgroundColor: colorScheme === "dark" ? "#09090B" : "#F8FAFC",
        },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
    </Stack>
  );
};

export default Layout;
