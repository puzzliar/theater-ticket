// LINE などで届いた日程テキストを予定(稽古・本番)に展開するパーサー。
// 「10/12(日) 13:00-17:00 稽古 @区民センター」のような行を 1 行 1 件(時間帯が複数なら複数件)に分解する。
// 日付だけの行は、続く時間だけの行の日付になる。サーバーでもクライアントでも使えるよう純粋関数で書く。

export type ParsedKind = "rehearsal" | "performance" | "other";

export interface ParsedItem {
  date: string; // YYYY-MM-DD
  from: string; // HH:MM
  to: string; // HH:MM
  kind: ParsedKind;
  title: string;
  location: string;
  raw: string;
  warnings: string[];
}

export interface ParseResult {
  items: ParsedItem[];
  skipped: { line: string; reason: string }[];
}

const RANGE = "[〜~\\-–—―]";
const DATE_RE = new RegExp(`(?:(\\d{4})[\\/.年])?(\\d{1,2})[\\/.月](\\d{1,2})日?`, "g");
const DATE_TAIL_RANGE = new RegExp(`^\\s*${RANGE}\\s*(?:(\\d{1,2})[\\/.月])?(\\d{1,2})(?![:：時\\d])日?`);
const TIME_RANGE_RE = new RegExp(`(\\d{1,2})(?::(\\d{2})|時(半)?)?\\s*${RANGE}\\s*(\\d{1,2})(?::(\\d{2})|時(半)?)?`, "g");
const TIME_OPEN_RE = new RegExp(`(\\d{1,2})(?::(\\d{2})|時(半)?)\\s*${RANGE}(?!\\s*\\d)`, "g");
const TIME_SINGLE_RE = /(?:開演|開始|集合|入り|から)?\s*(\d{1,2})(?::(\d{2})|時(半)?)(?:\s*(?:開演|開始|集合|入り|から|スタート))?/g;
const WEEKDAY_RE = /[(（]\s*[日月火水木金土祝休][・/]?[日月火水木金土祝休]?\s*[)）]/g;
const LOCATION_RE = /(?:[@＠]\s*([^\s@＠,、]+)|(?:場所|会場|稽古場)\s*[:：]?\s*([^\s,、]+))/;

const DEFAULT_DURATION: Record<ParsedKind, number> = { rehearsal: 180, performance: 120, other: 120 };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function hm(h: number, m: number) {
  return `${pad(h)}:${pad(m)}`;
}
function toMinutes(h: string, m: string | undefined, half: string | undefined): number {
  return Number(h) * 60 + (m ? Number(m) : half ? 30 : 0);
}
function fromMinutes(min: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, min));
  return hm(Math.floor(clamped / 60), clamped % 60);
}
function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function inferYear(month: number, today: string): number {
  const [ty, tm] = today.split("-").map(Number);
  // 2 か月以上前の月なら来年の予定と見なす(年末に翌年 1〜2 月の日程が届く)
  return month < tm - 1 ? ty + 1 : ty;
}
export function detectKind(text: string): ParsedKind {
  if (/本番|公演|開演|ステージ|回目|マチネ|ソワレ|昼公演|夜公演|初日|千秋楽|大千秋楽/.test(text)) return "performance";
  if (/ゲネ|GP|場当たり|小屋入り|仕込み|バラシ|搬入|搬出|顔合わせ|顔寄せ|打ち上げ|衣裳合わせ|写真撮影|宣材|オーディション|面談|ミーティング|MTG|打合せ|打ち合わせ/i.test(text)) return "other";
  return "rehearsal";
}

