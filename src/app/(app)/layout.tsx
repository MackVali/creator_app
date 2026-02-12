import TopNav from "@/components/TopNav";
import BottomNav from "@/components/BottomNav";
import { ProfileProvider } from "@/components/ProfileProvider";
import LevelUpListener from "@/components/LevelUpListener";
import { ToastProvider } from "@/components/ui/toast";
import ProfileSetupPrompt from "@/components/ProfileSetupPrompt";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
