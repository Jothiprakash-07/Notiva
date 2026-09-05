import { useState } from "react";

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
  const [screen, setScreen] = useState<AuthScreen>("splash");

  if (screen === "splash") {
    return <SplashScreen onFinish={() => setScreen("onboarding")} />;
  }

  if (screen === "onboarding") {
    return <OnboardingScreen onFinish={() => setScreen("login")} />;
  }

  if (screen === "login") {
    return (
      <LoginScreen
        onUserRegister={() => setScreen("userRegister")}
        onOrganizationRegister={() =>
          setScreen("organizationRegister")
        }
      />
    );
  }

  if (screen === "userRegister") {
    return <UserRegisterScreen onBack={() => setScreen("login")} />;
  }

  return (
    <OrganizationRegisterScreen onBack={() => setScreen("login")} />
  );
}
