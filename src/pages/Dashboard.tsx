import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/** Layouthdan gələn rəng sinifləri */
type Colors = {
  card: string;
  kpiLabel: string;
  chip: string;
  tableHead: string;
  grid: string;
};

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

/* ------- Demo datalar ------- */
const kpis = [
  { title: "Hasilat", value: 1_216_354.32 },
  { title: "Satışların maya dəyəri", value: 798_317.2 },
  { title: "Mənfəət", value: 418_037.12 },
  { title: "Orta çek", value: 1_961.86 },
];

const series = [
  { name: "yanvar", value: 198000 },
  { name: "fevral", value: 68000 },
  { name: "mart", value: 82000 },
  { name: "aprel", value: 255000 },
  { name: "may", value: 285000 },
  { name: "iyun", value: 110000 },
  { name: "iyul", value: 125000 },
  { name: "avqust", value: 72000 },
  { name: "sentyabr", value: 21000 },
  { name: "oktyabr", value: 23000 },
  { name: "noyabr", value: 23500 },
  { name: "dekabr", value: 24500 },
];

const docs = [
  { ad: "Satış", miqdar: 29, mebleg: 20795.02, anbar: 5512.5 },
  { ad: "Alış", miqdar: 1, mebleg: 6072.9, anbar: 1945 },
  { ad: "Satışın geri qaytarılması", miqdar: 0, mebleg: 0, anbar: 0 },
  { ad: "Alışın geri qaytarılması", miqdar: 0, mebleg: 0, anbar: 0 },
  { ad: "Düzəliş", miqdar: 0, mebleg: 0, anbar: 0 },
];

/* ------- Səhifə komponenti ------- */
export default function Dashboard({ colors }: { colors: Colors }) {
  return (
    <>
      {/* KPI-lər */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div
            key={k.title}
            className={cx("p-4 rounded-2xl shadow-sm border", colors.card)}
          >
            <div
              className={cx(
                "text-[11px] uppercase tracking-wide mb-2 h-5 whitespace-nowrap overflow-hidden text-ellipsis",
                colors.kpiLabel
              )}
              title={k.title}
            >
              {k.title}
            </div>
            <div className="text-2xl font-semibold tabular-nums leading-none">
              {k.title === "Orta çek"
                ? k.value.toLocaleString("az-Latn-AZ", {
                    maximumFractionDigits: 2,
                  })
                : k.value.toLocaleString("az-Latn-AZ", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
            </div>
          </div>
        ))}
      </div>

      {/* Qrafik */}
      <div className={cx("p-4 rounded-2xl shadow-sm border", colors.card)}>
        <div className="flex items-center gap-3 mb-4">
          <span
            className={cx("px-2 py-1 text-xs rounded-full", colors.chip)}
          >
            Hasilat
          </span>
          <span className={cx("text-sm", colors.kpiLabel)}>İl boyu</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ left: 0, right: 0, top: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
                  <stop offset="90%" stopColor="#6366f1" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: colors.grid }}
              />
              <Tooltip
                formatter={(v: unknown) =>
                  Number(v).toLocaleString("az-Latn-AZ")
                }
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#area)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sənədlər — zolaqsız, aralıq xəttsiz */}
      <div className={cx("rounded-2xl shadow-sm border", colors.card)}>
        {/* Başlıqda border-bottom YOXDUR */}
        <div className="p-4 pb-3">
          <h2 className="text-sm font-semibold tracking-tight">Sənədlər</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className={colors.tableHead}>
                <th className="text-left font-medium px-4 py-2 first:pl-6 last:pr-6">
                  Ad
                </th>
                <th className="text-left font-medium px-4 py-2">Miqdar</th>
                <th className="text-left font-medium px-4 py-2">Məbləğ</th>
                <th className="text-left font-medium px-4 py-2 last:pr-6">
                  Anbar
                </th>
              </tr>
            </thead>
            {/* Burada divide-y/zolaq YOXDUR */}
            <tbody>
              {docs.map((d) => (
                <tr key={d.ad}>
                  <td className="px-4 py-2 first:pl-6 last:pr-6">{d.ad}</td>
                  <td className="px-4 py-2 tabular-nums">{d.miqdar}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {d.mebleg.toLocaleString("az-Latn-AZ", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-2 last:pr-6 tabular-nums">
                    {d.anbar.toLocaleString("az-Latn-AZ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
