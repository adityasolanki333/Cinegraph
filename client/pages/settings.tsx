import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Settings as SettingsIcon, Bell, Globe, Shield, Palette } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UserSettings {
  notifications: boolean;
  autoplay: boolean;
  language: string;
  theme: string;
  dataSharing: boolean;
}

const defaultSettings: UserSettings = {
  notifications: true,
  autoplay: false,
  language: "en",
  theme: "system",
  dataSharing: true,
};

export default function Settings() {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState(defaultSettings.notifications);
  const [autoplay, setAutoplay] = useState(defaultSettings.autoplay);
  const [language, setLanguage] = useState(defaultSettings.language);
  const [theme, setTheme] = useState(defaultSettings.theme);
  const [dataSharing, setDataSharing] = useState(defaultSettings.dataSharing);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem("userSettings");
    if (savedSettings) {
      try {
        const parsed: UserSettings = JSON.parse(savedSettings);
        setNotifications(parsed.notifications ?? defaultSettings.notifications);
        setAutoplay(parsed.autoplay ?? defaultSettings.autoplay);
        setLanguage(parsed.language ?? defaultSettings.language);
        setTheme(parsed.theme ?? defaultSettings.theme);
        setDataSharing(parsed.dataSharing ?? defaultSettings.dataSharing);
      } catch (error) {
        console.error("Failed to parse saved settings:", error);
      }
    }
  }, []);

  // Apply theme immediately when it changes
  useEffect(() => {
    const root = document.documentElement;
    
    // Remove all theme classes
    root.classList.remove("dark", "system");
    
    // Apply the selected theme class
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "system") {
      root.classList.add("system");
    }
    // light theme has no class (uses default :root styles)
  }, [theme]);

  // Auto-save settings to localStorage whenever they change
  useEffect(() => {
    const settings: UserSettings = {
      notifications,
      autoplay,
      language,
      theme,
      dataSharing,
    };

    localStorage.setItem("userSettings", JSON.stringify(settings));
  }, [notifications, autoplay, language, theme, dataSharing]);

  const handleSaveSettings = () => {
    const settings: UserSettings = {
      notifications,
      autoplay,
      language,
      theme,
      dataSharing,
    };

    localStorage.setItem("userSettings", JSON.stringify(settings));

    toast({
      title: "Settings saved",
      description: "Your preferences have been saved successfully.",
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center space-x-3 mb-8">
        <SettingsIcon className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold text-foreground" data-testid="title-settings">Settings</h1>
      </div>

      <div className="space-y-6">
        {/* Notifications Settings */}
        <Card data-testid="card-notifications">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Notifications</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-notifications" data-testid="label-email-notifications">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive email updates about new movies and recommendations
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={notifications}
                onCheckedChange={setNotifications}
                data-testid="switch-email-notifications"
              />
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="autoplay" data-testid="label-autoplay">Autoplay Trailers</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically play movie trailers when browsing
                </p>
              </div>
              <Switch
                id="autoplay"
                checked={autoplay}
                onCheckedChange={setAutoplay}
                data-testid="switch-autoplay"
              />
            </div>
          </CardContent>
        </Card>

        {/* Display & Language Settings */}
        <Card data-testid="card-display">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Palette className="h-5 w-5" />
              <span>Display & Language</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="theme" data-testid="label-theme">Theme</Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger id="theme" data-testid="select-theme">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language" data-testid="label-language">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id="language" data-testid="select-language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="ja">日本語</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Privacy Settings */}
        <Card data-testid="card-privacy">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Shield className="h-5 w-5" />
              <span>Privacy & Data</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="data-sharing" data-testid="label-data-sharing">Data Sharing</Label>
                <p className="text-sm text-muted-foreground">
                  Share viewing data to improve recommendations
                </p>
              </div>
              <Switch
                id="data-sharing"
                checked={dataSharing}
                onCheckedChange={setDataSharing}
                data-testid="switch-data-sharing"
              />
            </div>
            
            <Separator />
            
            <div className="space-y-2">
              <Button variant="outline" className="w-full" data-testid="button-download-data">
                <Globe className="h-4 w-4 mr-2" />
                Download My Data
              </Button>
              <Button variant="outline" className="w-full" data-testid="button-delete-account">
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button className="min-w-32" data-testid="button-save-settings" onClick={handleSaveSettings}>
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}