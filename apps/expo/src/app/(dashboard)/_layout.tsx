import { Stack } from "expo-router";
import { useColorScheme } from "nativewind";

const Layout = () => {
  const { colorScheme } = useColorScheme();

  return (
    <Stack
      screenOptions={{
        contentStyle: {
          backgroundColor: colorScheme === "dark" ? "#09090B" : "#F8FAFC",
        },
      }}
    />
  );
};

export default Layout;
