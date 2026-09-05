import { useEffect, useRef } from "react";
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

const logo = require("../../../assets/images/notiva-logo.png");

type SplashScreenProps = {
  onFinish?: () => void;
};

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start(() => {
      timer = setTimeout(() => {
        onFinish?.();
      }, 1000);
    });

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [onFinish]);

  return (
    <View style={styles.screen}>
      <View style={styles.circleTopLeft} />
      <View style={styles.circleTopRight} />
      <View style={styles.circleBottomLeft} />

      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image source={logo} style={styles.logo} resizeMode="contain" />

        <Text style={styles.title}>Notiva</Text>
        <Text style={styles.subtitle}>Smart reminders, smarter life</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#4d3fe6",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },

  circleTopLeft: {
    position: "absolute",
    top: -42,
    left: -48,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 10,
    borderColor: "rgba(255,255,255,0.05)",
  },

  circleTopRight: {
    position: "absolute",
    top: -120,
    right: -105,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  circleBottomLeft: {
    position: "absolute",
    bottom: -125,
    left: -90,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  logoWrap: {
    alignItems: "center",
  },

  logo: {
    width: 90,
    height: 90,
    marginBottom: 14,
  },

  title: {
    color: "#ffffff",
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 0.5,
  },

  subtitle: {
    color: "#ffffff",
    fontSize: 15,
    marginTop: 4,
    opacity: 0.9,
  },
});