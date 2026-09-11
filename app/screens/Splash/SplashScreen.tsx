import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const logo = require("../../../assets/images/notiva-logo.png");

type SplashScreenProps = {
  onFinish?: () => void;
};

export default function SplashScreen({
  onFinish,
}: SplashScreenProps) {
  const fadeAnim = useRef(
    new Animated.Value(0)
  ).current;

  const scaleAnim = useRef(
    new Animated.Value(0.86)
  ).current;

  const subtitleAnim = useRef(
    new Animated.Value(0)
  ).current;

  const finishedRef = useRef(false);

  useEffect(() => {
    let timer:
      | ReturnType<typeof setTimeout>
      | undefined;

    finishedRef.current = false;

    Animated.parallel([
      Animated.timing(
        fadeAnim,
        {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }
      ),

      Animated.spring(
        scaleAnim,
        {
          toValue: 1,
          friction: 6,
          tension: 55,
          useNativeDriver: true,
        }
      ),
    ]).start();

    Animated.timing(
      subtitleAnim,
      {
        toValue: 1,
        duration: 650,
        delay: 500,
        useNativeDriver: true,
      }
    ).start();

    timer = setTimeout(() => {
      if (
        !finishedRef.current
      ) {
        finishedRef.current =
          true;

        onFinish?.();
      }
    }, 2000);

    return () => {
      finishedRef.current =
        true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    fadeAnim,
    scaleAnim,
    subtitleAnim,
    onFinish,
  ]);

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "bottom",
        "left",
        "right",
      ]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#4d3fe6"
      />

      <View style={styles.screen}>
        {/* Decorative shapes */}
        <View
          style={
            styles.circleTopLeft
          }
        />

        <View
          style={
            styles.circleTopRight
          }
        />

        <View
          style={
            styles.circleBottomLeft
          }
        />

        <View
          style={
            styles.smallCircle
          }
        />

        {/* Main branding */}
        <Animated.View
          style={[
            styles.logoWrap,
            {
              opacity:
                fadeAnim,

              transform: [
                {
                  scale:
                    scaleAnim,
                },
              ],
            },
          ]}
        >
          <View
            style={
              styles.logoContainer
            }
          >
            <Image
              source={logo}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <Text
            allowFontScaling={
              false
            }
            style={styles.title}
          >
            Notiva
          </Text>

          <Animated.Text
            allowFontScaling={
              false
            }
            style={[
              styles.subtitle,
              {
                opacity:
                  subtitleAnim,

                transform: [
                  {
                    translateY:
                      subtitleAnim.interpolate(
                        {
                          inputRange:
                            [0, 1],

                          outputRange:
                            [8, 0],
                        }
                      ),
                  },
                ],
              },
            ]}
          >
            Smart reminders, smarter life
          </Animated.Text>
        </Animated.View>

        {/* Bottom branding */}
        <Animated.View
          style={[
            styles.bottomTextWrap,
            {
              opacity:
                subtitleAnim,
            },
          ]}
        >
          <Text
            allowFontScaling={
              false
            }
            style={
              styles.bottomText
            }
          >
            Plan • Remember • Achieve
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#4d3fe6",
    },

    screen: {
      flex: 1,

      backgroundColor:
        "#4d3fe6",

      justifyContent:
        "center",

      alignItems:
        "center",

      overflow:
        "hidden",
    },

    circleTopLeft: {
      position:
        "absolute",

      top: -46,
      left: -52,

      width: 120,
      height: 120,

      borderRadius: 60,

      backgroundColor:
        "rgba(255,255,255,0.08)",

      borderWidth: 10,

      borderColor:
        "rgba(255,255,255,0.045)",
    },

    circleTopRight: {
      position:
        "absolute",

      top: -130,
      right: -110,

      width: 280,
      height: 280,

      borderRadius: 140,

      backgroundColor:
        "rgba(255,255,255,0.06)",
    },

    circleBottomLeft: {
      position:
        "absolute",

      bottom: -135,
      left: -95,

      width: 270,
      height: 270,

      borderRadius: 135,

      backgroundColor:
        "rgba(255,255,255,0.07)",
    },

    smallCircle: {
      position:
        "absolute",

      bottom: 140,
      right: 34,

      width: 42,
      height: 42,

      borderRadius: 21,

      backgroundColor:
        "rgba(255,255,255,0.055)",
    },

    logoWrap: {
      alignItems:
        "center",

      paddingHorizontal:
        24,
    },

    logoContainer: {
      width: 110,
      height: 110,

      borderRadius: 32,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "rgba(255,255,255,0.10)",

      borderWidth: 1,

      borderColor:
        "rgba(255,255,255,0.16)",

      marginBottom: 18,
    },

    logo: {
      width: 86,
      height: 86,
    },

    title: {
      color: "#ffffff",

      fontSize: 40,
      lineHeight: 48,

      fontWeight: "900",

      letterSpacing: 0.4,

      textAlign: "center",
    },

    subtitle: {
      color: "#e4e1ff",

      fontSize: 14,
      lineHeight: 21,

      fontWeight: "600",

      marginTop: 5,

      textAlign: "center",
    },

    bottomTextWrap: {
      position:
        "absolute",

      bottom: 34,

      left: 20,
      right: 20,

      alignItems:
        "center",
    },

    bottomText: {
      color:
        "rgba(255,255,255,0.65)",

      fontSize: 10,

      fontWeight: "700",

      letterSpacing: 0.8,

      textAlign: "center",
    },
  });