import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import AppMain from "@/components/AppMain";
import { ProfileProvider } from "@/components/ProfileProvider";
import LevelUpListener from "@/components/LevelUpListener";
import SchedulerActivityHeartbeat from "@/components/SchedulerActivityHeartbeat";
import { ToastProvider } from "@/components/ui/toast";
import ProfileSetupPrompt from "@/components/ProfileSetupPrompt";
import { TourProvider } from "@/components/tour/TourProvider";
import { AppCartProvider } from "@/components/cart/AppCartProvider";
import { FabCreationProvider } from "@/components/ui/FabCreationContext";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppCartProvider>
      <TourProvider>
        <ToastProvider>
          <ProfileProvider>
            <FabCreationProvider>
              <LevelUpListener />
              <SchedulerActivityHeartbeat />
              <ProfileSetupPrompt />
              <TopNav />
              <AppMain>{children}</AppMain>
              <BottomNav />
            </FabCreationProvider>
          </ProfileProvider>
        </ToastProvider>
      </TourProvider>
    </AppCartProvider>
  );
}
