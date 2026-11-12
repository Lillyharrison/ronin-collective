export function repairNotificationBody(
  reporterName: string | null | undefined,
  existingBody?: string | null,
  language = "en",
): string | undefined {
  const name = reporterName?.trim();
  const body = language === "es"
    ? existingBody?.replace(/^Location:/, "Ubicación:")
    : existingBody;
  return [name ? `${language === "es" ? "Reportado por" : "Reported by"} ${name}` : undefined, body]
    .filter(Boolean).join(" · ") || undefined;
}