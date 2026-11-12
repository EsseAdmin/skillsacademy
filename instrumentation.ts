export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureSeed } = await import("./lib/seed");
      await ensureSeed();
    } catch (err) {
      // Never take the whole instance down because start-up seeding lost a race with another
      // instance (or the database blipped): log it, and the first request sets things up again.
      console.error("[startup] seeding failed — continuing:", err);
    }
  }
}
