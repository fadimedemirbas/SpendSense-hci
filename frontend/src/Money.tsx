import { useState } from "react";
import { Plus, Pencil, Trash2, MessageCircleQuestionMark, Delete } from "lucide-react";
import { useApp } from "./context";
import {
  Button,
  Card,
  Empty,
  PageHead,
  Segmented,
  Sheet,
  Tile,
  useT,
  useToast,
  fmt,
  Blob,
  curLabel,
} from "./ui";
import { EXP_CATS, INC_CATS, catIcon, uid, today, type Entry, type EType } from "./store";

export function dayLabel(iso: string, t: (s: string) => string) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return iso === today()
    ? t("Today")
    : iso === y.toISOString().slice(0, 10)
      ? t("Yesterday")
      : new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
export function EntryRow({ e, actions }: { e: Entry; actions?: boolean }) {
  const { setQuickAdd, entries, setEntries } = useApp();
  const t = useT();
  const toast = useToast();
  const I = catIcon(e.type, e.cat);
  return (
    <li className="entry-row flex items-center gap-3 py-3 border-t border-cardline first:border-0">
      <span
        className={`w-11 h-11 rounded-inner flex items-center justify-center shrink-0 ${e.type === "income" ? "bg-leaftint text-leaf" : "bg-peach text-ink"}`}
      >
        <I size={20} aria-hidden />
      </span>
      <span className="flex-1 min-w-0">
        <span className="line-clamp-2 font-medium">{e.name}</span>
        <span className="text-sm text-soft">
          {t(e.cat)} · {dayLabel(e.date, t)}
        </span>
      </span>
      <span
        className={`f-num text-lg shrink-0 whitespace-nowrap ${e.type === "income" ? "text-leaf" : ""}`}
      >
        {e.type === "income" ? "+" : "−"}
        {fmt(e.amount)}
      </span>
      {actions && (
        <span className="entry-actions contents">
          <button
            aria-label={`${t("Edit")} ${e.name}`}
            onClick={() => setQuickAdd(e)}
            className="btn clay-cream w-11 px-0!"
          >
            <Pencil size={16} />
          </button>
          <button
            aria-label={`${t("Delete")} ${e.name}`}
            onClick={async () => {
              const prev = entries;
              if (!(await setEntries(entries.filter((x) => x.id !== e.id)))) return;
              toast(t("Entry deleted."), () => setEntries(prev));
            }}
            className="btn clay-cream w-11 px-0!"
          >
            <Trash2 size={16} />
          </button>
        </span>
      )}
    </li>
  );
}

