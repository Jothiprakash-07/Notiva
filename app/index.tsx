import { router } from "expo-router";
import { useEffect, useState } from "react";

import { useAuth } from "../contexts/AuthContext";

import SplashScreen from "./screens/Splash/SplashScreen";
import OnboardingScreen from "./screens/Onboarding/OnboardingScreen";
import LoginScreen from "./screens/login/LoginScreen";
import UserRegisterScreen from "./screens/login/UserRegisterScreen";
import OrganizationRegisterScreen from "./screens/login/OrganizationRegisterScreen";

type AuthScreen =
  | "splash"
  | "onboarding"
  | "login"
  | "userRegister"
  | "organizationRegister";

export default function Index() {
  const { session, isLoading } = useAuth();

  const [screen, setScreen] =
    useState<AuthScreen>("splash");

  const [splashFinished, setSplashFinished] =
    useState(false);

  useEffect(() => {
    if (!splashFinished) {
      return;
    }

    if (isLoading) {
      return;
    }

    if (session) {
      router.replace("/(tabs)");
      return;
    }

    setScreen("login");
  }, [
    splashFinished,
    isLoading,
    session,
  ]);

  if (screen === "splash") {
    return (
      <SplashScreen
        onFinish={() => {
          setSplashFinished(true);
        }}
      />
    );
  }

  if (screen === "onboarding") {
    return (
      <OnboardingScreen
        onFinish={() => {
          setScreen("login");
        }}
      />
    );
  }

  if (screen === "login") {
    return (
      <LoginScreen
        onUserRegister={() => {
          setScreen("userRegister");
        }}
        onOrganizationRegister={() => {
          setScreen(
            "organizationRegister"
          );
        }}
      />
    );
  }

  if (screen === "userRegister") {
    return (
      <UserRegisterScreen
        onBack={() => {
          setScreen("login");
        }}
      />
    );
  }

  return (
    <OrganizationRegisterScreen
      onBack={() => {
        setScreen("login");
      }}
    />
  );
}
