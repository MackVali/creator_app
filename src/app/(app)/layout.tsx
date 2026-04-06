import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
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
            <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))]">
              {children}
            </main>
            <BottomNav />
          </ProfileProvider>
        </ToastProvider>
      </TourProvider>
    </AppCartProvider>
  );
}
