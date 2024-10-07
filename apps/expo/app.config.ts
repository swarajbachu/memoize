import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Memoize",
  slug: "memoize",
  scheme: "expo",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/logo.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/logo.png",
    resizeMode: "contain",
    backgroundColor: "#F8FAFC",
  },
  updates: {
    fallbackToCacheTimeout: 0,
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: "your.bundle.identifier",
    supportsTablet: true,
  },
  android: {
    package: "your.bundle.identifier",
    adaptiveIcon: {
      foregroundImage: "./assets/logo.png",
      backgroundColor: "#F8FAFC",
    },
  },
  // extra: {
  //   eas: {
  //     projectId: "your-eas-project-id",
  //   },
  // },
  experiments: {
    tsconfigPaths: true,
    typedRoutes: true,
  },
  plugins: [
    "expo-router",
    [
      "expo-asset",
      {
        assets: ["./assets/auth-background.jpg"],
      },
    ],
  ],
});
