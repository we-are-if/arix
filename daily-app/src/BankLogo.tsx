import React, { useState } from "react";
import kapitalIcon from "./assets/banks/kapital.png";
import unibankIcon from "./assets/banks/unibank.png";
import leobankIcon from "./assets/banks/leobank.png";
import rabitabankIcon from "./assets/banks/rabitabank.png";
import m10Icon from "./assets/banks/m10.png";
import abbIcon from "./assets/banks/abb.png";
import atbIcon from "./assets/banks/atb.png";

export interface BankLogoProps {
  bank?: string;
  size?: number;
  className?: string;
  title?: string;
}

export type BankKey =
  | "kapital"
  | "abb"
  | "unibank"
  | "leobank"
  | "rabitabank"
  | "atb"
  | "m10"
  | "ziraat"
  | "total"
  | "other";

export function normalizeBankKey(raw?: string): BankKey {
  if (!raw) return "other";
  const norm = raw.trim().toLocaleLowerCase("az-AZ");
  if (norm.includes("kapital") || norm === "k") return "kapital";
  if (
    norm.includes("abb") ||
    norm.includes("beynəlxalq") ||
    norm.includes("beynelxalq") ||
    norm.includes("ibar") ||
    norm === "b"
  )
    return "abb";
  if (norm.includes("uni") || norm === "u") return "unibank";
  if (norm.includes("leo") || norm === "l") return "leobank";
  if (norm.includes("rabitə") || norm.includes("rabite") || norm === "r") return "rabitabank";
  if (norm.includes("ziraat") || norm === "z") return "ziraat";
  if (norm.includes("atb") || norm.includes("azər türk") || norm.includes("azer turk") || norm === "a")
    return "atb";
  if (norm.includes("m10") || norm.includes("pashapay") || norm.includes("paşapay") || norm === "m")
    return "m10";
  if (
    norm.includes("total") ||
    norm.includes("ümumi") ||
    norm.includes("umumi") ||
    norm.includes("cəmi") ||
    norm === "∑"
  )
    return "total";
  return "other";
}

const OFFICIAL_BANK_ICONS: Partial<Record<string, string>> = {
  kapital: kapitalIcon,
  abb: abbIcon,
  unibank: unibankIcon,
  leobank: leobankIcon,
  rabitabank: rabitabankIcon,
  atb: atbIcon,
  m10: m10Icon,
};

