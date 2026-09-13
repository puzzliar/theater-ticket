// iCalendar (RFC 5545) フィード生成。Google/Apple/Outlook カレンダーの「URLで追加」から購読する。

export interface IcsEvent {
  uid: string;
  start: string; // ISO
  end: string; // ISO
  summary: string;
  description?: string;
  location?: string;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  updated?: string; // ISO
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// 75オクテット折返し(RFC 5545 3.1)。日本語はUTF-8で多バイトのため文字数ではなくバイトで区切る
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    const limit = out.length === 0 ? 75 : 74; // 継続行は先頭スペース分を引く
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ch;
      curBytes = b;
    } else {
      cur += ch;
      curBytes += b;
    }
  }
  if (cur) out.push(cur);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join("\r\n");
}

export function buildIcs(calendarName: string, events: IcsEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PUZZLIAR//Rehearsal//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    // Google は再取得間隔を独自に決めるが、ヒントとして短めの間隔を宣言しておく
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  const now = icsDate(new Date().toISOString());
  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.uid}`);
    lines.push(`DTSTAMP:${ev.updated ? icsDate(ev.updated) : now}`);
    lines.push(`DTSTART:${icsDate(ev.start)}`);
    lines.push(`DTEND:${icsDate(ev.end)}`);
    lines.push(`SUMMARY:${esc(ev.summary)}`);
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
    lines.push(`STATUS:${ev.status ?? "CONFIRMED"}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
