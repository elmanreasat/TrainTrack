import "react-native-gesture-handler";
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { enableScreens } from "react-native-screens";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import TemplateListScreen from "./src/screens/TemplateListScreen";
import WeekViewScreen from "./src/screens/WeekViewScreen";
import DayViewScreen from "./src/screens/DayViewScreen";
import ExerciseFormScreen from "./src/screens/ExerciseFormScreen";
import CopyWeekScreen from "./src/screens/CopyWeekScreen";
import { initDb, waitForDbReady } from "./src/db/db";
import { View, ActivityIndicator } from "react-native";

const Stack = createStackNavigator();

export default function App() {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    enableScreens(true);
  }, []);
  React.useEffect(() => {
    (async () => {
      try {
        await waitForDbReady();
        setReady(true);
      } catch (e) {
        console.warn("[App] DB init failed:", e);
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {!ready ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <NavigationContainer>
          <Stack.Navigator>
            <Stack.Screen name="Templates" component={TemplateListScreen} />
            <Stack.Screen
              name="WeekView"
              component={WeekViewScreen}
              options={{ title: "Weeks" }}
            />
            <Stack.Screen
              name="DayView"
              component={DayViewScreen}
              options={{ title: "Day" }}
            />
            <Stack.Screen
              name="CopyWeek"
              component={CopyWeekScreen}
              options={{ title: "Copy Week" }}
            />
            <Stack.Screen
              name="ExerciseForm"
              component={ExerciseFormScreen}
              options={{ title: "Add Exercise" }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      )}
    </GestureHandlerRootView>
  );
}
