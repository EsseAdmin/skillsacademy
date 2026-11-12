// Client-side helper: stops an over-large file before the browser starts a slow upload that the
// server (Netlify caps request bodies at ~6MB) could only fail with a timeout.
export function guardFileSize(input: HTMLInputElement, maxBytes: number, hint: string): void {
  const file = input.files?.[0];
  if (file && file.size > maxBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    input.setCustomValidity(`That file is ${mb}MB - the limit is ${Math.round(maxBytes / (1024 * 1024))}MB. ${hint}`);
    input.reportValidity();
    input.value = "";
  } else {
    input.setCustomValidity("");
  }
}
