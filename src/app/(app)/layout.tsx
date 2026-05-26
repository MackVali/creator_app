import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import AppMain from "@/components/AppMain";
import { ProfileProvider } from "@/components/ProfileProvider";
import LevelUpListener from "@/components/LevelUpListener";
import { ToastProvider } from "@/components/ui/toast";
import ProfileSetupPrompt from "@/components/ProfileSetupPrompt";
import { TourProvider } from "@/components/tour/TourProvider";
import { AppCartProvider } from "@/components/cart/AppCartProvider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppCartProvider>
      <TourProvider>
        <ToastProvider>
          <ProfileProvider>
            <LevelUpListener />
            <ProfileSetupPrompt />
            <TopNav />
            <AppMain>{children}</AppMain>
            <BottomNav />
          </ProfileProvider>
        </ToastProvider>
      </TourProvider>
    </AppCartProvider>
  );
}
