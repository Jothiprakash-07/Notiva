const { withAndroidStyles, AndroidConfig } = require("expo/config-plugins");

module.exports = function withNeutralPickers(config) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults.resources.style || [];

    // Remove stale / unsupported attributes from previous attempts.
    for (const style of styles) {
      if (
        style.$.name === "TimePickerTheme" ||
        style.$.name === "NotivaDatePicker"
      ) {
        style.item = (style.item || []).filter(
          (item) => item.$.name !== "android:headerTextColor"
        );
      }

      if (style.$.name === "TimePickerTheme") {
        style.item = (style.item || []).filter(
          (item) => item.$.name !== "android:amPmTextColor"
        );
      }

      if (style.$.name === "NotivaTimePickerDialog") {
        const oldOverrides = [
          "android:windowBackground",
          "android:textColorPrimary",
          "android:textColorSecondary",
          "android:textColorPrimaryInverse",
          "android:textColorSecondaryInverse",
        ];

        style.item = (style.item || []).filter(
          (item) => !oldOverrides.includes(item.$.name)
        );
      }

      if (style.$.name === "NotivaDatePicker") {
        style.item = (style.item || []).filter(
          (item) => item.$.name !== "android:headerBackground"
        );
      }
    }

    const setStyleValues = (name, parent, values) => {
      for (const [attribute, value] of Object.entries(values)) {
        config.modResults =
          AndroidConfig.Styles.assignStylesValue(config.modResults, {
            add: true,
            parent: {
              name,
              parent,
            },
            name: attribute,
            value,
          });
      }
    };

    // =========================
    // TIME PICKER
    // =========================

    setStyleValues(
      "TimePickerTheme",
      "android:Widget.Material.Light.TimePicker",
      {
        "android:numbersInnerTextColor": "#171329",
      }
    );

    setStyleValues(
      "NotivaTimePickerDialog",
      "Theme.AppCompat.Light.Dialog",
      {
        colorAccent: "#4D3FE6",
        "android:colorAccent": "#4D3FE6",
        "android:timePickerStyle": "@style/TimePickerTheme",
      }
    );

    config.modResults =
      AndroidConfig.Styles.assignStylesValue(config.modResults, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name: "android:timePickerDialogTheme",
        value: "@style/NotivaTimePickerDialog",
      });

    // =========================
    // DATE PICKER
    // =========================

    setStyleValues(
      "NotivaDatePicker",
      "android:Widget.Material.Light.DatePicker",
      {
        "android:headerBackground": "#4D3FE6",
      }
    );

    setStyleValues(
      "DatePickerDialogTheme",
      "Theme.AppCompat.Light.Dialog",
      {
        "android:datePickerStyle": "@style/NotivaDatePicker",
        "android:textColorPrimaryInverse": "#171329",
        "android:textColorSecondaryInverse": "#797487",
      }
    );

    config.modResults =
      AndroidConfig.Styles.assignStylesValue(config.modResults, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name: "android:datePickerDialogTheme",
        value: "@style/DatePickerDialogTheme",
      });

    return config;
  });
};