export function Money() {
  const { entries, setQuickAdd } = useApp();
  const t = useT();
  const [type, setType] = useState<"all" | EType>("all");
  const [cat, setCat] = useState("all");
  const cats =
    type === "income"
      ? INC_CATS
      : type === "expense"
        ? EXP_CATS
        : [...EXP_CATS, ...INC_CATS.filter((c) => c[0] !== "Other")];
  const list = entries
    .filter((e) => (type === "all" || e.type === type) && (cat === "all" || e.cat === cat))
    .sort((a, b) => b.date.localeCompare(a.date));
  const groups = list.reduce<Record<string, Entry[]>>(
    (g, e) => ((g[e.date] ??= []).push(e), g),
    {},
  );
  return (
    <>
      <PageHead
        title={t("Money")}
        action={
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="leaf"
              icon={<Plus size={18} />}
              onClick={() => setQuickAdd("new-income")}
            >
              {t("Add income")}
            </Button>
            <Button variant="coral" icon={<Plus size={18} />} onClick={() => setQuickAdd("new")}>
              {t("Add expense")}
            </Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-3 items-center">
        <Segmented
          label={t("Type")}
          value={type}
          onChange={(v) => {
            setType(v);
            setCat("all");
          }}
          options={[
            ["all", t("All")],
            ["expense", t("Expenses")],
            ["income", t("Income")],
          ]}
        />
        <label className="f-ui flex items-center gap-2">
          <span className="sr-only">{t("Category")}</span>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="min-h-11 rounded-full clay-cream px-4"
          >
            <option value="all">{t("All categories")}</option>
            {cats.map(([c]) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {Object.keys(groups).length === 0 ? (
        <Card>
          <Empty
            text={t("Nothing here yet. Want to start together?")}
            action={
              <Button variant="coral" onClick={() => setQuickAdd("new")}>
                {t("Add entry")}
              </Button>
            }
          />
        </Card>
      ) : (
        Object.entries(groups).map(([d, es]) => (
          <Card key={d}>
            <h2 className="f-ui text-soft text-sm m-0 mb-1">{dayLabel(d, t)}</h2>
            <ul className="m-0 p-0 list-none">
              {es.map((e) => (
                <EntryRow key={e.id} e={e} actions />
              ))}
            </ul>
          </Card>
        ))
      )}
    </>
  );
}

export function QuickAdd() {
  const { quickAdd, setQuickAdd, entries, setEntries, openDecide, setTab } = useApp();
  const t = useT();
  const toast = useToast();
  const edit = typeof quickAdd === "object" ? quickAdd : null;
  const [type, setType] = useState<EType>(
    edit?.type ?? (quickAdd === "new-income" ? "income" : "expense"),
  );
  const [amt, setAmt] = useState(edit ? String(edit.amount) : "");
  const [cat, setCat] = useState(edit?.cat ?? "");
  const [note, setNote] = useState(edit?.name ?? "");
  const [date, setDate] = useState(edit?.date ?? today());
  const [err, setErr] = useState<{ a?: string; c?: string }>({});
  const [saved, setSaved] = useState(false);
  const typed = (n: string) => {
    n = n.replace(",", ".");
    if (n === "" || /^\d{1,8}(\.\d{0,2})?$/.test(n)) setAmt(n.replace(/^0(\d)/, "$1"));
  };
  const key = (k: string) => (k === "del" ? setAmt(amt.slice(0, -1)) : typed(amt + k));
  const v = parseFloat(amt.replace(",", ".")) || 0;
  const close = () => setQuickAdd(null);
  const save = async () => {
    const e = {
      a: v > 0 && cat ? undefined : t("Enter an amount and pick a category."),
      c: undefined as string | undefined,
    };
    if (!e.a && date > today()) e.a = t("Pick today or an earlier date.");
    setErr(e);
    if (e.a || e.c) return;
    const entry: Entry = {
      id: edit?.id ?? uid(),
      type,
      amount: v,
      cat,
      name: note.trim() || t(cat),
      date,
    };
    const prev = entries;
    if (
      !(await setEntries(
        edit ? entries.map((x) => (x.id === edit.id ? entry : x)) : [entry, ...entries],
      ))
    )
      return;
    toast(`${t(edit ? "Entry updated." : "Entry saved.")} · ${fmt(v)} · ${t(cat)}`, () =>
      setEntries(prev),
    );
    setSaved(true);
    setTimeout(close, 900);
  };
  if (saved)
    return (
      <Sheet title={t("Quick add")} onClose={close}>
        <div className="flex flex-col items-center gap-3 py-6">
          <Blob expr="happy" size={96} className="rise" />
          <p role="status" className="f-voice text-xl m-0">
            {t("All set! I've added that to your month.")}
          </p>
        </div>
      </Sheet>
    );
  return (
    <Sheet title={edit ? t("Edit entry") : t("Quick add")} onClose={close}>
      <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5">
        <div className="grid gap-3 content-start">
          <Segmented
            full
            label={t("Type")}
            value={type}
            onChange={(x) => {
              setType(x);
              setCat("");
            }}
            options={[
              ["expense", t("Expense")],
              ["income", t("Income")],
            ]}
          />
          <label className="f-ui grid gap-1">
            {t("Amount")} ({curLabel()})
            <input
              inputMode="decimal"
              placeholder="0"
              value={amt}
              onChange={(e) => typed(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void save()}
              aria-invalid={!!err.a}
              aria-describedby={err.a ? "amt-err" : undefined}
              className="f-num text-5xl rounded-tile bg-white border border-line px-4 py-4 text-right w-full min-w-0"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
              <button
                key={k}
                onClick={() => key(k)}
                aria-label={k === "del" ? t("Delete last digit") : k}
                className="btn clay-cream f-num text-[22px] min-h-[54px]! rounded-tile!"
              >
                {k === "del" ? <Delete size={20} /> : k}
              </button>
            ))}
          </div>
          {err.a && (
            <p id="amt-err" role="alert" className="m-0 text-sm text-danger">
              {err.a}
            </p>
          )}
          <label className="f-ui grid gap-1">
            {t("Date")}
            <input
              type="date"
              max={today()}
              value={date}
              onChange={(e) => setDate(e.target.value || today())}
              className="h-13 rounded-tile border border-line bg-white px-4 font-sans"
            />
          </label>
          <label className="f-ui grid gap-1">
            {t("Note (optional)")}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-13 rounded-tile border border-line bg-white px-4 font-sans"
            />
          </label>
        </div>
        <div className="grid gap-2 content-start">
          <p className="f-ui m-0">{t("Category")}</p>
          {/* Column count follows the space available: tiles never get narrower
              than the longest category word (e.g. "Subscriptions", "Abonelikler"). */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] gap-2 sm:gap-3">
            {(type === "expense" ? EXP_CATS : INC_CATS).map(([c, I]) => (
              <Tile
                dense
                key={c}
                on={cat === c}
                onClick={() => setCat(c)}
                icon={<I size={22} />}
                label={t(c)}
              />
            ))}
          </div>
          {err.c && (
            <p role="status" className="m-0 text-sm text-attn">
              {err.c}
            </p>
          )}
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-2 justify-end">
          {type === "expense" && v > 0 && !edit && (
            <Button
              icon={<MessageCircleQuestionMark size={18} />}
              onClick={() => {
                close();
                setTab("decide");
                openDecide({ price: v, cat: cat || undefined, name: note || undefined });
              }}
            >
              {t("Not bought yet? Check it first.")}
            </Button>
          )}
          <Button onClick={close}>{t("Cancel")}</Button>
          <Button
            variant={type === "income" ? "leaf" : "coral"}
            big
            onClick={save}
            className={type === "income" ? "bg-leaf! text-white!" : ""}
          >
            {t("Save")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
