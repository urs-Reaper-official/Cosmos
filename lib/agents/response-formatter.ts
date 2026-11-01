export function formatAssistantResponse(text: string) {
  const formatted = text.replaceAll("\u0000", "").trim();
  if (!formatted) throw new Error("The model returned an empty response.");
  return formatted;
}
