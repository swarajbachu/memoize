import { useOAuth, useSession } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Alert, View } from "react-native";
import { Button } from "~/components/ui/button";
import { Text } from "~/components/ui/text";
import { assets } from "~/lib/constants";

const OAuth = () => {
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });
  const { session } = useSession();
  const blurhash =
    "|rF?hV%2WCj[ayj[a|j[az_NaeWBj@ayfRayfQfQM{M|azj[azf6fQfQfQIpWXofj[ayj[j[fQayWCoeoeaya}j[ayfQa{oLj?j[WVj[ayayj[fQoff7azayj[ayj[j[ayofayayayj[fQj[ayayj[ayfjj[j[ayjuayj[";

  const handleGoogleSignIn = async () => {
    try {
      const { createdSessionId, setActive } = await startOAuthFlow({
        redirectUrl: Linking.createURL("/(dashboard)/home"),
      });

      if (createdSessionId) {
        if (setActive) {
          await setActive({ session: createdSessionId });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        const test = session?.user.publicMetadata;

        Alert.alert("Success", "Session exists. Redirecting to home screen.");
        if (!test?.isOnboard) {
          router.replace("/(auth)/onboard");
          return;
        }
        router.replace("/(dashboard)/home");
        return;
      }
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", err.errors[0].longMessage);
    }
  };

  return (
    <View>
      <Button onPress={handleGoogleSignIn} variant="secondary">
        <Image
          source={assets.googleLogo}
          placeholder={{ blurhash }}
          contentFit="contain"
          style={{
            width: 24,
            height: 24,
            position: "absolute",
            left: 16,
          }}
        />
        <Text>Sign Up with Google</Text>
      </Button>
    </View>
  );
};

export default OAuth;