export const BankLogo: React.FC<BankLogoProps> = ({ bank, size = 24, className, title }) => {
  const key = normalizeBankKey(bank);
  const label = title || bank || "Bank";
  const [imgError, setImgError] = useState(false);

  if (key === "total") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label={label}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          display: "inline-block",
          verticalAlign: "middle",
          borderRadius: "6px",
          flexShrink: 0,
        }}
      >
        <defs>
          <linearGradient id="totalBankGrad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#059669" />
            <stop offset="1" stopColor="#0D9488" />
          </linearGradient>
        </defs>
        <rect width="24" height="24" rx="6" fill="url(#totalBankGrad)" />
        <rect x="5.5" y="7" width="13" height="10" rx="2" stroke="white" strokeWidth="1.6" fill="none" />
        <line x1="5.5" y1="10.5" x2="18.5" y2="10.5" stroke="white" strokeWidth="1.6" />
        <rect x="7.5" y="13" width="3" height="2" rx="0.5" fill="white" />
      </svg>
    );
  }

  const iconSrc = key !== "other" ? OFFICIAL_BANK_ICONS[key] : undefined;

  if (iconSrc && !imgError) {
    return (
      <img
        src={iconSrc}
        alt={label}
        title={label}
        width={size}
        height={size}
        onError={() => setImgError(true)}
        className={`bank-logo-img bank-logo-${key} ${className || ""}`.trim()}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          minWidth: `${size}px`,
          minHeight: `${size}px`,
          maxWidth: `${size}px`,
          maxHeight: `${size}px`,
          borderRadius: "6px",
          objectFit: "cover",
          display: "inline-block",
          verticalAlign: "middle",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
          flexShrink: 0,
          background: "transparent",
        }}
        loading="eager"
      />
    );
  }

  // Exact vector fallback
  switch (key) {
    case "kapital":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          role="img"
          aria-label={label}
          style={{ width: size, height: size, borderRadius: "6px", flexShrink: 0 }}
        >
          <defs>
            <linearGradient id="kbGradOfficial" x1="1" y1="0.5" x2="0" y2="0.5" gradientUnits="objectBoundingBox">
              <stop offset="0" stopColor="#e0262c" />
              <stop offset="0.5" stopColor="#a00024" />
              <stop offset="1" stopColor="#6f0028" />
            </linearGradient>
          </defs>
          <rect width="36" height="36" rx="8" fill="#6a062b" />
          <g transform="translate(0.24, 0.24)">
            <path d="M0 35.508h35.509v-0.006L17.759 17.75Z" fill="#6a062b" />
            <path d="M0.004 0h0v35.507L17.759 17.75Z" fill="#a2072e" />
            <path d="M35.506 0.003v0H0.004v0.006L17.759 17.761Z" fill="url(#kbGradOfficial)" />
          </g>
        </svg>
      );

    case "abb":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          role="img"
          aria-label={label}
          style={{ width: size, height: size, borderRadius: "6px", flexShrink: 0 }}
        >
          <rect width="40" height="40" rx="9" fill="#0057B8" />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M17.9119 0.618454C14.2789 3.10236 12.1002 6.95464 11.1249 11.072L13.9437 13.8774C14.6656 8.96729 17.3869 4.87167 19.9234 3.42217C20.2041 3.5699 21.0144 4.11148 21.655 4.79706C21.7693 4.74672 21.8838 4.69596 21.9986 4.64506L21.9986 4.64505L21.9986 4.64505L21.9986 4.64504L21.9986 4.64503L21.9986 4.64502L21.9987 4.64501C22.9579 4.21958 23.9395 3.78423 25.079 3.50292C23.8587 2.06813 23.1053 1.46608 22.0176 0.678361C20.802 -0.202197 19.1512 -0.228987 17.9119 0.618454ZM4.85245 7.66031C4.04844 11.9736 5.24502 16.2305 7.4806 19.8285H11.4669C8.48894 15.8484 7.50321 11.0375 8.26704 8.22739C8.57043 8.13436 9.52812 7.9472 10.4682 7.98106C10.5129 7.86603 10.5573 7.75066 10.6019 7.63496L10.6019 7.63494C10.9783 6.65798 11.3633 5.65831 11.9698 4.65641C10.0876 4.50069 9.12714 4.60506 7.7982 4.81343C6.31299 5.04636 5.12688 6.18906 4.85245 7.66031ZM19.9233 7.44477C23.5385 5.21983 27.816 4.02895 32.1498 4.82914C33.6281 5.10225 34.7764 6.28272 35.0105 7.76087C35.2197 9.08347 35.3247 10.0394 35.1683 11.9127C34.1608 11.3086 33.1558 10.9252 32.1735 10.5505C32.0579 10.5064 31.9425 10.4624 31.8276 10.4182C31.8617 9.48254 31.6737 8.52941 31.58 8.22746C28.7565 7.46728 23.9227 8.4483 19.9233 11.412V7.44477ZM39.2257 17.8266C36.73 14.2108 32.8593 12.0426 28.7222 11.0719L25.9033 13.8773C30.837 14.5958 34.9522 17.3041 36.4086 19.8285C36.2602 20.108 35.7161 20.9141 35.0272 21.5519C35.0777 21.6656 35.1287 21.7793 35.1797 21.8934L35.1806 21.8954C35.6079 22.8496 36.045 23.8259 36.3275 24.9595C37.7691 23.7451 38.3741 22.9953 39.1655 21.9128C40.0504 20.703 40.0773 19.06 39.2257 17.8266ZM32.3666 19.8283C34.6022 23.4262 35.7988 27.6832 34.9946 31.9965C34.7203 33.4678 33.5342 34.6107 32.049 34.8436C30.7201 35.0518 29.7595 35.1561 27.8773 35.0004C28.4836 33.9989 28.8687 32.9995 29.245 32.0228L29.245 32.0227L29.2452 32.0222L29.2454 32.0217C29.2899 31.9061 29.3343 31.7908 29.379 31.6758C30.3191 31.7098 31.2766 31.5227 31.5802 31.4295C32.344 28.6194 31.3583 23.8084 28.3802 19.8283H32.3666ZM21.9349 39.039C25.5681 36.5551 27.7466 32.7027 28.722 28.5854L25.9032 25.7799C25.1813 30.6901 22.46 34.7855 19.9235 36.2351C19.6427 36.0873 18.8326 35.5457 18.1919 34.8603C18.078 34.9105 17.9639 34.9611 17.8496 35.0118C16.8899 35.4374 15.908 35.8728 14.7679 36.1544C15.9883 37.5893 16.7416 38.1913 17.8292 38.9791C19.0449 39.8596 20.6957 39.8862 21.9349 39.039ZM19.9234 32.2124C16.3083 34.4374 12.0308 35.6283 7.69701 34.8279C6.21872 34.5549 5.07037 33.3743 4.83651 31.8962C4.62714 30.5738 4.52227 29.6179 4.67855 27.7444C5.68453 28.3476 6.68813 28.7306 7.66895 29.105L7.66897 29.105L7.669 29.105C7.7861 29.1497 7.90288 29.1942 8.0193 29.239C7.98509 30.1747 8.17333 31.1276 8.26679 31.4296C11.0903 32.1899 15.9243 31.2087 19.9234 28.245V32.2124ZM0.621413 21.8306C3.1172 25.4466 6.98792 27.6146 11.125 28.5854L13.9438 25.7802C9.0102 25.0615 4.89497 22.3532 3.43855 19.8287C3.58698 19.5493 4.13115 18.7429 4.82001 18.1054C4.7695 17.9917 4.71856 17.8779 4.66748 17.7639C4.23993 16.8091 3.80239 15.832 3.51968 14.6978C2.07802 15.9123 1.4731 16.6622 0.681607 17.7444C-0.203164 18.9545 -0.230083 20.5973 0.621413 21.8306Z"
            fill="white"
          />
        </svg>
      );

    case "m10":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          role="img"
          aria-label={label}
          style={{ width: size, height: size, borderRadius: "6px", flexShrink: 0 }}
        >
          <path
            d="M32 16C32 27.027 27.027 32 16 32C4.97297 32 0 27.027 0 16C0 4.97297 4.97297 0 16 0C27.027 0 32 4.97297 32 16Z"
            fill="#03EDC3"
          />
          <path
            d="M11.5401 15.3223C12.8203 15.3223 13.6813 16.1549 13.6813 17.696V21.1655H12.1748V18.0037C12.1748 17.1819 11.824 16.7716 11.1558 16.7716C10.3068 16.7716 9.91041 17.3762 9.91041 18.4382V21.1655H8.41464V18.0037C8.41464 17.1819 8.05174 16.7716 7.38353 16.7716C6.54526 16.7716 6.16094 17.3762 6.16094 18.4382V21.1655H4.6665V15.4586H6.11675V16.3371C6.45688 15.7325 7.01126 15.3209 7.88301 15.3209C8.68647 15.3209 9.31049 15.6637 9.63857 16.383C10.0001 15.7339 10.6563 15.3223 11.5401 15.3223ZM19.1475 17.1711C19.1475 14.7852 20.812 13.1766 22.9304 13.1766C25.0489 13.1766 26.7134 14.7865 26.7134 17.1711C26.7134 19.5556 25.0489 21.1655 22.9304 21.1655C20.812 21.1655 19.1475 19.557 19.1475 17.1711ZM25.1279 17.1711C25.1279 15.6988 24.1986 14.7744 22.9304 14.7744C21.6503 14.7744 20.733 15.6988 20.733 17.1711C20.733 18.6434 21.6503 19.5677 22.9304 19.5677C24.1999 19.5677 25.1279 18.6434 25.1279 17.1711ZM12.0422 12.8865C12.0021 13.3264 12.3235 13.715 12.76 13.7542L14.0509 13.8729C14.4874 13.9134 14.8731 13.5895 14.9119 13.1496C14.9521 12.7097 14.6307 12.321 14.1942 12.2819L12.9033 12.1631C12.4681 12.124 12.0824 12.4479 12.0422 12.8865ZM13.9304 8.80563C13.5702 9.05663 13.4818 9.55459 13.7308 9.9176L14.7298 11.3683C14.9789 11.7313 15.473 11.8204 15.8332 11.5694C16.1934 11.3184 16.2818 10.8204 16.0327 10.4574L15.0338 9.0067C14.7847 8.64369 14.2906 8.55463 13.9304 8.80563ZM18.5328 8.02833C18.1097 7.91227 17.6745 8.16328 17.5593 8.58971L17.1 10.2901C16.9849 10.7151 17.2339 11.1551 17.6571 11.2711C18.0802 11.3872 18.5154 11.1362 18.6306 10.7097L19.0899 9.0094C19.2037 8.58296 18.9547 8.14438 18.5328 8.02833ZM21.6596 11.2941C21.4762 10.8933 21.0048 10.7192 20.6071 10.9041L19.4314 11.4506C19.0337 11.6355 18.8609 12.1105 19.0444 12.5113C19.2278 12.9121 19.6992 13.0862 20.0969 12.9013L21.2726 12.3548C21.6703 12.1685 21.8431 11.6935 21.6596 11.2941ZM17.2018 13.1766C16.9795 13.1766 16.7652 13.2549 16.5952 13.3993L14.2196 15.4086C13.8848 15.692 13.8407 16.1967 14.1219 16.5341C14.4031 16.8715 14.9039 16.916 15.2387 16.6326L16.559 15.5166V21.1669H18.1445V14.128C18.1445 13.6017 17.7227 13.1766 17.2018 13.1766Z"
            fill="#02205F"
          />
        </svg>
      );

    case "rabitabank":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          role="img"
          aria-label={label}
          style={{ width: size, height: size, borderRadius: "6px", flexShrink: 0 }}
        >
          <rect width="36" height="36" rx="8" fill="#00965E" />
          <g transform="translate(1.5, 0)">
            <path
              d="M20.768 24c4.422 0 8.278-2.414 10.344-6l-.002-.003a11.984 11.984 0 00-1.334-1.875l-.013-.015a11.813 11.813 0 00-1.074-1.087l-.007-.006a12.018 12.018 0 00-.61-.507 11.935 11.935 0 00-1.86-1.187c-.039-.02-.08-.043-.119-.062a11.58 11.58 0 00-1.33-.568 10.734 10.734 0 00-.696-.224l-.18-.052c-.228-.062-.46-.12-.692-.166-.004-.002-.006-.002-.01-.002a9.876 9.876 0 00-.715-.123c-.067-.01-.136-.017-.203-.026a13.262 13.262 0 00-.545-.056c-.071-.006-.144-.013-.215-.017-.244-.015-.49-.024-.739-.024h-8.82C5.348 12 0 17.373 0 24h20.768z"
              fill="white"
            />
            <path
              d="M31.842 19.498c-2.471 3.672-6.634 5.92-11.074 5.92H.086C.786 31.378 5.827 36 11.947 36h20.766V23.999c0-1.591-.31-3.11-.871-4.501zM11.947 10.58h8.82c4.441 0 8.602 2.248 11.073 5.92.56-1.39.872-2.908.872-4.5 0-6.627-5.348-12-11.946-12H0v18.005c2.197-4.398 6.725-7.425 11.947-7.425z"
              fill="white"
            />
          </g>
        </svg>
      );

    case "leobank":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          role="img"
          aria-label={label}
          style={{ width: size, height: size, borderRadius: "6px", flexShrink: 0 }}
        >
          <rect width="20" height="20" rx="5" fill="#121214" stroke="#27272A" strokeWidth="0.5" />
          <g transform="translate(1, 1) scale(0.9)">
            <path
              d="M10.1295 17.9923C7.54447 20.0862 5.82902 18.646 3.65995 16.1505C1.49089 13.6551 -0.310404 11.0495 2.27459 8.95554C4.85957 6.86164 8.7135 7.18713 10.8826 9.68255C13.0516 12.178 12.7144 15.8984 10.1295 17.9923Z"
              fill="#C084FC"
            />
            <path
              d="M7.79904 4.32804C7.09603 5.50351 5.73644 6.01628 4.76232 5.47336C3.78819 4.93043 3.56841 3.53741 4.27143 2.36194C4.97444 1.18648 6.33403 0.6737 7.30815 1.21662C8.28228 1.75955 8.50206 3.15258 7.79904 4.32804Z"
              fill="#C084FC"
            />
            <path
              d="M13.9884 5.84573C13.0846 6.88549 11.6535 7.16256 10.7918 6.46459C9.93015 5.76663 9.96429 4.35792 10.8681 3.31816C11.7718 2.2784 13.203 2.00132 14.0647 2.69929C14.9263 3.39726 14.8922 4.80597 13.9884 5.84573Z"
              fill="#C084FC"
            />
            <path
              d="M17.3745 10.8006C16.1569 11.4793 14.7138 11.2671 14.1514 10.3268C13.589 9.38639 14.1202 8.07391 15.3378 7.39525C16.5555 6.7166 17.9985 6.92876 18.5609 7.86913C19.1233 8.8095 18.5922 10.122 17.3745 10.8006Z"
              fill="#C084FC"
            />
            <path
              d="M17.2043 17.2417C15.883 17.7059 14.5001 17.255 14.1154 16.2347C13.7307 15.2143 14.4899 14.0108 15.8111 13.5466C17.1323 13.0824 18.5153 13.5332 18.9 14.5536C19.2847 15.5739 18.5255 16.7774 17.2043 17.2417Z"
              fill="#C084FC"
            />
          </g>
        </svg>
      );

    case "unibank":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          role="img"
          aria-label={label}
          style={{ width: size, height: size, borderRadius: "6px", flexShrink: 0 }}
        >
          <rect width="24" height="24" rx="6" fill="#FF671B" />
          <path
            d="M6.8 7.5C6.8 7.5 6.8 13.2 12 16.5C17.2 13.2 17.2 7.5 17.2 7.5"
            stroke="white"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M9.4 7.5C9.4 7.5 9.4 11.2 12 13C14.6 11.2 14.6 7.5 14.6 7.5"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );

    case "atb":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          role="img"
          aria-label={label}
          style={{ width: size, height: size, borderRadius: "6px", flexShrink: 0 }}
        >
          <rect width="24" height="24" rx="6" fill="#0A2240" />
          <text
            x="11"
            y="15.8"
            textAnchor="middle"
            fill="white"
            fontSize="9.5"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="-0.5"
          >
            atb
          </text>
          <circle cx="17.8" cy="8.6" r="1.5" fill="#00C2CB" />
        </svg>
      );

    case "ziraat":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          role="img"
          aria-label={label}
          style={{ width: size, height: size, borderRadius: "6px", flexShrink: 0 }}
        >
          <rect width="36" height="36" rx="8" fill="#E11B22" />
          <path
            d="M10 11H26L13 25H26"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    default: {
      const initial = (bank || "?").trim().charAt(0).toUpperCase();
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={className}
          role="img"
          aria-label={label}
          style={{ width: size, height: size, borderRadius: "6px", flexShrink: 0 }}
        >
          <rect width="24" height="24" rx="6" fill="#4F46E5" />
          <text
            x="12"
            y="16.5"
            textAnchor="middle"
            fill="white"
            fontSize="12"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {initial}
          </text>
        </svg>
      );
    }
  }
};
