import Ionicons from "@expo/vector-icons/Ionicons";
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

type OnboardingScreenProps = {
  onFinish?: () => void;
};

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

export default function OnboardingScreen({
  onFinish,
}: OnboardingScreenProps) {
  const { width, height } =
    useWindowDimensions();

  const [currentIndex, setCurrentIndex] =
    useState(0);

  const listRef =
    useRef<FlatList>(null);

  const isSmallPhone =
    height < 700;

  const isLargePhone =
    height > 850;

  const isLastSlide =
    currentIndex ===
    onboardingData.length - 1;

  const activeColor =
    onboardingData[currentIndex]?.color ??
    "#4d3fe6";

  const handleContinue = () => {
    if (!isLastSlide) {
      listRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });

      return;
    }

    onFinish?.();
  };

  const handleSkip = () => {
    listRef.current?.scrollToIndex({
      index:
        onboardingData.length - 1,
      animated: true,
    });
  };

  const handleScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const offset =
      event.nativeEvent.contentOffset.x;

    const index = Math.round(
      offset / width
    );

    const safeIndex = Math.max(
      0,
      Math.min(
        index,
        onboardingData.length - 1
      )
    );

    setCurrentIndex(safeIndex);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#ffffff"
      />

      <View style={styles.screen}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBadge}>
            <View
              style={[
                styles.brandDot,
                {
                  backgroundColor:
                    activeColor,
                },
              ]}
            />

            <Text
              allowFontScaling={false}
              style={styles.brandText}
            >
              Notiva
            </Text>
          </View>

          {!isLastSlide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
              hitSlop={10}
              style={({ pressed }) => [
                styles.skipButton,
                pressed &&
                  styles.skipPressed,
              ]}
              onPress={handleSkip}
            >
              <Text
                allowFontScaling={false}
                style={styles.skipText}
              >
                Skip
              </Text>

              <Ionicons
                name="chevron-forward"
                size={15}
                color="#6b7280"
              />
            </Pressable>
          ) : (
            <View
              style={styles.headerSpacer}
            />
          )}
        </View>

        {/* Slides */}
        <FlatList
          ref={listRef}
          data={onboardingData}
          keyExtractor={(item) =>
            item.id.toString()
          }
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={
            false
          }
          onMomentumScrollEnd={
            handleScrollEnd
          }
          keyboardShouldPersistTaps="handled"
          getItemLayout={(
            _,
            index
          ) => ({
            length: width,
            offset:
              width * index,
            index,
          })}
          renderItem={({ item }) => (
            <View
              style={[
                styles.slide,
                {
                  width,
                },
              ]}
            >
              {/* Illustration area */}
              <View
                style={[
                  styles.imageArea,
                  {
                    height:
                      isSmallPhone
                        ? height *
                          0.32
                        : isLargePhone
                        ? height *
                          0.39
                        : height *
                          0.35,
                  },
                ]}
              >
                <View
                  style={[
                    styles.imageGlow,
                    {
                      backgroundColor:
                        `${item.color}12`,
                    },
                  ]}
                />

                <Image
                  source={item.image}
                  resizeMode="contain"
                  style={[
                    styles.image,
                    {
                      width:
                        width *
                        0.78,

                      height:
                        isSmallPhone
                          ? height *
                            0.27
                          : isLargePhone
                          ? height *
                            0.33
                          : height *
                            0.30,
                    },
                  ]}
                />
              </View>

              {/* Step */}
              <View
                style={[
                  styles.stepBadge,
                  {
                    backgroundColor:
                      `${item.color}15`,
                  },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.stepText,
                    {
                      color:
                        item.color,
                    },
                  ]}
                >
                  {String(
                    currentIndex +
                      1
                  ).padStart(
                    2,
                    "0"
                  )}{" "}
                  /{" "}
                  {String(
                    onboardingData.length
                  ).padStart(
                    2,
                    "0"
                  )}
                </Text>
              </View>

              <Text
                allowFontScaling={false}
                style={[
                  styles.title,
                  {
                    fontSize:
                      isSmallPhone
                        ? 22
                        : 26,
                  },
                ]}
              >
                {item.title}
              </Text>

              <Text
                allowFontScaling={false}
                style={[
                  styles.subtitle,
                  {
                    fontSize:
                      isSmallPhone
                        ? 12
                        : 13,

                    lineHeight:
                      isSmallPhone
                        ? 19
                        : 21,

                    width:
                      width *
                      0.82,
                  },
                ]}
              >
                {item.subtitle}
              </Text>
            </View>
          )}
        />

        {/* Footer */}
        <View style={styles.footer}>
          <View
            style={
              styles.dotsWrapper
            }
          >
            {onboardingData.map(
              (item, index) => {
                const active =
                  currentIndex ===
                  index;

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.dot,

                      active
                        ? styles.activeDot
                        : styles.inactiveDot,

                      {
                        backgroundColor:
                          active
                            ? activeColor
                            : "#dedde8",
                      },
                    ]}
                  />
                );
              }
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isLastSlide
                ? "Get started"
                : "Continue"
            }
            style={({ pressed }) => [
              styles.continueButton,

              {
                backgroundColor:
                  activeColor,

                width:
                  Math.min(
                    width - 36,
                    380
                  ),
              },

              pressed &&
                styles.continuePressed,
            ]}
            onPress={handleContinue}
          >
            <Text
              allowFontScaling={false}
              style={
                styles.continueText
              }
            >
              {isLastSlide
                ? "Get Started"
                : "Continue"}
            </Text>

            <View
              style={
                styles.buttonIcon
              }
            >
              <Ionicons
                name="arrow-forward"
                size={19}
                color="#ffffff"
              />
            </View>
          </Pressable>

          <Text
            allowFontScaling={false}
            style={styles.footerHint}
          >
            Swipe to explore
          </Text>
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
    minHeight: 62,

    paddingHorizontal: 18,

    flexDirection: "row",
    justifyContent:
      "space-between",
    alignItems: "center",
  },

  brandBadge: {
    flexDirection: "row",
    alignItems: "center",

    gap: 7,
  },

  brandDot: {
    width: 9,
    height: 9,

    borderRadius: 5,
  },

  brandText: {
    color: "#171329",

    fontSize: 14,

    fontWeight: "900",
  },

  skipButton: {
    minHeight: 36,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 2,

    paddingHorizontal: 10,

    borderRadius: 10,

    backgroundColor: "#f7f7fa",
  },

  skipPressed: {
    opacity: 0.7,
  },

  skipText: {
    color: "#6b7280",

    fontSize: 12,

    fontWeight: "800",
  },

  headerSpacer: {
    width: 60,
    height: 36,
  },

  slide: {
    flex: 1,

    alignItems: "center",

    paddingHorizontal: 22,
    paddingTop: 4,
  },

  imageArea: {
    width: "100%",

    alignItems: "center",
    justifyContent: "center",

    position: "relative",
  },

  imageGlow: {
    position: "absolute",

    width: 230,
    height: 230,

    borderRadius: 115,
  },

  image: {
    maxWidth: 360,
  },

  stepBadge: {
    minHeight: 28,

    borderRadius: 14,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: 11,

    marginTop: 6,
    marginBottom: 14,
  },

  stepText: {
    fontSize: 10,

    fontWeight: "900",

    letterSpacing: 0.5,
  },

  title: {
    color: "#171329",

    fontWeight: "900",

    textAlign: "center",

    lineHeight: 32,

    marginBottom: 10,

    maxWidth: 330,
  },

  subtitle: {
    color: "#7c818d",

    textAlign: "center",

    fontWeight: "600",

    maxWidth: 340,
  },

  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 20,

    alignItems: "center",
  },

  dotsWrapper: {
    minHeight: 20,

    flexDirection: "row",
    alignItems: "center",

    gap: 6,

    marginBottom: 20,
  },

  dot: {
    height: 8,

    borderRadius: 4,
  },

  activeDot: {
    width: 28,
  },

  inactiveDot: {
    width: 8,
  },

  continueButton: {
    minHeight: 54,

    borderRadius: 15,

    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",

    paddingHorizontal: 18,

    shadowColor: "#171329",
    shadowOpacity: 0.12,
    shadowRadius: 8,

    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  continuePressed: {
    opacity: 0.86,

    transform: [
      {
        scale: 0.99,
      },
    ],
  },

  continueText: {
    color: "#ffffff",

    fontSize: 14,

    fontWeight: "900",
  },

  buttonIcon: {
    position: "absolute",
    right: 18,

    width: 30,
    height: 30,

    borderRadius: 10,

    backgroundColor:
      "rgba(255,255,255,0.15)",

    alignItems: "center",
    justifyContent: "center",
  },

  footerHint: {
    color: "#b0b3bd",

    fontSize: 9,

    fontWeight: "600",

    marginTop: 10,
  },
});