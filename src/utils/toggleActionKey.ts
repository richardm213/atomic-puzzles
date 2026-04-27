export const isToggleActionKey = (event: { key: string }): boolean =>
  event.key === "Enter" || event.key === " ";
