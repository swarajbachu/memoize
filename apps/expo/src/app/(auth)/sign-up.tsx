import { useSignUp } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Link, router } from "expo-router";
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
import { ReactNativeModal } from "react-native-modal";
import InputField from "~/components/input-field";

import { Check, Lock } from "lucide-react-native";
import OAuth from "~/components/OAuth";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Text } from "~/components/ui/text";
import { assets } from "~/lib/constants";

const SignUp = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [verification, setVerification] = useState({
    state: "default",
    error: "",
    code: "",
  });

  const onSignUpPress = async () => {
    if (!isLoaded) return;
    try {
      await signUp.create({
        emailAddress: form.email,
        password: form.password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerification({
        ...verification,
        state: "pending",
      });
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (err: any) {
      //TODO: See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      console.log(JSON.stringify(err, null, 2));
      Alert.alert("Error", err.errors[0].longMessage);
    }
  };

  const onPressVerify = async () => {
    if (!isLoaded) return;
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: verification.code,
      });
      if (completeSignUp.status === "complete") {
        await setActive({ session: completeSignUp.createdSessionId });
        setVerification({
          ...verification,
          state: "success",
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.push("/(auth)/onboard");
      } else {
        setVerification({
          ...verification,
          error: "Verification failed. Please try again.",
          state: "failed",
        });
      }
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    } catch (err: any) {
      // See https://clerk.com/docs/custom-flows/error-handling
      // for more info on error handling
      setVerification({
        ...verification,
        error: err.errors[0].longMessage,
        state: "failed",
      });
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
              <Text className="text-3xl font-bold">Welcome to Memoize</Text>
            </View>
            <View className="p-5 flex flex-col gap-2 w-full">
              <Input
                placeholder="Name"
                textContentType="name"
                value={form.name}
                onChangeText={(value) => setForm({ ...form, name: value })}
              />
              <Input
                placeholder="Email"
                textContentType="emailAddress"
                value={form.email}
                onChangeText={(value) => setForm({ ...form, email: value })}
              />
              <Input
                placeholder="Password"
                secureTextEntry={!showPassword}
                textContentType={showPassword ? "none" : "password"}
                value={form.password}
                onChangeText={(value) => setForm({ ...form, password: value })}
              />
              <Button onPress={onSignUpPress}>
                <Text>Sign Up</Text>
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
                href="/(auth)/sign-in"
                className="text-lg text-center  mt-10"
              >
                Already have an account?{" "}
                <Text className="text-primary">Log In</Text>
              </Link>
            </View>
            <ReactNativeModal
              isVisible={verification.state === "pending"}
              onBackdropPress={() =>
                setVerification({ ...verification, state: "default" })
              }
              onModalHide={() => {
                if (verification.state === "success") {
                  setShowSuccessModal(true);
                }
              }}
            >
              <View className="bg-white px-7 py-9 rounded-2xl min-h-[300px]">
                <Text className="font-JakartaExtraBold text-2xl mb-2">
                  Verification
                </Text>
                <Text className="font-Jakarta mb-5">
                  We've sent a verification code to {form.email}.
                </Text>
                <InputField
                  label={"Code"}
                  icon={<Lock />}
                  placeholder={"12345"}
                  value={verification.code}
                  keyboardType="numeric"
                  onChangeText={(code) =>
                    setVerification({ ...verification, code })
                  }
                />
                {verification.error && (
                  <Text className="text-red-500 text-sm mt-1">
                    {verification.error}
                  </Text>
                )}
                <Button onPress={onPressVerify} className="mt-5">
                  <Text>Verify Email</Text>
                </Button>
              </View>
            </ReactNativeModal>
            <ReactNativeModal isVisible={showSuccessModal}>
              <View className="bg-white px-7 py-9 rounded-2xl min-h-[300px]">
                {/* <Image
                source={images.check}
                className="w-[110px] h-[110px] mx-auto my-5"
              /> */}
                <Check className="w-[110px] h-[110px] mx-auto my-5" />
                <Text className="text-3xl font-JakartaBold text-center">
                  Verified
                </Text>
                <Text className="text-base text-gray-400 font-Jakarta text-center mt-2">
                  You have successfully verified your account.
                </Text>
                <Button onPress={() => router.push("/")} className="mt-5">
                  Browse Home
                </Button>
              </View>
            </ReactNativeModal>
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};
export default SignUp;
