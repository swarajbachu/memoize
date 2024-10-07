import { useAuth } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";

const Page = () => {
  const { isSignedIn } = useAuth();

  if (isSignedIn) return <Redirect href="/(dashboard)/home" />;

  return <Redirect href="/(auth)/sign-up" />;
};

export default Page;
