export default function AriXLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <polygon points="30,80 46,20 70,20 54,80" fill="#34d399" />
      <path d="M62 40 L84 62" stroke="#4f7ddc" strokeWidth={10} strokeLinecap="round" />
      <path d="M84 40 L62 62" stroke="#4f7ddc" strokeWidth={10} strokeLinecap="round" />
    </svg>
  );
}
