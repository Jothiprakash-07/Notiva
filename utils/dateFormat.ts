const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Read local calendar fields explicitly so device locale cannot reorder the date.
export function formatDate(date: Date, style: "long" | "short" | "shortYear" | "compact" = "long"): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  if (style === "compact") return `${day}/${String(date.getMonth() + 1).padStart(2, "0")}/${year}`;
  if (style === "short") return `${day} ${month.slice(0, 3)}`;
  if (style === "shortYear") return `${day} ${month.slice(0, 3)} ${year}`;
  return `${day} ${month} ${year}`;
}

export function formatTime(date: Date): string {
  const hour = date.getHours();
  return `${String(hour % 12 || 12).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
