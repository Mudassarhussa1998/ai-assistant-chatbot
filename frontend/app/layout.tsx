import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  weight: "400",
  style: "italic",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Assistant for your website",
  description: "Add an AI assistant to any website or system with one line of code.",
};

export const viewport: Viewport = {
  themeColor: "#f2f2ee",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body>
        {children}
        {/* The same embeddable widget other websites load with one <script> tag. */}
        <Script src="/widget.js" data-title="AI Assistant" strategy="afterInteractive" />
      </body>
    </html>
  );
}
