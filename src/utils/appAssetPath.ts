export const appAssetPath = (pathname: string = "/"): string => {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${import.meta.env.BASE_URL}${normalized.slice(1)}`;
};
