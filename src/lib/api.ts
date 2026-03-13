export async function fetchJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  const data = (await response.json()) as T;

  if (!response.ok) {
    const error =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : typeof data === "object" &&
            data !== null &&
            "message" in data &&
            typeof data.message === "string"
          ? data.message
        : "Unexpected API response";

    throw new Error(error);
  }

  return data;
}
