export function errorMessage(err: unknown, fallback = "Unbekannter Fehler"): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object" && typeof (data as { message?: unknown }).message === "string") {
      return (data as { message: string }).message;
    }
    if (err instanceof Error && err.message) return err.message;
  }
  return fallback;
}

export const exportDownloadUrl = () => `${window.location.origin}/api/export`;
