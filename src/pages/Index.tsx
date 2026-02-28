import { LanguageProvider } from "@/contexts/LanguageContext";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { AppShell } from "@/components/AppShell";

const Index = () => {
  return (
    <LanguageProvider>
      <NavigationProvider>
        <AppShell />
      </NavigationProvider>
    </LanguageProvider>
  );
};

export default Index;
