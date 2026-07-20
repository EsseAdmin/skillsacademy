export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSeed } = await import("./src/lib/seed");
    await ensureSeed();
  }
}
