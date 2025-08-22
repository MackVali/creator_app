import type { AppProps } from "next/app";
import "../app/globals.css";
import TopNav from "../components/navigation/TopNav";
import BottomNav from "../components/navigation/BottomNav";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav username="MackVali" />
      <main className="flex-1 pb-24">
        <Component {...pageProps} />
      </main>
      <BottomNav />
    </div>
  );
}

