import { useSignIn } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import OAuth from "~/components/OAuth";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import { assets } from "~/lib/constants";

const SignIn = () => {
  const { isLoaded, signIn } = useSignIn();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const onSignInPress = async () => {
    if (!isLoaded) return;
    try {
      await signIn.create({
        identifier: form.email,
        password: form.password,
      });
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (err: any) {
      //TODO: See https://clerk.com/docs/custom-flows/error-handling
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // for more info on error handling
      console.log(JSON.stringify(err, null, 2));
      Alert.alert("Error", err.errors[0].longMessage);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View className="flex-1 items-center justify-center ">
            <View className="flex justify-between items-center w-full mb-14">
              <Image
                source={assets.logo}
                style={{ width: 100, height: 100, resizeMode: "contain" }}
              />
              <Text className="text-3xl font-bold">Welcome Back Boss! 👋</Text>
            </View>
            <View className="p-5 flex flex-col gap-2 w-full">
              <Input
                placeholder="Email"
                textContentType="emailAddress"
                value={form.email}
                onChangeText={(value) => setForm({ ...form, email: value })}
              />
              <Input
                placeholder="Password"
                secureTextEntry={true}
                textContentType={"password"}
                value={form.password}
                onChangeText={(value) => setForm({ ...form, password: value })}
              />
              <Button onPress={onSignInPress}>
                <Text>Sign In</Text>
              </Button>
              <View className="flex flex-row justify-center items-center  gap-x-3">
                <View className="flex-1 h-[1px] bg-muted-foreground/60" />
                <Text className="text-lg">Or</Text>
                <View className="flex-1 h-[1px] bg-muted-foreground/60" />
              </View>
              <OAuth />
            </View>
            <View className="p-5 flex f gap-2 justify-center w-full">
              <Link
                href="/(auth)/sign-up"
                className="text-lg text-center mt-10"
              >
                <Text>Don't have an account? </Text>
                <Text className="ml-2 text-primary">Sign Up</Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};
export default SignIn;
