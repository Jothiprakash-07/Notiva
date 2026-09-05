import { useRef, useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Parent screen-lendu function receive panna type create panrom.
// Get Started click panna Login screen ku poganum, athukku onFinish use panrom.
type OnboardingScreenProps = {
  onFinish?: () => void;
};

// Onboarding screen data.
// Live project la image, title, subtitle, color change panna inga mattum edit panna pothum.
const onboardingData = [
  {
    id: 1,
    image: require("../../../assets/images/onboarding1.png"),
    title: "Never miss what matters",
    subtitle:
      "Smart reminders that alert you at the right time, so you never forget important work.",
    color: "#4d3fe6",
  },
  {
    id: 2,
    image: require("../../../assets/images/onboarding2.png"),
    title: "Plan your day easily",
    subtitle:
      "Organize your tasks, reminders, and daily plans in one simple mobile app.",
    color: "#ff6b6b",
  },
  {
    id: 3,
    image: require("../../../assets/images/onboarding3.png"),
    title: "Get smart alerts",
    subtitle:
      "Receive clean and useful notifications to stay focused every day.",
    color: "#20bfa9",
  },
  {
    id: 4,
    image: require("../../../assets/images/onboarding4.png"),
    title: "Stay ahead always",
    subtitle:
      "Build better habits and manage reminders with a simple experience.",
    color: "#f59e0b",
  },
];

export default function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  // Mobile width and height get panna use panrom.
  // Ella mobile screen-ku responsive layout set panna useful.
  const { width, height } = useWindowDimensions();

  // Current onboarding slide index store panna use panrom.
  const [currentIndex, setCurrentIndex] = useState(0);

  // Continue / Skip click pannumbothu FlatList slide move panna ref use panrom.
  const listRef = useRef<FlatList | null>(null);

  // Small mobile and large mobile detect panna use panrom.
  const isSmallPhone = height < 700;
  const isLargePhone = height > 850;

  // Current slide color button and dot-ku use panrom.
  const activeColor = onboardingData[currentIndex].color;

  // Continue button click panna next slide pogum.
  // Last slide-la Get Started click panna Login screen show aagum.
  const handleContinue = () => {
    if (currentIndex < onboardingData.length - 1) {
      listRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      onFinish?.();
    }
  };

  // Skip click panna direct last onboarding slide pogum.
  const handleSkip = () => {
    listRef.current?.scrollToIndex({
      index: onboardingData.length - 1,
      animated: true,
    });
  };

  // User swipe pannumbothu current index update panna use panrom.
  const handleScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      <View style={styles.screen}>
        {/* Top skip area */}
        <View style={styles.header}>
          <View />

          <Pressable onPress={handleSkip}>
            <Text allowFontScaling={false} style={styles.skipText}>
              Skip
            </Text>
          </Pressable>
        </View>

        {/* Onboarding horizontal slider */}
        <FlatList
          ref={listRef}
          data={onboardingData}
          keyExtractor={(item) => item.id.toString()}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          bounces={false}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              <Image
                source={item.image}
                resizeMode="contain"
                style={[
                  styles.image,
                  {
                    width: width * 0.78,
                    height: isSmallPhone
                      ? height * 0.28
                      : isLargePhone
                        ? height * 0.36
                        : height * 0.32,
                  },
                ]}
              />

              <Text
                allowFontScaling={false}
                style={[
                  styles.title,
                  { fontSize: isSmallPhone ? 21 : 24 },
                ]}
              >
                {item.title}
              </Text>

              <Text
                allowFontScaling={false}
                style={[
                  styles.subtitle,
                  {
                    fontSize: isSmallPhone ? 13 : 14,
                    lineHeight: isSmallPhone ? 20 : 22,
                    width: width * 0.78,
                  },
                ]}
              >
                {item.subtitle}
              </Text>
            </View>
          )}
        />

        {/* Bottom dots and button */}
        <View style={styles.footer}>
          <View style={styles.dotsWrapper}>
            {onboardingData.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.dot,
                  {
                    width: currentIndex === index ? 32 : 9,
                    backgroundColor:
                      currentIndex === index ? activeColor : "#d8d3ff",
                  },
                ]}
              />
            ))}
          </View>

          <Pressable
            style={[
              styles.continueButton,
              {
                backgroundColor: activeColor,
                width: width * 0.72,
              },
            ]}
            onPress={handleContinue}
          >
            <Text allowFontScaling={false} style={styles.continueText}>
              {currentIndex === onboardingData.length - 1
                ? "Get Started"
                : "Continue"}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  screen: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  header: {
    height: 58,
    paddingHorizontal: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  skipText: {
    color: "#777777",
    fontSize: 13,
    fontWeight: "600",
  },

  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  image: {
    marginBottom: 36,
  },

  title: {
    color: "#111111",
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
  },

  subtitle: {
    color: "#555555",
    textAlign: "center",
    fontWeight: "400",
  },

  footer: {
    paddingBottom: 34,
    alignItems: "center",
  },

  dotsWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 30,
  },

  dot: {
    height: 9,
    borderRadius: 20,
  },

  continueButton: {
    height: 50,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },

  continueText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});