export function parseScheduleText(text: string, opts: { today: string; defaultLocation?: string }): ParseResult {
  const items: ParsedItem[] = [];
  const skipped: ParseResult["skipped"] = [];
  let currentDates: string[] | null = null;

  const lines = text
    .normalize("NFKC")
    .split(/\r?\n/)
    .map((l) => l.replace(WEEKDAY_RE, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const rawLine of lines) {
    let rest = rawLine;
    const dates: string[] = [];
    const warnings: string[] = [];

    // 日付(範囲つきなら展開)
    DATE_RE.lastIndex = 0;
    const m = DATE_RE.exec(rest);
    if (m) {
      const year = m[1] ? Number(m[1]) : inferYear(Number(m[2]), opts.today);
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (!validDate(year, month, day)) {
        skipped.push({ line: rawLine, reason: "日付として読めませんでした" });
        continue;
      }
      let consumed = m[0].length;
      const tail = rest.slice(m.index + consumed).match(DATE_TAIL_RANGE);
      let endMonth = month;
      let endDay = day;
      if (tail) {
        endMonth = tail[1] ? Number(tail[1]) : month;
        endDay = Number(tail[2]);
        if (validDate(year, endMonth, endDay)) consumed += tail[0].length;
        else {
          endMonth = month;
          endDay = day;
        }
      }
      const start = Date.UTC(year, month - 1, day);
      const end = Date.UTC(endMonth < month ? year + 1 : year, endMonth - 1, endDay);
      const days = Math.min(31, Math.max(0, Math.round((end - start) / 86400000)));
      for (let i = 0; i <= days; i++) {
        const d = new Date(start + i * 86400000);
        dates.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
      }
      rest = (rest.slice(0, m.index) + " " + rest.slice(m.index + consumed)).trim();
    }

    // 時間帯(複数可)
    const slots: { from: number; to: number | null }[] = [];
    rest = rest.replace(TIME_RANGE_RE, (_all, h1, m1, half1, h2, m2, half2) => {
      slots.push({ from: toMinutes(h1, m1, half1), to: toMinutes(h2, m2, half2) });
      return " ";
    });
    rest = rest.replace(TIME_OPEN_RE, (_all, h1, m1, half1) => {
      slots.push({ from: toMinutes(h1, m1, half1), to: null });
      return " ";
    });
    if (slots.length === 0) {
      rest = rest.replace(TIME_SINGLE_RE, (all, h1, m1, half1) => {
        if (!m1 && !half1 && !/時/.test(all)) return all; // 「3名」などの数字は時刻として扱わない
        slots.push({ from: toMinutes(h1, m1, half1), to: null });
        return " ";
      });
    }

    // 場所・種別・タイトル
    let location = opts.defaultLocation ?? "";
    const loc = rest.match(LOCATION_RE);
    if (loc) {
      location = (loc[1] ?? loc[2] ?? "").trim();
      rest = rest.replace(loc[0], " ");
    }
    const kind = detectKind(rest);
    const title = rest
      .replace(/^[\s,、。:：・/\-–—〜~()（）]+|[\s,、。:：・/\-–—〜~()（）]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 60);

    const targetDates = dates.length ? dates : currentDates;
    if (dates.length) currentDates = dates;

    if (!targetDates) {
      skipped.push({ line: rawLine, reason: "日付が見つかりません" });
      continue;
    }
    if (slots.length === 0) {
      if (dates.length && !title) continue; // 日付だけの行: 以降の行の日付として使う
      if (dates.length && /終日|一日|全日/.test(title)) {
        slots.push({ from: 10 * 60, to: 22 * 60 });
        warnings.push("終日として 10:00〜22:00 で登録します");
      } else if (dates.length) {
        slots.push({ from: 13 * 60, to: null });
        warnings.push("時間が読めなかったため 13:00 開始の仮の時間です");
      } else {
        skipped.push({ line: rawLine, reason: "時間が見つかりません" });
        continue;
      }
    }

    for (const date of targetDates) {
      for (const s of slots) {
        const w = [...warnings];
        let from = s.from;
        let to = s.to;
        if (from >= 24 * 60) {
          w.push("開始時刻が 24 時以降のため 23:59 にしました");
          from = 23 * 60 + 59;
        }
        if (to === null) {
          to = Math.min(23 * 60 + 59, from + DEFAULT_DURATION[kind]);
          w.push("終了時刻が無いため仮の終了時刻です");
        }
        if (to <= from) {
          if (to < 12 * 60 && from >= 12 * 60) to = Math.min(23 * 60 + 59, to + 12 * 60); // 「1〜5」のような 12 時間表記
          else {
            to = Math.min(23 * 60 + 59, from + DEFAULT_DURATION[kind]);
            w.push("終了が開始より前だったため仮の終了時刻です");
          }
        }
        items.push({ date, from: fromMinutes(from), to: fromMinutes(to), kind, title, location, raw: rawLine, warnings: w });
      }
    }
  }
  items.sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from));
  return { items, skipped };
}
