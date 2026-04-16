export const appAssetPath = (pathname = "/") => {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${import.meta.env.BASE_URL}${normalized.slice(1)}`;
};
