export default function ChatLayout({ children }: { children: React.ReactNode }) {
  // On mobile the fixed bottom nav is 3.5rem (56px); on desktop it's hidden so revert to h-screen
  return (
    <div className="h-[calc(100dvh-3.5rem)] md:h-screen flex overflow-hidden">
      {children}
    </div>
  )
}
