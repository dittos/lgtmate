export async function fetchJson<T>(input: string) {
  const response = await fetch(input);
  const data = (await response.json()) as T;

  if (!response.ok) {
    const error =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Unexpected API response";

    throw new Error(error);
  }

  return data;
}
