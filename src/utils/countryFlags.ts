export const countryCodeToFlag = (countryCode: string | null | undefined): string =>
  String(countryCode || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);

const neutralFlagDataUrl =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='12' viewBox='0 0 20 12'%3E%3Crect width='20' height='12' rx='2' fill='%230f1f3b'/%3E%3Ccircle cx='10' cy='6' r='4' fill='none' stroke='%23d7e3ff' stroke-width='1'/%3E%3Cpath d='M6 6h8M10 2v8M7.2 3.3c.8.5 1.8.7 2.8.7s2-.2 2.8-.7M7.2 8.7c.8-.5 1.8-.7 2.8-.7s2 .2 2.8.7' fill='none' stroke='%23d7e3ff' stroke-width='.7' stroke-linecap='round'/%3E%3C/svg%3E";

export const countryCodeToFlagUrl = (countryCode: string | null | undefined): string => {
  const normalized = countryCodeToFlag(countryCode);
  return normalized ? `https://flagcdn.com/${normalized.toLowerCase()}.svg` : neutralFlagDataUrl;
};
