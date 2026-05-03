function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function createTimestampedFilename(filename: string, date = new Date()) {
  const timestamp = [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
  const time = [padDatePart(date.getHours()), padDatePart(date.getMinutes())].join("-");

  return `${timestamp}_${time}_${filename}`;
}

export function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
