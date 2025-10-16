import { ToastProvider } from "@/components/ui/toast";

export default function RoutesLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}


