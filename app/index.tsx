import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "../contexts/AuthContext";
import { getOnboardingCompleted } from "../services/onboardingStorage";

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

  const [onboardingCompleted, setCompleted] = useState<boolean | null>(null);
  const finishSplash = useCallback(() => setSplashFinished(true), []);

  useEffect(() => {
    let active = true;
    getOnboardingCompleted().then(value => { if (active) setCompleted(value); })
      .catch(() => { if (active) setCompleted(false); });
    return () => { active = false; };
  }, []);

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

    if (onboardingCompleted === null) return;
    setScreen(onboardingCompleted ? "login" : "onboarding");
  }, [
    splashFinished,
    isLoading,
    session,
    onboardingCompleted,
  ]);

  if (screen === "splash") {
    return (
      <SplashScreen
        onFinish={finishSplash}
      />
    );
  }

  if (screen === "onboarding") {
    return (
      <OnboardingScreen
        onFinish={() => {
          setCompleted(true);
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
