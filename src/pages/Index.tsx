import { NavigationProvider } from "@/contexts/NavigationContext";
import { AppShell } from "@/components/AppShell";

const Index = () => {
  return (
    <NavigationProvider>
      <AppShell />
    </NavigationProvider>
  );
};

export default Index;

