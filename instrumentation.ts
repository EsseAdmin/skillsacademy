export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSeed } = await import("./lib/seed");
    await ensureSeed();
  }
}
